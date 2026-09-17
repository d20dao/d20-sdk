import { AbiCoder, getAddress, id, keccak256, getBytes, toUtf8Bytes, toUtf8String, verifyMessage } from "ethers";
import { canonicalApiRequest, attestationDigest, hashAttestation, validateApiSignatureEncoding, type ApiAttestation, type ApiRequest } from "./sources.ts";
import { deriveRequestSeed,hashPublicKey, hashProof, verifyVRFProof, type VRFProof, type RequestContext } from "./verification.ts";
import { hashMapping, mapRandomness } from "./mapping.ts";
import type { MappingSpec } from "./mapping.ts";
import type { XY } from "./verification.ts";
const abi=AbiCoder.defaultAbiCoder();
export const EPOCH_LENGTH=200n;
export const MAX_ATTESTATION_AGE=240n;
export const EPOCH_RECIPE_DOMAIN=id("D20_EPOCH_RECIPES");
/// A catalog lists 1 to MAX_EPOCH_SOURCES distinct recipes; attempt n of an epoch opens n × FALLBACK_DELAY_BLOCKS into it.
export const MAX_EPOCH_SOURCES=10, FALLBACK_DELAY_BLOCKS=20n;
export type EpochProvider="hyperliquid"|"drpc"|"tickerlayer"|"nodary";
export interface EpochRecipe { id:number; provider:EpochProvider; description:string; request:ApiRequest; }
export type EpochSigners = readonly string[];
/// The catalog an epoch selected with. Omit recipes for a registry's initial catalog (recipes 0-3, four signers,
/// hashed as address[4]); a scheduled catalog lists its recipe ids in slot order. resolveEpochCatalog builds one from catalogAt.
export interface EpochCatalog { signers: EpochSigners; recipes?: readonly number[]; registry: string; chainId: bigint; firstEpochStart: bigint; }
export interface EpochRecord { epochHash:string; catalogHash:string; anchorHash:string; source:number | bigint; queryHash:string;
  dataHash:string; attestationHash:string; signedAt:bigint; committedBlock:bigint; }
