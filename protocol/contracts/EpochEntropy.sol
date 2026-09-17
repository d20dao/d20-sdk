// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

/// @notice Fixed signed market-data and block-hash recipes, published on demand for each 200-block epoch.
contract EpochEntropy is Ownable2StepUpgradeable, UUPSUpgradeable {
    uint64 public constant EPOCH_LENGTH = 200;
    // Attestation freshness at publication; the keeper enforces the same bound before sending.
    uint256 public constant MAX_ATTESTATION_AGE = 240 seconds;
    uint256 public constant MAX_PACKET_BYTES = 2048;
    // Deterministic source fallback: attempt n commits the source n slots after the selected one, and only once
    // n × FALLBACK_DELAY_BLOCKS blocks of the epoch have passed. Randomness still binds a later target block hash.
    uint64 public constant FALLBACK_DELAY_BLOCKS = 20;
    // A catalog lists 1 to MAX_SOURCES distinct recipes, so its last fallback window opens inside the epoch.
    uint256 public constant MAX_SOURCES = 10;
    uint8 public constant RECIPE_COUNT = 8;
    bytes32 public constant RECIPE_DOMAIN = keccak256("D20_EPOCH_RECIPES");
    bytes32 public constant SELECT_DOMAIN = keccak256("D20_EPOCH_SELECT");
    bytes32 public constant EPOCH_DOMAIN = keccak256("D20_EPOCH");
    // Initial catalog: recipes 0-3 with these signers, bound into catalogHash. These getters never change;
    // the catalog in force for an epoch comes from catalogAt(epoch).
    address public hyperliquidSigner;
    /// @notice Initial-catalog signer of recipe 1, the Ethereum mainnet block hash.
    address public ethereumBlockSigner;
    address public btcTradeSigner;
    address public ethTradeSigner;
    address public committer;
    uint64 public firstEpochStart;
    bytes32 public catalogHash;
    struct Attestation { uint256 timestamp; bytes data; bytes signature; }
    /// @dev source is the slot in the epoch's catalog; recipe is the global recipe id at that slot.
    struct Selection { uint8 source; uint8 recipe; address airnode; bytes32 selector; bytes32 queryHash; string canonicalRequest; }
    struct Epoch {
        bytes32 epochHash; bytes32 catalogHash; bytes32 anchorHash; uint8 source;
        bytes32 queryHash; bytes32 dataHash; bytes32 attestationHash; uint256 signedAt; uint64 committedBlock;
    }
    struct Catalog { uint64 fromEpoch; bytes32 hash; uint8[] recipes; address[] signers; }
    mapping(uint64 => Epoch) private epochs;
    mapping(uint64 => bytes32) public epochAnchors;
    // Length slot of the retired four-signer catalog array. It is zero on every deployed registry and stays unused.
    uint256 private __retiredCatalogVersions;
    // Scheduled catalogs ascending by fromEpoch; epochs before the first entry use the initial catalog.
    Catalog[] private catalogs;
    // Preserve all declared fields/mapping value layouts; consume reserved slots when extending.
    uint256[38] private __gap;
    error InvalidConfig(); error InvalidEpoch(); error PreparationClosed(); error AnchorUnavailable();
    error OnlyCommitter(); error AlreadyCommitted(); error InvalidTime(); error InvalidData(); error InvalidSigner();
    error PacketTooLarge(); error RenounceDisabled();
    error InvalidFallback(); error FallbackNotOpen();
    event EpochCommitted(uint64 indexed epochId, bytes32 indexed epochHash, bytes packet);
    event CommitterChanged(address indexed previousCommitter, address indexed newCommitter);
    event CatalogScheduled(uint64 indexed fromEpoch, bytes32 indexed catalogHash, uint8[] recipes, address[] signers);
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }
    function initialize(address[4] memory signers, address initialOwner, address initialCommitter) external initializer {
        __Ownable_init(initialOwner);
        __Ownable2Step_init();
        if(signers[0]==address(0)||signers[1]==address(0)||signers[2]==address(0)||signers[3]==address(0)||initialCommitter==address(0)) revert InvalidConfig();
        hyperliquidSigner=signers[0]; ethereumBlockSigner=signers[1]; btcTradeSigner=signers[2]; ethTradeSigner=signers[3]; committer=initialCommitter;
        firstEpochStart=uint64(block.number)+EPOCH_LENGTH;
        catalogHash=keccak256(abi.encode(RECIPE_DOMAIN,signers));
    }
    function _authorizeUpgrade(address) internal override onlyOwner {}
    /// @notice Upgrade authority can only move through the two-step transfer; it can never be abandoned.
    function renounceOwnership() public view override onlyOwner { revert RenounceDisabled(); }

    function setCommitter(address next) external onlyOwner {
        if(next==address(0)) revert InvalidConfig();
        emit CommitterChanged(committer,next); committer=next;
    }
    /// @notice Schedule a catalog of distinct recipes and their signers for epochs >= fromEpoch, at least two
    /// epochs ahead; a pending version is replaced.
    /// @dev catalogHash() and the initial signer getters never change, so protocolConfigurationHash and keeper pins never move.
    function scheduleCatalog(uint8[] calldata recipes, address[] calldata signers, uint64 fromEpoch) external onlyOwner {
        uint256 count=recipes.length;
        if(count==0||count>MAX_SOURCES||signers.length!=count) revert InvalidConfig();
        uint256 seen;
        for(uint256 i;i<count;++i) {
            uint8 recipe=recipes[i];
            if(recipe>=RECIPE_COUNT||seen&(1<<recipe)!=0||signers[i]==address(0)) revert InvalidConfig();
            seen|=1<<recipe;
        }
        uint64 current=epochForBlock(block.number);
        if(fromEpoch<current+2) revert InvalidEpoch();
        uint256 versions=catalogs.length;
        if(versions!=0&&catalogs[versions-1].fromEpoch>current) catalogs.pop();
        bytes32 hash=keccak256(abi.encode(RECIPE_DOMAIN,recipes,signers));
        Catalog storage c=catalogs.push();
        c.fromEpoch=fromEpoch; c.hash=hash; c.recipes=recipes; c.signers=signers;
        emit CatalogScheduled(fromEpoch,hash,recipes,signers);
    }
    /// @notice The catalog an epoch selects and commits with: its hash and the recipe and signer of each slot.
    function catalogAt(uint64 epochId) public view returns(bytes32 hash, uint8[] memory recipes, address[] memory signers) {
        uint256 version=_versionAt(epochId);
        if(version!=0) { Catalog storage c=catalogs[version-1]; return (c.hash,c.recipes,c.signers); }
        recipes=new uint8[](4); signers=new address[](4);
        (recipes[1],recipes[2],recipes[3])=(1,2,3);
        (signers[0],signers[1],signers[2],signers[3])=(hyperliquidSigner,ethereumBlockSigner,btcTradeSigner,ethTradeSigner);
        hash=catalogHash;
    }
    /// @notice Number of sources, and so of selection attempts (0 to count-1), for an epoch.
    function sourceCountAt(uint64 epochId) public view returns(uint256) {
        uint256 version=_versionAt(epochId);
        return version==0?4:catalogs[version-1].recipes.length;
    }
    /// @dev One plus the index of the scheduled catalog in force for an epoch; zero selects the initial catalog.
    function _versionAt(uint64 epochId) private view returns(uint256) {
        for(uint256 i=catalogs.length;i>0;--i) if(epochId>=catalogs[i-1].fromEpoch) return i;
        return 0;
    }
    function epochStart(uint64 epochId) public view returns(uint64) {
        if(epochId==0) revert InvalidEpoch();
        return firstEpochStart+(epochId-1)*EPOCH_LENGTH;
    }
    function epochForBlock(uint256 number) public view returns(uint64) {
        return number<firstEpochStart?0:uint64(1+(number-firstEpochStart)/EPOCH_LENGTH);
    }
    function nextEpochToPrepare(uint256 number) external view returns(uint64) { return epochForBlock(number); }
    /// @notice Preserve the canonical source selector without publishing any API data.
    /// @dev Requests call this while their epoch's start-1 block is within BLOCKHASH range.
    function checkpointEpoch(uint64 epochId) public returns(bytes32 anchor) {
        anchor=_anchor(epochId);
        if(epochAnchors[epochId]==bytes32(0)) epochAnchors[epochId]=anchor;
    }
    function _anchor(uint64 epochId) private view returns(bytes32 anchor) {
        uint64 start=epochStart(epochId);
        if(block.number<start) revert PreparationClosed();
        anchor=epochAnchors[epochId];
        if(anchor==bytes32(0)) anchor=blockhash(start-1);
        if(anchor==bytes32(0)) revert AnchorUnavailable();
    }
    function getEpoch(uint64 epochId) external view returns(Epoch memory) { return epochs[epochId]; }
    function getEpochSelection(uint64 epochId) external view returns(Selection memory s) { (s,)=_select(epochId,0); }
    /// @notice Source, recipe, signer and query for a fallback attempt (0 is the selected source).
    function getEpochFallbackSelection(uint64 epochId,uint8 attempt) external view returns(Selection memory s) { (s,)=_select(epochId,attempt); }
    /// @notice First block at which an attempt may be committed; attempt 0 opens at the epoch start.
    function fallbackOpensAt(uint64 epochId,uint8 attempt) public view returns(uint64) {
        if(attempt>=sourceCountAt(epochId)) revert InvalidFallback();
        return epochStart(epochId)+uint64(attempt)*FALLBACK_DELAY_BLOCKS;
    }
    /// @dev Selection and commitment use the catalog in force for the epoch being selected, not the initial one.
    function _select(uint64 epochId,uint8 attempt) private view returns(Selection memory s,bytes32 catalog) {
        bytes32 anchor=_anchor(epochId);
        uint8[] memory recipes; address[] memory signers;
        (catalog,recipes,signers)=catalogAt(epochId);
        if(attempt>=recipes.length) revert InvalidFallback();
        s.selector=keccak256(abi.encode(SELECT_DOMAIN,catalog,epochId,anchor));
        s.source=uint8((uint256(s.selector)%recipes.length+attempt)%recipes.length);
        s.recipe=recipes[s.source];
        s.airnode=signers[s.source];
        s.canonicalRequest=recipeRequest(s.recipe);
        s.queryHash=keccak256(bytes(s.canonicalRequest));
    }
    /// @notice AirnodeHub canonical request of a recipe: objects sorted by key at every depth, arrays in order.
    function recipeRequest(uint8 recipe) public pure returns(string memory) {
        if(recipe==0) return '["metaAndAssetCtxs",[["dex",""]],[["symbol","/0/universe/0/name"],["value","/1/0/dayNtlVlm"]]]';
        // dRPC eth_call of Multicall3 getLastBlockHash() at "latest" on Ethereum mainnet (1) and Base (6).
        if(recipe==1) return '["jsonRpc",[["method","eth_call"],["network","ethereum"],["params",[[["data","0x27e86d6e"],["to","0xcA11bde05977b3631167028862bE2a173976CA11"]],"latest"]]]]';
        if(recipe==2) return '["lastTrade",[["assetClass","crypto"],["symbol","BTCUSD"]]]';
        if(recipe==3) return '["lastTrade",[["assetClass","crypto"],["symbol","ETHUSD"]]]';
        if(recipe==4) return '["latestFeeds",[["name","ETH/USD"]]]';
        if(recipe==5) return '["allMids",[],[["mid","/SOL"]]]';
        if(recipe==6) return '["jsonRpc",[["method","eth_call"],["network","base"],["params",[[["data","0x27e86d6e"],["to","0xcA11bde05977b3631167028862bE2a173976CA11"]],"latest"]]]]';
        if(recipe==7) return '["latestFeeds",[["name","BTC/USD"]]]';
        revert InvalidConfig();
    }
    function commitEpoch(uint64 epochId, Attestation calldata a) external { _commit(epochId,0,a); }
    /// @notice Publish the source attempt slots after the selected one once its fallback window is open.
    function commitEpochFallback(uint64 epochId, uint8 attempt, Attestation calldata a) external {
        if(attempt==0) revert InvalidFallback();
        _commit(epochId,attempt,a);
    }
    function _commit(uint64 epochId, uint8 attempt, Attestation calldata a) private {
        if(msg.sender!=committer) revert OnlyCommitter();
        if(epochs[epochId].epochHash!=bytes32(0)) revert AlreadyCommitted();
        if(block.number<fallbackOpensAt(epochId,attempt)) revert FallbackNotOpen();
        (Selection memory s,bytes32 catalog)=_select(epochId,attempt);
        if(a.timestamp>block.timestamp||block.timestamp-a.timestamp>MAX_ATTESTATION_AGE) revert InvalidTime();
        _validate(s.recipe,a.data);
        bytes32 digest=keccak256(abi.encodePacked(s.queryHash,a.timestamp,a.data));
        if(ECDSA.recover(MessageHashUtils.toEthSignedMessageHash(digest),a.signature)!=s.airnode) revert InvalidSigner();
        bytes32 dataHash=keccak256(a.data);
        bytes32 attestationHash=keccak256(abi.encode(s.queryHash,a.timestamp,dataHash,keccak256(a.signature)));
        bytes32 anchor=checkpointEpoch(epochId);
        // Request randomness always uses a block strictly after this commitment.
        bytes32 commitment=keccak256(abi.encode(EPOCH_DOMAIN,block.chainid,address(this),catalog,epochId,
            epochStart(epochId),anchor,s.source,s.queryHash,dataHash,attestationHash));
        epochs[epochId]=Epoch(commitment,catalog,anchor,s.source,s.queryHash,dataHash,attestationHash,a.timestamp,uint64(block.number));
        bytes memory packet=abi.encode(s.canonicalRequest,a);
        if(packet.length>MAX_PACKET_BYTES) revert PacketTooLarge();
        emit EpochCommitted(epochId,commitment,packet);
    }
    /// @dev The exact signed bytes of a recipe: fixed literals, key order and number grammar, nothing else.
    function _validate(uint8 recipe,bytes calldata data) private pure {
        if(data.length==0||data.length>128) revert InvalidData();
        uint256 p;
        if(recipe==0||recipe==5) {
            // Hyperliquid projections: a nonnegative decimal string.
            p=_literal(data,0,recipe==0?bytes('{"symbol":"BTC","value":"'):bytes('{"mid":"'));
            p=_number(data,p,true,false); p=_literal(data,p,bytes('"}'));
        } else if(recipe==1||recipe==6) {
            // The JSON-RPC envelope of one block hash: 64 lowercase hex characters.
            p=_literal(data,0,bytes('{"id":null,"jsonrpc":"2.0","result":"0x'));
            p=_hex(data,p,64); p=_literal(data,p,bytes('"}'));
        } else if(recipe==2||recipe==3) {
            p=_literal(data,0,recipe==2?bytes('{"symbol":"BTCUSD","price":'):bytes('{"symbol":"ETHUSD","price":'));
            p=_number(data,p,true,true); p=_literal(data,p,bytes(',"size":'));
            p=_number(data,p,true,true); p=_literal(data,p,bytes(',"timestamp":'));
            uint256 first=p; p=_number(data,p,false,false);
            if(data[first]==0x30||p-first>16) revert InvalidData();
            p=_literal(data,p,bytes('}'));
        } else if(recipe==4||recipe==7) {
            // Nodary feed: JSON number value, 13-digit millisecond timestamp, crypto category.
            p=_literal(data,0,recipe==4?bytes('{"ETH/USD":{"value":'):bytes('{"BTC/USD":{"value":'));
            p=_number(data,p,true,true); p=_literal(data,p,bytes(',"timestamp":'));
            uint256 first=p; p=_number(data,p,false,false);
            if(p-first!=13) revert InvalidData();
            p=_literal(data,p,bytes(',"category":"crypto"}}'));
        } else revert InvalidData();
        if(p!=data.length) revert InvalidData();
    }
    function _literal(bytes calldata data,uint256 p,bytes memory literal) private pure returns(uint256) {
        if(p+literal.length>data.length) revert InvalidData();
        for(uint256 i;i<literal.length;++i)if(data[p+i]!=literal[i])revert InvalidData();return p+literal.length;
    }
    function _hex(bytes calldata data,uint256 p,uint256 length) private pure returns(uint256 end) {
        end=p+length;
        if(end>data.length) revert InvalidData();
        for(;p<end;++p) { uint8 c=uint8(data[p]); if(!((c>=48&&c<=57)||(c>=97&&c<=102))) revert InvalidData(); }
    }
    function _digit(bytes1 c) private pure returns(bool){return c>=0x30&&c<=0x39;}
    /// @dev Unsigned JSON number: an integer without leading zeros, then an optional fraction and exponent when allowed.
    function _number(bytes calldata data,uint256 p,bool fraction,bool exponent) private pure returns(uint256) {
        if(p>=data.length||!_digit(data[p]))revert InvalidData();
        if(data[p]==0x30){++p;if(p<data.length&&_digit(data[p]))revert InvalidData();}
        else {while(p<data.length&&_digit(data[p]))++p;}
        if(fraction&&p<data.length&&data[p]==0x2e){++p;uint256 first=p;while(p<data.length&&_digit(data[p]))++p;if(p==first)revert InvalidData();}
        if(exponent&&p<data.length&&(data[p]==0x65||data[p]==0x45)){
            ++p;if(p<data.length&&(data[p]==0x2b||data[p]==0x2d))++p;
            uint256 first=p;while(p<data.length&&_digit(data[p]))++p;if(p==first)revert InvalidData();
        }
        return p;
    }
}
