import { AbiCoder, id, keccak256, getBytes, toUtf8Bytes, toUtf8String, verifyMessage } from "ethers";
import { canonicalApiRequest, attestationDigest, hashAttestation, validateApiSignatureEncoding, type ApiAttestation } from "./sources.ts";
import { deriveRequestSeed,hashPublicKey, hashProof, verifyVRFProof, type VRFProof, type RequestContext } from "./verification.ts";
import { hashMapping, mapRandomness } from "./mapping.ts";
import type { MappingSpec } from "./mapping.ts";
import type { XY } from "./verification.ts";
const abi=AbiCoder.defaultAbiCoder();
export const EPOCH_LENGTH=200n;
export const EPOCH_RECIPE_DOMAIN=id("D20_EPOCH_RECIPES");
export type EpochSigners = readonly [string,string,string,string];
export interface EpochCatalog { signers: EpochSigners; registry: string; chainId: bigint; firstEpochStart: bigint; }
export interface EpochRecord { epochHash:string; catalogHash:string; anchorHash:string; source:number | bigint; queryHash:string;
  dataHash:string; attestationHash:string; signedAt:bigint; committedBlock:bigint; }
export type EpochRequestContext = RequestContext;
export interface EpochProtocolConfiguration { publicKey:XY; feeRecipient:string; requestFee:bigint; confirmationBlocks:number; registry:string; catalogHash:string; firstEpochStart:bigint; }
export function epochCatalogHash(signers:EpochSigners):string {
  return keccak256(abi.encode(["bytes32","address[4]"],[EPOCH_RECIPE_DOMAIN,signers]));
}
export function epochStart(firstEpochStart:bigint,epochId:bigint):bigint {
  if(epochId<1n) throw new Error("Invalid epoch"); return firstEpochStart+(epochId-1n)*EPOCH_LENGTH;
}
export function epochForBlock(firstEpochStart:bigint,block:bigint):bigint { return block<firstEpochStart?0n:1n+(block-firstEpochStart)/EPOCH_LENGTH; }
export function selectEpoch(catalog:EpochCatalog,epochId:bigint,anchorHash:string) {
  if(epochId<1n||BigInt(anchorHash)===0n) throw new Error("Invalid epoch anchor");
  const catalogHash=epochCatalogHash(catalog.signers);
  const selector=keccak256(abi.encode(["bytes32","bytes32","uint64","bytes32"],[id("D20_EPOCH_SELECT"),catalogHash,epochId,anchorHash]));
  const source=Number(BigInt(selector)%4n);
  const request=source===0?{operation:"metaAndAssetCtxs",parameters:{dex:""},responseProjection:{symbol:"/0/universe/0/name",value:"/1/0/dayNtlVlm"}}
    :source===1?{operation:"randomNumbers",parameters:{type:"hex8",length:4,size:8}}
    :{operation:"lastTrade",parameters:{assetClass:"crypto",symbol:source===2?"BTCUSD":"ETHUSD"}};
  const canonicalRequest=canonicalApiRequest(request);
  return {source,airnode:catalog.signers[source],selector,canonicalRequest,queryHash:keccak256(toUtf8Bytes(canonicalRequest)),request};
}
export function verifyEpochAttestation(selected:ReturnType<typeof selectEpoch>,a:ApiAttestation,commitTimestamp:bigint) {
  validateApiSignatureEncoding(a.signature);
  if(a.timestamp>commitTimestamp||commitTimestamp-a.timestamp>120n) throw new Error("Invalid epoch attestation time");
  const body=toUtf8String(a.data);
  const number="(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?";
  const pattern=selected.source===0?/^\{"symbol":"BTC","value":"(?:0|[1-9][0-9]*)(?:\.[0-9]+)?"\}$/
    :selected.source===1?/^\{"success":true,"type":"hex8","length":"4","data":\["[0-9a-f]{16}","[0-9a-f]{16}","[0-9a-f]{16}","[0-9a-f]{16}"\]\}$/
    :new RegExp(`^\\{"symbol":"${selected.source===2?"BTCUSD":"ETHUSD"}","price":${number},"size":${number},"timestamp":[1-9][0-9]{0,15}\\}$`);
  if(getBytes(a.data).length>128||!pattern.test(body)) throw new Error("Invalid exact epoch data");
  const signer=verifyMessage(getBytes(attestationDigest(selected.queryHash,a)),a.signature);
  if(signer.toLowerCase()!==selected.airnode.toLowerCase()) throw new Error("Wrong epoch signer/query");
  return {dataHash:keccak256(a.data),attestationHash:hashAttestation(selected.queryHash,a),signer};
}
export function epochCommitmentHash(catalog:EpochCatalog,epochId:bigint,anchorHash:string,source:number,queryHash:string,dataHash:string,attestationHash:string):string {
  return keccak256(abi.encode(["bytes32","uint256","address","bytes32","uint64","uint64","bytes32","uint8","bytes32","bytes32","bytes32"],
    [id("D20_EPOCH"),catalog.chainId,catalog.registry,epochCatalogHash(catalog.signers),epochId,epochStart(catalog.firstEpochStart,epochId),anchorHash,source,queryHash,dataHash,attestationHash]));
}
const packetTypes=["string","tuple(uint256 timestamp,bytes data,bytes signature)"];
export function encodeEpochEvidencePacket(canonicalRequest:string,attestation:ApiAttestation):string {
  const packet=abi.encode(packetTypes,[canonicalRequest,attestation]);
  if(getBytes(packet).length>2048) throw new Error("Epoch packet exceeds 2048 bytes"); return packet;
}
export function decodeEpochEvidencePacket(packet:string) {
  if(getBytes(packet).length>2048) throw new Error("Epoch packet exceeds 2048 bytes");
  const [canonicalRequest,a]=abi.decode(packetTypes,packet);
  const attestation:ApiAttestation={timestamp:a.timestamp,data:a.data,signature:a.signature};
  if(keccak256(encodeEpochEvidencePacket(canonicalRequest,attestation))!==keccak256(packet)) throw new Error("Noncanonical epoch packet");
  return {canonicalRequest:canonicalRequest as string,attestation};
}
export function replayEpochCommitment(input:{catalog:EpochCatalog;epochId:bigint;record:EpochRecord;commitTimestamp:bigint;packet:string}) {
  const {catalog,epochId,record}=input, start=epochStart(catalog.firstEpochStart,epochId);
  if(record.committedBlock<=start-EPOCH_LENGTH||record.committedBlock>=start) throw new Error("Invalid epoch commit block");
  const selected=selectEpoch(catalog,epochId,record.anchorHash), evidence=decodeEpochEvidencePacket(input.packet);
  if(evidence.canonicalRequest!==selected.canonicalRequest) throw new Error("Epoch recipe mismatch");
  const verified=verifyEpochAttestation(selected,evidence.attestation,input.commitTimestamp);
  const epochHash=epochCommitmentHash(catalog,epochId,record.anchorHash,selected.source,selected.queryHash,verified.dataHash,verified.attestationHash);
  if(record.epochHash!==epochHash||record.catalogHash!==epochCatalogHash(catalog.signers)||Number(record.source)!==selected.source||record.queryHash!==selected.queryHash||
    record.dataHash!==verified.dataHash||record.attestationHash!==verified.attestationHash||record.signedAt!==evidence.attestation.timestamp) throw new Error("Epoch record mismatch");
  return {epochHash,selected,...verified};
}
export function epochProtocolConfigurationHash(c:EpochProtocolConfiguration):string {
  return keccak256(abi.encode(["bytes32","uint256[2]","address","uint256","uint16","address","bytes32","uint64","uint64"],
    [id("D20_VRF_CONFIG"),c.publicKey,c.feeRecipient,c.requestFee,c.confirmationBlocks,c.registry,c.catalogHash,c.firstEpochStart,EPOCH_LENGTH]));
}
export function epochTranscriptHash(c:EpochRequestContext,configurationHash:string,proofHash:string,randomness:string):string {
  return keccak256(abi.encode(["bytes32","uint256","address","uint256","bytes32","bytes32","bytes32","bytes32","bytes32","uint64","bytes32"],
    [id("D20_VRF_TRANSCRIPT"),c.chainId,c.coordinator,c.requestId,configurationHash,c.blockHash,proofHash,randomness,hashMapping(c.mapping),c.epochId,c.epochHash]));
}
/// Canonical blocks and transaction inclusion/timestamps must be independently trusted chain context.
export function replayEpochCoordinator(input:{context:EpochRequestContext;configuration:EpochProtocolConfiguration;protocolConfigurationHash:string;
  epoch:{catalog:EpochCatalog;record:EpochRecord;commitTimestamp:bigint;packet:string};requestedAt:bigint;deadline:bigint;acceptanceTimestamp:bigint;acceptanceBlock:bigint;
  vrfProof:VRFProof;recorded:{fulfilled:boolean;randomness:string;proofHash:string;transcriptHash:string}}) {
  const c=input.context, cfg=input.configuration, e=input.epoch;
  const epoch=replayEpochCommitment({...e,epochId:c.epochId});
  if(e.catalog.registry.toLowerCase()!==cfg.registry.toLowerCase()||e.catalog.chainId!==c.chainId||e.catalog.firstEpochStart!==cfg.firstEpochStart||epochCatalogHash(e.catalog.signers)!==cfg.catalogHash||epoch.epochHash!==c.epochHash||epochForBlock(cfg.firstEpochStart,c.targetBlock)!==c.epochId) throw new Error("Epoch request binding mismatch");
  if(hashPublicKey(cfg.publicKey)!==c.keyHash||epochProtocolConfigurationHash(cfg)!==input.protocolConfigurationHash) throw new Error("Protocol configuration mismatch");
  if(cfg.confirmationBlocks<1||cfg.confirmationBlocks>64||input.acceptanceBlock<c.targetBlock+BigInt(cfg.confirmationBlocks)) throw new Error("Invalid acceptance block");
  if(input.deadline!==input.requestedAt+60n||input.acceptanceTimestamp<input.requestedAt||input.acceptanceTimestamp>input.deadline||e.commitTimestamp>input.requestedAt) throw new Error("Invalid acceptance time");
  const seed=deriveRequestSeed(c),vrf=verifyVRFProof(input.vrfProof,cfg.publicKey,seed);
  if(!vrf.valid) throw new Error(vrf.reason);
  const proofHash=hashProof(input.vrfProof),transcriptHash=epochTranscriptHash(c,input.protocolConfigurationHash,proofHash,vrf.randomness),r=input.recorded;
  if(!r.fulfilled||r.randomness!==vrf.randomness||r.proofHash!==proofHash||r.transcriptHash!==transcriptHash) throw new Error("Recorded coordinator state mismatch");
  return {request:{seed,epochId:c.epochId,epochHash:c.epochHash},reveal:{randomness:vrf.randomness},map:{values:mapRandomness(vrf.randomness,c.mapping),mappingHash:hashMapping(c.mapping)},proof:{proofHash,transcriptHash,matchesRecordedState:true}};
}
