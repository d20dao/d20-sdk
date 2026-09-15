import { AbiCoder, getBytes, hexlify, id, keccak256, toUtf8Bytes, toUtf8String, solidityPacked, verifyMessage } from "ethers";

export const EntropySource = { Weather: 0, PokeAPI: 1, Hyperliquid: 2, AnuQrng: 3, NasaEonet: 4, Usgs: 5,
  Frankfurter: 6, Ecb: 7, GeoDb: 8, Eodhd: 9, PandaScore: 10, Eurostat: 11 } as const;
export const SOURCE_ENDPOINTS = [
  "https://airnode-customweather.fly.dev/", "https://airnode-pokeapi.fly.dev/", "https://airnode-hyperliquid.fly.dev/",
  "https://airnode-anuqrng.fly.dev/", "https://airnode-eonet.fly.dev/", "https://airnode-usgs.fly.dev/",
  "https://airnode-frankfurter.fly.dev/", "https://airnode-ecb.fly.dev/", "https://airnode-geodb.fly.dev/",
  "https://airnode-eodhd.fly.dev/", "https://airnode-pandascore.fly.dev/", "https://airnode-eurostat.fly.dev/",
] as const;
export interface ApiRequest { operation: string; parameters: Record<string, unknown>; responseProjection?: Record<string, string>; }
export interface ApiAttestation { timestamp: bigint; data: string; signature: string; }
export interface SourceSelection { source: number; airnode: string; selector: string; requestHash: string; canonicalRequest: string; request: ApiRequest; }
const abi = AbiCoder.defaultAbiCoder();

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object")
    return Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, v]) => [key, canonical(v)]);
  return value;
}
export function canonicalApiRequest(request: ApiRequest): string {
  const parts = [request.operation, canonical(request.parameters)];
  if (request.responseProjection !== undefined) parts.push(canonical(request.responseProjection));
  return JSON.stringify(parts);
}
export function sourceConfigurationHash(signers: readonly string[], enabledMask = 7): string {
    if (signers.length !== 3) throw new Error("Exactly three source signers required");
  if (!Number.isInteger(enabledMask) || enabledMask < 1 || enabledMask > 7) throw new Error("Invalid enabled source mask");
  return keccak256(abi.encode(["bytes32", "address[3]", "uint8"], [id("VRF_ARCDAO_HISTORICAL_PROJECTION_V1"), signers, enabledMask]));
}
export function selectSource(requestId: bigint, requestBlockHash: string, requestedAt: bigint, signers: readonly string[], enabledMask = 7): SourceSelection {
  if (requestId <= 0n || requestedAt < 1738368000n || BigInt(requestBlockHash) === 0n) throw new Error("Invalid source context");
  sourceConfigurationHash(signers, enabledMask);
  const seed = keccak256(abi.encode(["bytes32", "bytes32", "uint256"], [id("VRF_ARCDAO_SOURCE_V1"), requestBlockHash, requestId]));
  const enabled = [0, 1, 2].filter(source => (enabledMask & (1 << source)) !== 0);
  const source = enabled[Number(BigInt(seed) % BigInt(enabled.length))];
  const selector = keccak256(abi.encode(["bytes32", "bytes32"], [id("VRF_ARCDAO_SOURCE_PARAMS_V1"), seed]));
  const choice = BigInt(selector);
  let request: ApiRequest;
  if (source === EntropySource.Weather) {
    const [latitude, longitude] = [[41, 29], [40, -74], [51, 0], [35, 139]][Number(choice % 4n)];
    const date = `2025-01-${(choice / 4n % 28n + 1n).toString().padStart(2, "0")}T00:00:00`;
    request = { operation: "dailyClimateHistory", parameters: { end_time: date, language: "english", latitude, longitude, metric: true, start_time: date },
      responseProjection: { value: "/report/location/observation/0/tmean" } };
  } else if (source === EntropySource.PokeAPI) {
    request = { operation: "getPokemonForm", parameters: { nameOrId: (choice % 151n + 1n).toString() }, responseProjection: { value: "/name" } };
  } else {
    const startTime = Number((requestedAt / 3600n * 3600n - 7200n) * 1000n);
    if (!Number.isSafeInteger(startTime + 3599999)) throw new Error("Timestamp outside API integer precision");
    request = { operation: "candleSnapshot", parameters: { req: { coin: ["BTC", "ETH", "SOL"][Number(choice % 3n)],
      endTime: startTime + 3599999, interval: "1h", startTime } }, responseProjection: { value: "/0/c" } };
  }
  const canonicalRequest = canonicalApiRequest(request);
  return { source, airnode: signers[source], selector, canonicalRequest, requestHash: keccak256(toUtf8Bytes(canonicalRequest)), request };
}
export function attestationDigest(requestHash: string, a: ApiAttestation): string {
  return keccak256(solidityPacked(["bytes32", "uint256", "bytes"], [requestHash, a.timestamp, a.data]));
}
export function hashAttestation(requestHash: string, a: ApiAttestation): string {
  return keccak256(abi.encode(["bytes32", "uint256", "bytes32", "bytes32"],
    [requestHash, a.timestamp, keccak256(a.data), keccak256(a.signature)]));
}
export function verifyApiAttestation(selected: SourceSelection, a: ApiAttestation, requestedAt: bigint, deadline: bigint, now: bigint) {
  if (a.timestamp < requestedAt || a.timestamp > deadline || a.timestamp > now)
    throw new Error(`Invalid attestation time: signed=${a.timestamp}, requested=${requestedAt}, deadline=${deadline}, now=${now}`);
  const bytes = getBytes(a.data);
  const body = toUtf8String(bytes);
  if (bytes.length > 128) throw new Error("Projected payload too large");
  const pattern = selected.source === EntropySource.PokeAPI ? /^\{"value":"[a-z0-9-]+"\}$/
    : selected.source === EntropySource.Weather ? /^\{"value":"-?[0-9]+(?:\.[0-9]+)?"\}$/ : /^\{"value":"[0-9]+(?:\.[0-9]+)?"\}$/;
  if (!pattern.test(body)) throw new Error("Expected exact projected record; full/ignored projection is not accepted");
  const signer = verifyMessage(getBytes(attestationDigest(selected.requestHash, a)), a.signature);
  if (signer.toLowerCase() !== selected.airnode.toLowerCase()) throw new Error("Wrong source signer or request hash");
  return { signer, dataHash: keccak256(a.data), attestationHash: hashAttestation(selected.requestHash, a) };
}

/// Convert a live Airnode envelope. Refuse ignored projections instead of trimming/re-signing data ourselves.
export function parseAirnodeResponse(selected: SourceSelection, envelope: {
  airnode: string; requestHash: string; timestamp: string; data: unknown; signature: string;
}, requestedAt: bigint, deadline: bigint, now: bigint): ApiAttestation {
  if (envelope.requestHash.toLowerCase() !== selected.requestHash.toLowerCase() || envelope.airnode.toLowerCase() !== selected.airnode.toLowerCase())
    throw new Error("Airnode response does not match pinned source/query/projection");
  const data = typeof envelope.data === "string" ? envelope.data : JSON.stringify(envelope.data);
  const a = { timestamp: BigInt(envelope.timestamp), data: hexlify(toUtf8Bytes(data)), signature: envelope.signature };
  verifyApiAttestation(selected, a, requestedAt, deadline, now);
  return a;
}