export type EpochRequestContext = RequestContext;
/// initialMinFee is the fee argument of initialize, bound into the configuration hash; live pricing (setPricing) never changes it.
export interface EpochProtocolConfiguration { publicKey:XY; feeRecipient:string; initialMinFee:bigint; confirmationBlocks:number; registry:string; catalogHash:string; firstEpochStart:bigint; }
function frozen<T>(value:T):T {
  if(value!==null&&typeof value==="object"){for(const child of Object.values(value))frozen(child);Object.freeze(value);}
  return value;
}
const MULTICALL3="0xcA11bde05977b3631167028862bE2a173976CA11", GET_LAST_BLOCK_HASH="0x27e86d6e";
const blockHash=(network:string):ApiRequest=>({operation:"jsonRpc",parameters:{network,method:"eth_call",params:[{to:MULTICALL3,data:GET_LAST_BLOCK_HASH},"latest"]}});
/// Global recipe ids, fixed in EpochEntropy. Each canonical request derives from its body with canonicalApiRequest and equals
/// the registry's recipeRequest(id) byte for byte; a keeper posts the same body to the provider's gateway.
export const EPOCH_RECIPES:readonly EpochRecipe[]=frozen<EpochRecipe[]>([
  {id:0,provider:"hyperliquid",description:"BTC daily notional volume",request:{operation:"metaAndAssetCtxs",parameters:{dex:""},responseProjection:{symbol:"/0/universe/0/name",value:"/1/0/dayNtlVlm"}}},
  {id:1,provider:"drpc",description:"Ethereum mainnet block hash",request:blockHash("ethereum")},
  {id:2,provider:"tickerlayer",description:"BTCUSD last trade",request:{operation:"lastTrade",parameters:{assetClass:"crypto",symbol:"BTCUSD"}}},
  {id:3,provider:"tickerlayer",description:"ETHUSD last trade",request:{operation:"lastTrade",parameters:{assetClass:"crypto",symbol:"ETHUSD"}}},
  {id:4,provider:"nodary",description:"ETH/USD feed",request:{operation:"latestFeeds",parameters:{name:"ETH/USD"}}},
  {id:5,provider:"hyperliquid",description:"SOL mid price",request:{operation:"allMids",parameters:{},responseProjection:{mid:"/SOL"}}},
  {id:6,provider:"drpc",description:"Base block hash",request:blockHash("base")},
  {id:7,provider:"nodary",description:"BTC/USD feed",request:{operation:"latestFeeds",parameters:{name:"BTC/USD"}}},
]);
export const EPOCH_CANONICAL_REQUESTS:readonly string[]=frozen(EPOCH_RECIPES.map(recipe=>canonicalApiRequest(recipe.request)));
export const INITIAL_EPOCH_RECIPES:readonly number[]=frozen([0,1,2,3]);
const jsonNumber="(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?", decimalString="(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?";
const tradeRecord=(symbol:string)=>new RegExp(`^\\{"symbol":"${symbol}","price":${jsonNumber},"size":${jsonNumber},"timestamp":[1-9][0-9]{0,15}\\}$`);
const feed=(name:string)=>new RegExp(`^\\{"${name}":\\{"value":${jsonNumber},"timestamp":[1-9][0-9]{12},"category":"crypto"\\}\\}$`);
const blockHashEnvelope=/^\{"id":null,"jsonrpc":"2\.0","result":"0x[0-9a-f]{64}"\}$/;
const EPOCH_DATA_PATTERNS=[
  new RegExp(`^\\{"symbol":"BTC","value":"${decimalString}"\\}$`),
  blockHashEnvelope,
  tradeRecord("BTCUSD"),
  tradeRecord("ETHUSD"),
  feed("ETH/USD"),
  new RegExp(`^\\{"mid":"${decimalString}"\\}$`),
  blockHashEnvelope,
  feed("BTC/USD"),
];
/// The exact signed bytes EpochEntropy accepts for a recipe: at most 128 bytes, never cropped or reformatted.
export function validateEpochData(recipe:number,data:string):void {
  const pattern=EPOCH_DATA_PATTERNS[recipe];
  if(pattern===undefined||getBytes(data).length>128||!pattern.test(toUtf8String(data))) throw new Error("Invalid exact epoch data");
}
/// The recipe ids of a catalog in slot order; throws unless it follows the registry's catalog rules.
export function epochCatalogRecipes(catalog:Pick<EpochCatalog,"signers"|"recipes">):readonly number[] {
  const recipes=catalog.recipes??INITIAL_EPOCH_RECIPES;
  if(recipes.length<1||recipes.length>MAX_EPOCH_SOURCES||catalog.signers.length!==recipes.length||new Set(recipes).size!==recipes.length||
    recipes.some(recipe=>!Number.isInteger(recipe)||recipe<0||recipe>=EPOCH_RECIPES.length)||catalog.signers.some(signer=>BigInt(signer)===0n))
    throw new Error("Invalid epoch catalog");
  return recipes;
}
export function epochCatalogHash(signers:EpochSigners,recipes?:readonly number[]):string {
  epochCatalogRecipes({signers,recipes});
  return recipes===undefined?keccak256(abi.encode(["bytes32","address[4]"],[EPOCH_RECIPE_DOMAIN,signers]))
    :keccak256(abi.encode(["bytes32","uint8[]","address[]"],[EPOCH_RECIPE_DOMAIN,recipes,signers]));
}
/// Build an epoch's catalog from the registry's catalogAt(epoch) view, identifying the initial catalog by its hash.
export function resolveEpochCatalog(base:Omit<EpochCatalog,"signers"|"recipes">,view:{hash:string;recipes:readonly (number|bigint)[];signers:readonly string[]}):EpochCatalog {
  const signers=view.signers.map(signer=>getAddress(signer)),recipes=view.recipes.map(Number);
  if(recipes.join()===INITIAL_EPOCH_RECIPES.join()&&epochCatalogHash(signers)===view.hash) return {...base,signers};
  if(epochCatalogHash(signers,recipes)!==view.hash) throw new Error("Catalog hash mismatch");
  return {...base,signers,recipes};
}
export function epochStart(firstEpochStart:bigint,epochId:bigint):bigint {
  if(epochId<1n) throw new Error("Invalid epoch"); return firstEpochStart+(epochId-1n)*EPOCH_LENGTH;
}
export function epochForBlock(firstEpochStart:bigint,block:bigint):bigint { return block<firstEpochStart?0n:1n+(block-firstEpochStart)/EPOCH_LENGTH; }
/// A fallback attempt n uses the source n slots after the selected one, from n × FALLBACK_DELAY_BLOCKS into the epoch.
export function fallbackOpensAt(firstEpochStart:bigint,epochId:bigint,attempt:number):bigint {
  if(!Number.isInteger(attempt)||attempt<0||attempt>=MAX_EPOCH_SOURCES) throw new Error("Invalid fallback attempt");
  return epochStart(firstEpochStart,epochId)+BigInt(attempt)*FALLBACK_DELAY_BLOCKS;
}
export function selectEpoch(catalog:EpochCatalog,epochId:bigint,anchorHash:string,attempt=0) {
  if(epochId<1n||BigInt(anchorHash)===0n) throw new Error("Invalid epoch anchor");
  const recipes=epochCatalogRecipes(catalog),count=recipes.length;
  if(!Number.isInteger(attempt)||attempt<0||attempt>=count) throw new Error("Invalid fallback attempt");
  const selector=keccak256(abi.encode(["bytes32","bytes32","uint64","bytes32"],[id("D20_EPOCH_SELECT"),epochCatalogHash(catalog.signers,catalog.recipes),epochId,anchorHash]));
  const source=(Number(BigInt(selector)%BigInt(count))+attempt)%count, recipe=recipes[source];
  const canonicalRequest=EPOCH_CANONICAL_REQUESTS[recipe];
  return {source,recipe,attempt,airnode:catalog.signers[source],selector,canonicalRequest,queryHash:keccak256(toUtf8Bytes(canonicalRequest)),request:EPOCH_RECIPES[recipe].request};
}
export function verifyEpochAttestation(selected:ReturnType<typeof selectEpoch>,a:ApiAttestation,commitTimestamp:bigint) {
  validateApiSignatureEncoding(a.signature);
  if(a.timestamp>commitTimestamp||commitTimestamp-a.timestamp>MAX_ATTESTATION_AGE) throw new Error("Invalid epoch attestation time");
  validateEpochData(selected.recipe,a.data);
  const signer=verifyMessage(getBytes(attestationDigest(selected.queryHash,a)),a.signature);
  if(signer.toLowerCase()!==selected.airnode.toLowerCase()) throw new Error("Wrong epoch signer/query");
  return {dataHash:keccak256(a.data),attestationHash:hashAttestation(selected.queryHash,a),signer};
}
export function epochCommitmentHash(catalog:EpochCatalog,epochId:bigint,anchorHash:string,source:number,queryHash:string,dataHash:string,attestationHash:string):string {
  return keccak256(abi.encode(["bytes32","uint256","address","bytes32","uint64","uint64","bytes32","uint8","bytes32","bytes32","bytes32"],
    [id("D20_EPOCH"),catalog.chainId,catalog.registry,epochCatalogHash(catalog.signers,catalog.recipes),epochId,epochStart(catalog.firstEpochStart,epochId),anchorHash,source,queryHash,dataHash,attestationHash]));
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
  const {catalog,epochId,record}=input,count=epochCatalogRecipes(catalog).length;
  if(!Number.isInteger(Number(record.source))||Number(record.source)<0||Number(record.source)>=count) throw new Error("Epoch record mismatch");
  // The committed source fixes the attempt; a fallback is valid only if it was committed after its window opened.
  const attempt=(Number(record.source)-selectEpoch(catalog,epochId,record.anchorHash).source+count)%count;
  if(record.committedBlock<fallbackOpensAt(catalog.firstEpochStart,epochId,attempt)) throw new Error("Invalid epoch commit block");
  const selected=selectEpoch(catalog,epochId,record.anchorHash,attempt), evidence=decodeEpochEvidencePacket(input.packet);
  if(evidence.canonicalRequest!==selected.canonicalRequest) throw new Error("Epoch recipe mismatch");
  const verified=verifyEpochAttestation(selected,evidence.attestation,input.commitTimestamp);
  const epochHash=epochCommitmentHash(catalog,epochId,record.anchorHash,selected.source,selected.queryHash,verified.dataHash,verified.attestationHash);
  if(record.epochHash!==epochHash||record.catalogHash!==epochCatalogHash(catalog.signers,catalog.recipes)||Number(record.source)!==selected.source||record.queryHash!==selected.queryHash||
    record.dataHash!==verified.dataHash||record.attestationHash!==verified.attestationHash||record.signedAt!==evidence.attestation.timestamp) throw new Error("Epoch record mismatch");
  return {epochHash,selected,...verified};
}
export function epochProtocolConfigurationHash(c:EpochProtocolConfiguration):string {
  return keccak256(abi.encode(["bytes32","uint256[2]","address","uint256","uint16","address","bytes32","uint64","uint64"],
    [id("D20_VRF_CONFIG"),c.publicKey,c.feeRecipient,c.initialMinFee,c.confirmationBlocks,c.registry,c.catalogHash,c.firstEpochStart,EPOCH_LENGTH]));
}
export function epochTranscriptHash(c:EpochRequestContext,configurationHash:string,proofHash:string,randomness:string):string {
  return keccak256(abi.encode(["bytes32","uint256","address","uint256","bytes32","bytes32","bytes32","bytes32","bytes32","uint64","bytes32"],
    [id("D20_VRF_TRANSCRIPT"),c.chainId,c.coordinator,c.requestId,configurationHash,c.blockHash,proofHash,randomness,hashMapping(c.mapping),c.epochId,c.epochHash]));
}
/// Canonical blocks, transaction inclusion/timestamps and the proxy implementation code active
/// at each receipt must be independently trusted chain context. A proxy code hash alone is insufficient.
/// The catalog is per epoch: epoch.catalog must be the catalog in force for context.epochId (catalogAt on the
/// registry, or CatalogScheduled events and the initial catalog); replayEpochCommitment binds it to record.catalogHash,
/// while configuration.catalogHash remains the initial catalog bound into protocolConfigurationHash.
export function replayEpochCoordinator(input:{context:EpochRequestContext;configuration:EpochProtocolConfiguration;protocolConfigurationHash:string;
  epoch:{catalog:EpochCatalog;record:EpochRecord;commitTimestamp:bigint;packet:string};requestedAt:bigint;deadline:bigint;acceptanceTimestamp:bigint;acceptanceBlock:bigint;
  vrfProof:VRFProof;recorded:{fulfilled:boolean;randomness:string;proofHash:string;transcriptHash:string}}) {
  const c=input.context, cfg=input.configuration, e=input.epoch;
  const epoch=replayEpochCommitment({...e,epochId:c.epochId});
  if(e.catalog.registry.toLowerCase()!==cfg.registry.toLowerCase()||e.catalog.chainId!==c.chainId||e.catalog.firstEpochStart!==cfg.firstEpochStart||epoch.epochHash!==c.epochHash||epochForBlock(cfg.firstEpochStart,c.requestBlock)!==c.epochId) throw new Error("Epoch request binding mismatch");
  const expectedTarget=c.requestBlock>e.record.committedBlock+1n?c.requestBlock:e.record.committedBlock+1n;
  if(c.targetBlock!==expectedTarget||e.record.committedBlock>=c.targetBlock) throw new Error("Invalid future randomness block");
  if(hashPublicKey(cfg.publicKey)!==c.keyHash||epochProtocolConfigurationHash(cfg)!==input.protocolConfigurationHash) throw new Error("Protocol configuration mismatch");
  if(cfg.confirmationBlocks<1||cfg.confirmationBlocks>64||input.acceptanceBlock<c.targetBlock+BigInt(cfg.confirmationBlocks)) throw new Error("Invalid acceptance block");
  if(input.deadline!==input.requestedAt+60n||input.acceptanceTimestamp<input.requestedAt||input.acceptanceTimestamp>input.deadline||e.commitTimestamp>input.acceptanceTimestamp) throw new Error("Invalid acceptance time");
  const seed=deriveRequestSeed(c),vrf=verifyVRFProof(input.vrfProof,cfg.publicKey,seed);
  if(!vrf.valid) throw new Error(vrf.reason);
  const proofHash=hashProof(input.vrfProof),transcriptHash=epochTranscriptHash(c,input.protocolConfigurationHash,proofHash,vrf.randomness),r=input.recorded;
  if(!r.fulfilled||r.randomness!==vrf.randomness||r.proofHash!==proofHash||r.transcriptHash!==transcriptHash) throw new Error("Recorded coordinator state mismatch");
  return {request:{seed,epochId:c.epochId,epochHash:c.epochHash},reveal:{randomness:vrf.randomness},map:{values:mapRandomness(vrf.randomness,c.mapping),mappingHash:hashMapping(c.mapping)},proof:{proofHash,transcriptHash,matchesRecordedState:true}};
}
