// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @notice Fixed market/quantum recipes, committed before each 200-block service epoch.
contract EpochEntropy {
    uint64 public constant EPOCH_LENGTH = 200;
    uint256 public constant MAX_PACKET_BYTES = 2048;
    bytes32 public constant RECIPE_DOMAIN = keccak256("D20_EPOCH_RECIPES");
    bytes32 public constant SELECT_DOMAIN = keccak256("D20_EPOCH_SELECT");
    bytes32 public constant EPOCH_DOMAIN = keccak256("D20_EPOCH");
    address public immutable hyperliquidSigner;
    address public immutable anuSigner;
    address public immutable btcTradeSigner;
    address public immutable ethTradeSigner;
    address public immutable committer;
    uint64 public immutable firstEpochStart;
    bytes32 public immutable catalogHash;
    struct Attestation { uint256 timestamp; bytes data; bytes signature; }
    struct Selection { uint8 source; address airnode; bytes32 selector; bytes32 queryHash; string canonicalRequest; }
    struct Epoch {
        bytes32 epochHash; bytes32 catalogHash; bytes32 anchorHash; uint8 source;
        bytes32 queryHash; bytes32 dataHash; bytes32 attestationHash; uint256 signedAt; uint64 committedBlock;
    }
    mapping(uint64 => Epoch) private epochs;
    error InvalidConfig(); error InvalidEpoch(); error PreparationClosed(); error AnchorUnavailable();
    error OnlyCommitter(); error AlreadyCommitted(); error InvalidTime(); error InvalidData(); error InvalidSigner();
    error PacketTooLarge();
    event EpochCommitted(uint64 indexed epochId, bytes32 indexed epochHash, bytes packet);
    constructor(address[4] memory signers, address owner) {
        if(signers[0]==address(0)||signers[1]==address(0)||signers[2]==address(0)||signers[3]==address(0)||owner==address(0)) revert InvalidConfig();
        hyperliquidSigner=signers[0]; anuSigner=signers[1]; btcTradeSigner=signers[2]; ethTradeSigner=signers[3]; committer=owner;
        firstEpochStart=uint64(block.number)+EPOCH_LENGTH;
        catalogHash=keccak256(abi.encode(RECIPE_DOMAIN,signers));
    }
    function epochStart(uint64 epochId) public view returns(uint64) {
        if(epochId==0) revert InvalidEpoch();
        return firstEpochStart+(epochId-1)*EPOCH_LENGTH;
    }
    function epochForBlock(uint256 number) public view returns(uint64) {
        return number<firstEpochStart?0:uint64(1+(number-firstEpochStart)/EPOCH_LENGTH);
    }
    function nextEpochToPrepare(uint256 number) external view returns(uint64) { return epochForBlock(number)+1; }
    function getEpoch(uint64 epochId) external view returns(Epoch memory) { return epochs[epochId]; }
    function getEpochSelection(uint64 epochId) public view returns(Selection memory s) {
        uint64 start=epochStart(epochId); uint64 anchorBlock=start-EPOCH_LENGTH;
        if(block.number<=anchorBlock||block.number>=start) revert PreparationClosed();
        bytes32 anchor=blockhash(anchorBlock);
        if(anchor==bytes32(0)) revert AnchorUnavailable();
        s.selector=keccak256(abi.encode(SELECT_DOMAIN,catalogHash,epochId,anchor));
        s.source=uint8(uint256(s.selector)%4);
        if(s.source==0){s.airnode=hyperliquidSigner;s.canonicalRequest='["metaAndAssetCtxs",[["dex",""]],[["symbol","/0/universe/0/name"],["value","/1/0/dayNtlVlm"]]]';}
        else if(s.source==1){s.airnode=anuSigner;s.canonicalRequest='["randomNumbers",[["length",4],["size",8],["type","hex8"]]]';}
        else if(s.source==2){s.airnode=btcTradeSigner;s.canonicalRequest='["lastTrade",[["assetClass","crypto"],["symbol","BTCUSD"]]]';}
        else {s.airnode=ethTradeSigner;s.canonicalRequest='["lastTrade",[["assetClass","crypto"],["symbol","ETHUSD"]]]';}
        s.queryHash=keccak256(bytes(s.canonicalRequest));
    }
    function commitEpoch(uint64 epochId, Attestation calldata a) external {
        if(msg.sender!=committer) revert OnlyCommitter();
        if(epochs[epochId].epochHash!=bytes32(0)) revert AlreadyCommitted();
        Selection memory s=getEpochSelection(epochId);
        if(a.timestamp>block.timestamp||block.timestamp-a.timestamp>120) revert InvalidTime();
        _validate(s.source,a.data);
        bytes32 digest=keccak256(abi.encodePacked(s.queryHash,a.timestamp,a.data));
        if(ECDSA.recover(MessageHashUtils.toEthSignedMessageHash(digest),a.signature)!=s.airnode) revert InvalidSigner();
        bytes32 dataHash=keccak256(a.data);
        bytes32 attestationHash=keccak256(abi.encode(s.queryHash,a.timestamp,dataHash,keccak256(a.signature)));
        bytes32 anchor=blockhash(epochStart(epochId)-EPOCH_LENGTH);
        // The complete accepted commitment is fixed before any paid request can use this epoch.
        bytes32 commitment=keccak256(abi.encode(EPOCH_DOMAIN,block.chainid,address(this),catalogHash,epochId,
            epochStart(epochId),anchor,s.source,s.queryHash,dataHash,attestationHash));
        epochs[epochId]=Epoch(commitment,catalogHash,anchor,s.source,s.queryHash,dataHash,attestationHash,a.timestamp,uint64(block.number));
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
