// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

/// @notice Fixed market/quantum recipes, published on demand for each 200-block epoch.
contract EpochEntropy is Ownable2StepUpgradeable, UUPSUpgradeable {
    uint64 public constant EPOCH_LENGTH = 200;
    // Attestation freshness at publication; the keeper enforces the same bound before sending.
    uint256 public constant MAX_ATTESTATION_AGE = 240 seconds;
    uint256 public constant MAX_PACKET_BYTES = 2048;
    // Deterministic source fallback: attempt n commits the source n slots after the selected one, and only once
    // n × FALLBACK_DELAY_BLOCKS blocks of the epoch have passed. Randomness still binds a later target block hash.
    uint64 public constant FALLBACK_DELAY_BLOCKS = 20;
    uint8 public constant MAX_FALLBACK_ATTEMPT = 3;
    bytes32 public constant RECIPE_DOMAIN = keccak256("D20_EPOCH_RECIPES");
    bytes32 public constant SELECT_DOMAIN = keccak256("D20_EPOCH_SELECT");
    bytes32 public constant EPOCH_DOMAIN = keccak256("D20_EPOCH");
    address public hyperliquidSigner;
    address public anuSigner;
    address public btcTradeSigner;
    address public ethTradeSigner;
    address public committer;
    uint64 public firstEpochStart;
    bytes32 public catalogHash;
    struct Attestation { uint256 timestamp; bytes data; bytes signature; }
    struct Selection { uint8 source; address airnode; bytes32 selector; bytes32 queryHash; string canonicalRequest; }
    struct Epoch {
        bytes32 epochHash; bytes32 catalogHash; bytes32 anchorHash; uint8 source;
        bytes32 queryHash; bytes32 dataHash; bytes32 attestationHash; uint256 signedAt; uint64 committedBlock;
    }
    struct CatalogVersion { uint64 fromEpoch; bytes32 hash; address[4] signers; }
    mapping(uint64 => Epoch) private epochs;
    mapping(uint64 => bytes32) public epochAnchors;
    // Scheduled signer catalogs ascending by fromEpoch; epochs before the first entry use the initial catalog above.
    CatalogVersion[] private catalogVersions;
    // Preserve all declared fields/mapping value layouts; consume reserved slots when extending.
    uint256[39] private __gap;
    error InvalidConfig(); error InvalidEpoch(); error PreparationClosed(); error AnchorUnavailable();
    error OnlyCommitter(); error AlreadyCommitted(); error InvalidTime(); error InvalidData(); error InvalidSigner();
    error PacketTooLarge(); error RenounceDisabled();
    error InvalidFallback(); error FallbackNotOpen();
    event EpochCommitted(uint64 indexed epochId, bytes32 indexed epochHash, bytes packet);
    event CommitterChanged(address indexed previousCommitter, address indexed newCommitter);
    event CatalogScheduled(uint64 indexed fromEpoch, bytes32 indexed catalogHash, address[4] signers);
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }
    function initialize(address[4] memory signers, address initialOwner, address initialCommitter) external initializer {
        __Ownable_init(initialOwner);
        __Ownable2Step_init();
        if(signers[0]==address(0)||signers[1]==address(0)||signers[2]==address(0)||signers[3]==address(0)||initialCommitter==address(0)) revert InvalidConfig();
        hyperliquidSigner=signers[0]; anuSigner=signers[1]; btcTradeSigner=signers[2]; ethTradeSigner=signers[3]; committer=initialCommitter;
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
    /// @notice Schedule a signer catalog for epochs >= fromEpoch, at least two epochs ahead; a pending version is replaced.
    /// @dev catalogHash() and the slot getters keep the initial catalog, so protocolConfigurationHash and keeper pins never move.
    function scheduleCatalog(address[4] calldata signers, uint64 fromEpoch) external onlyOwner {
        if(signers[0]==address(0)||signers[1]==address(0)||signers[2]==address(0)||signers[3]==address(0)) revert InvalidConfig();
        uint64 current=epochForBlock(block.number);
        if(fromEpoch<current+2) revert InvalidEpoch();
        uint256 count=catalogVersions.length;
        if(count!=0&&catalogVersions[count-1].fromEpoch>current) catalogVersions.pop();
        bytes32 hash=keccak256(abi.encode(RECIPE_DOMAIN,signers));
        catalogVersions.push(CatalogVersion(fromEpoch,hash,signers));
        emit CatalogScheduled(fromEpoch,hash,signers);
    }
    function catalogHashAt(uint64 epochId) external view returns(bytes32 hash) { (hash,)=_catalogAt(epochId); }
    function signersAt(uint64 epochId) external view returns(address[4] memory signers) { (,signers)=_catalogAt(epochId); }
    function _catalogAt(uint64 epochId) private view returns(bytes32,address[4] memory) {
        for(uint256 i=catalogVersions.length;i>0;--i) {
            CatalogVersion storage v=catalogVersions[i-1];
            if(epochId>=v.fromEpoch) return (v.hash,v.signers);
        }
        return (catalogHash,[hyperliquidSigner,anuSigner,btcTradeSigner,ethTradeSigner]);
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
    /// @notice Source, signer and recipe for a fallback attempt (0 is the selected source).
    function getEpochFallbackSelection(uint64 epochId,uint8 attempt) external view returns(Selection memory s) {
        if(attempt>MAX_FALLBACK_ATTEMPT) revert InvalidFallback();
        (s,)=_select(epochId,attempt);
    }
    /// @notice First block at which an attempt may be committed; attempt 0 opens at the epoch start.
    function fallbackOpensAt(uint64 epochId,uint8 attempt) public view returns(uint64) {
        if(attempt>MAX_FALLBACK_ATTEMPT) revert InvalidFallback();
        return epochStart(epochId)+uint64(attempt)*FALLBACK_DELAY_BLOCKS;
    }
    /// @dev Selection and commitment use the catalog in force for the epoch being selected, not the initial one.
    function _select(uint64 epochId,uint8 attempt) private view returns(Selection memory s,bytes32 catalog) {
        bytes32 anchor=_anchor(epochId);
        address[4] memory signers;
        (catalog,signers)=_catalogAt(epochId);
        s.selector=keccak256(abi.encode(SELECT_DOMAIN,catalog,epochId,anchor));
        s.source=uint8((uint256(s.selector)%4+attempt)%4);
        s.airnode=signers[s.source];
        if(s.source==0)s.canonicalRequest='["metaAndAssetCtxs",[["dex",""]],[["symbol","/0/universe/0/name"],["value","/1/0/dayNtlVlm"]]]';
        else if(s.source==1)s.canonicalRequest='["randomNumbers",[["length",4],["size",8],["type","hex8"]]]';
        else if(s.source==2)s.canonicalRequest='["lastTrade",[["assetClass","crypto"],["symbol","BTCUSD"]]]';
        else s.canonicalRequest='["lastTrade",[["assetClass","crypto"],["symbol","ETHUSD"]]]';
        s.queryHash=keccak256(bytes(s.canonicalRequest));
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
        _validate(s.source,a.data);
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
    function _validate(uint8 source,bytes calldata data) private pure {
        if(data.length==0||data.length>128) revert InvalidData();
        if(source==0) {
            bytes memory prefix=bytes('{"symbol":"BTC","value":"');
            if(data.length<=prefix.length+2||data[data.length-2]!=0x22||data[data.length-1]!=0x7d) revert InvalidData();
            for(uint256 i;i<prefix.length;++i) if(data[i]!=prefix[i]) revert InvalidData();
            bool dot; uint256 end=data.length-2;
            for(uint256 i=prefix.length;i<end;++i) {
                uint8 c=uint8(data[i]);
                if(c>=48&&c<=57) { if(i==prefix.length&&c==48&&i+1<end&&data[i+1]!=0x2e) revert InvalidData(); }
                else if(c==46&&!dot&&i>prefix.length&&i+1<end) dot=true;
                else revert InvalidData();
            }
        } else if(source==1) {
            bytes memory shape=bytes('{"success":true,"type":"hex8","length":"4","data":["0000000000000000","0000000000000000","0000000000000000","0000000000000000"]}');
            if(data.length!=shape.length) revert InvalidData();
            for(uint256 i;i<shape.length;++i) {
                if(shape[i]==0x30) { uint8 c=uint8(data[i]); if(!((c>=48&&c<=57)||(c>=97&&c<=102))) revert InvalidData(); }
                else if(data[i]!=shape[i]) revert InvalidData();
            }
        } else {
            uint256 p=_literal(data,0,source==2?bytes('{"symbol":"BTCUSD","price":'):bytes('{"symbol":"ETHUSD","price":'));
            p=_number(data,p,false); p=_literal(data,p,bytes(',"size":'));
            p=_number(data,p,false); p=_literal(data,p,bytes(',"timestamp":'));
            uint256 first=p; p=_number(data,p,true);
            if(data[first]==0x30||p-first>16) revert InvalidData();
            p=_literal(data,p,bytes('}'));if(p!=data.length) revert InvalidData();
        }
    }
    function _literal(bytes calldata data,uint256 p,bytes memory literal) private pure returns(uint256) {
        if(p+literal.length>data.length) revert InvalidData();
        for(uint256 i;i<literal.length;++i)if(data[p+i]!=literal[i])revert InvalidData();return p+literal.length;
    }
    function _digit(bytes1 c) private pure returns(bool){return c>=0x30&&c<=0x39;}
    function _number(bytes calldata data,uint256 p,bool integerOnly) private pure returns(uint256) {
        if(p>=data.length||!_digit(data[p]))revert InvalidData();
        if(data[p]==0x30){++p;if(p<data.length&&_digit(data[p]))revert InvalidData();}
        else {while(p<data.length&&_digit(data[p]))++p;}
        if(!integerOnly&&p<data.length&&data[p]==0x2e){++p;uint256 first=p;while(p<data.length&&_digit(data[p]))++p;if(p==first)revert InvalidData();}
        if(!integerOnly&&p<data.length&&(data[p]==0x65||data[p]==0x45)){
            ++p;if(p<data.length&&(data[p]==0x2b||data[p]==0x2d))++p;
            uint256 first=p;while(p<data.length&&_digit(data[p]))++p;if(p==first)revert InvalidData();
        }
        return p;
    }
}
