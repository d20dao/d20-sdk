import { AbiCoder, getBytes, id, keccak256, toUtf8Bytes, verifyMessage } from "ethers";
import { attestationDigest, canonicalApiRequest, hashAttestation, validateApiSignatureEncoding,
  type ApiAttestation, type ApiRequest, type SourceSelection } from "./sources.ts";

export const SNAPSHOT_RECIPE_VERSION = id("VRF_ARCDAO_PRECOMMITTED_SNAPSHOTS_V2");
export interface SnapshotRecord { source: number; airnode: string; canonicalRequest: string; attestation: ApiAttestation; }
export interface SnapshotCatalog { records: readonly SnapshotRecord[]; committedAt: bigint; }
export type SnapshotSelection = Omit<SourceSelection, "request">;
const abi = AbiCoder.defaultAbiCoder();

export function snapshotRecordHash(record: SnapshotRecord): string {
  return keccak256(abi.encode(["uint8", "address", "bytes32", "bytes32"], [record.source, record.airnode,
    keccak256(toUtf8Bytes(record.canonicalRequest)), hashAttestation(keccak256(toUtf8Bytes(record.canonicalRequest)), record.attestation)]));
}
export function snapshotConfigurationHash(records: readonly SnapshotRecord[]): string {
  if (records.length === 0 || records.length > 12) throw new Error("Invalid snapshot catalog length");
  let previous = -1;
  for (const r of records) {
    if (!Number.isInteger(r.source) || r.source <= previous || r.source > 11) throw new Error("Catalog IDs must be unique, ascending and stable");
    previous = r.source;
    if (BigInt(r.airnode) === 0n || toUtf8Bytes(r.canonicalRequest).length === 0 || toUtf8Bytes(r.canonicalRequest).length > 1024 ||
      r.attestation.timestamp <= 0n || getBytes(r.attestation.data).length === 0 || getBytes(r.attestation.data).length > 128)
      throw new Error("Invalid snapshot bounds");
    validateApiSignatureEncoding(r.attestation.signature);
    const signer = verifyMessage(getBytes(attestationDigest(keccak256(toUtf8Bytes(r.canonicalRequest)), r.attestation)), r.attestation.signature);
    if (signer.toLowerCase() !== r.airnode.toLowerCase()) throw new Error("Wrong snapshot signer");
  }
  return keccak256(abi.encode(["bytes32", "bytes32[]"], [SNAPSHOT_RECIPE_VERSION, records.map(snapshotRecordHash)]));
}

// This is a display/HTTP conversion only; the committed canonical bytes remain the signing authority.
function fromPairs(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  if (value.length > 0 && value.every(v => Array.isArray(v) && v.length === 2 && typeof v[0] === "string"))
    return Object.fromEntries(value.map(([k, v]) => [k, fromPairs(v)]));
  return value.map(fromPairs);
}
export function snapshotApiRequest(canonical: string): ApiRequest {
  const a: unknown = JSON.parse(canonical);
  if (!Array.isArray(a) || (a.length !== 2 && a.length !== 3) || typeof a[0] !== "string" || !Array.isArray(a[1]))
    throw new Error("Invalid canonical snapshot query");
  const parameters = a[1].length === 0 ? {} : fromPairs(a[1]);
  const request = {operation: a[0], parameters, ...(a.length === 3 ? {responseProjection: fromPairs(a[2])} : {})} as ApiRequest;
  if (canonicalApiRequest(request) !== canonical) throw new Error("Noncanonical snapshot query");
  return request;
}
export function selectSnapshot(requestId: bigint, requestBlockHash: string, requestedAt: bigint, catalog: SnapshotCatalog): SnapshotSelection {
  if (requestId <= 0n || BigInt(requestBlockHash) === 0n || requestedAt <= catalog.committedAt || catalog.committedAt < 0n)
    throw new Error("Snapshot must be committed before request");
  if (catalog.records.some(r => r.attestation.timestamp > catalog.committedAt)) throw new Error("Snapshot signed after commitment");
  const config = snapshotConfigurationHash(catalog.records);
  const seed = keccak256(abi.encode(["bytes32", "bytes32", "bytes32", "uint256"],
    [id("VRF_ARCDAO_SNAPSHOT_SOURCE_V2"), config, requestBlockHash, requestId]));
  const r = catalog.records[Number(BigInt(seed) % BigInt(catalog.records.length))];
  return {source: r.source, airnode: r.airnode, selector: keccak256(abi.encode(["bytes32", "bytes32"], [id("VRF_ARCDAO_SNAPSHOT_PARAMS_V2"), seed])),
    canonicalRequest: r.canonicalRequest, requestHash: keccak256(toUtf8Bytes(r.canonicalRequest))};
}
export function verifySnapshotAttestation(selected: SnapshotSelection, a: ApiAttestation, catalog: SnapshotCatalog) {
  const r = catalog.records.find(r => r.source === selected.source);
  if (!r || r.airnode.toLowerCase() !== selected.airnode.toLowerCase() || r.canonicalRequest !== selected.canonicalRequest ||
    keccak256(toUtf8Bytes(r.canonicalRequest)) !== selected.requestHash ||
    hashAttestation(selected.requestHash, a) !== hashAttestation(selected.requestHash, r.attestation))
    throw new Error("Snapshot commitment mismatch");
  snapshotConfigurationHash(catalog.records);
  if (catalog.records.some(r => r.attestation.timestamp > catalog.committedAt)) throw new Error("Snapshot signed after commitment");
  return {signer: r.airnode, dataHash: keccak256(a.data), attestationHash: hashAttestation(selected.requestHash, a)};
}
