// Public computation only, safe to bundle for browsers.
import { bn254 } from "@noble/curves/bn254";
import { mod, pow } from "@noble/curves/abstract/modular";
import { AbiCoder, concat, dataSlice, getAddress, getBytes, hexlify, id, keccak256, toBeHex, toUtf8Bytes, toUtf8String, type BytesLike } from "ethers";
import { encodeDataTemplate, matchesDataTemplate } from "./templates.ts";

/// A beacon recipe's registration as EpochEntropy.beaconOf returns it: round r is scheduled at genesis + (r - 1) × period,
/// and verifier checks the round's signature under publicKey. chainHash names the beacon network.
export interface BeaconRegistration { verifier: string; chainHash: string; publicKey: string; genesis: bigint; period: bigint; }

/// RFC 9380 domain separation tag of the bls-bn254-unchained-on-g1 hash-to-curve, as in D20BeaconVerifier.
export const BEACON_DST = "BLS_SIG_BN254G1_XMD:KECCAK-256_SVDW_RO_NUL_";
export const BEACON_DOMAIN = id("D20_EPOCH_BEACON");
/// drand's evmnet, the network D20's beacon recipe follows: its chain hash, group key in drand's word order, and schedule.
export const DRAND_EVMNET = Object.freeze({
  chainHash: "0x04f1e9062b8a81f848fded9c12306733282b2727ecced50032187751166ec8c3",
  publicKey: "0x07e1d1d335df83fa98462005690372c643340060d205306a9aa8106b6bd0b3820557ec32c2ad488e4d4f6008f89a346f18492092ccc0d594610de2732c8b808f0095685ae3a85ba243747b1b2f426049010f6b73a0cf1d389351d5aaaa1047f6297d3a4f9749b33eb2d904c9d9ebf17224150ddd7abd7567a9bec6c74480ee0b",
  genesis: 1727521075n, period: 3n,
});

const abi = AbiCoder.defaultAbiCoder();
// The BN254 base field order, written out (it is bn254.fields.Fp.ORDER). bn254 is read only inside the functions that verify or
// hash, never at module scope: a bundler can then drop noble's bn254 setup, about 45 ms to evaluate, from every chunk that
// imports this library without verifying a round, such as server chunks that run under a 10 ms CPU budget.
const P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
const MAX_ROUND = (1n << 64n) - 1n, ROUND_DIGITS = 19;

/// A round's signed data is its number in decimal: 1 to 19 digits, no leading zero.
export const BEACON_TEMPLATE = encodeDataTemplate([{ integer: { minDigits: 1, maxDigits: ROUND_DIGITS } }]);
/// The canonical request, and body, of a beacon recipe: ["drand","<chainHash>"] with the hash in lowercase hex.
export function beaconCanonicalRequest(chainHash: string): string {
  if (getBytes(chainHash).length !== 32) throw new Error("A beacon chain hash is 32 bytes");
  return `["drand","${hexlify(chainHash)}"]`;
}
/// The signer a catalog lists for a beacon recipe: an identity derived from its registration, not a key.
export function beaconSlotSigner(b: BeaconRegistration): string {
  return getAddress(dataSlice(keccak256(abi.encode(["bytes32", "address", "bytes32", "bytes32", "uint64", "uint64"],
    [BEACON_DOMAIN, b.verifier, b.chainHash, keccak256(b.publicKey), b.genesis, b.period])), 12));
}

// Rounds are uint64 onchain. A round the registry commits is at least 1: its template refuses a leading zero.
const isRound = (round: bigint, min: bigint) => typeof round === "bigint" && round >= min && round <= MAX_ROUND;
/// When round is scheduled: genesis + (round - 1) × period, as the registry computes it.
export function beaconRoundTime(b: Pick<BeaconRegistration, "genesis" | "period">, round: bigint): bigint {
  if (!isRound(round, 1n)) throw new Error("Invalid beacon round");
  return b.genesis + (round - 1n) * b.period;
}
/// The latest round scheduled at or before timestamp; 0 before genesis.
export function beaconRoundAt(b: Pick<BeaconRegistration, "genesis" | "period">, timestamp: bigint): bigint {
  return timestamp < b.genesis ? 0n : (timestamp - b.genesis) / b.period + 1n;
}
/// The data a round is committed with: its number in decimal, as ASCII bytes.
export function encodeBeaconRound(round: bigint): string {
  if (round < 1n || round.toString().length > ROUND_DIGITS) throw new Error("Invalid beacon round");
  return hexlify(toUtf8Bytes(round.toString()));
}
/// Throws unless data is exactly a round number in canonical decimal, the only data a beacon recipe accepts.
export function decodeBeaconRound(data: BytesLike): bigint {
  if (!matchesDataTemplate(BEACON_TEMPLATE, data)) throw new Error("Invalid beacon round data");
  return BigInt(toUtf8String(data));
}

// RFC 9380 hash_to_curve for BN254 G1 as BLS.sol computes it, line for line: expand_message_xmd with keccak256, two
// 48-byte field elements, the Shallue-van de Woestijne map with Z = 1, then their sum. G1 has cofactor 1, so no clearing.
const C1 = 4n, C2 = (P - 1n) / 2n; // g(Z), and -Z / 2, which is also the Legendre exponent
const C3 = 0x16789af3a83522eb353c98fc6b36d713d5d8d1cc5dffffffan; // sqrt(-12), the even root
const C4 = 0x10216f7ba065e00de81ac1e7808072c9dd2b2385cd7b438469602eb24829a9bdn; // -16 / 3
const g = (x: bigint) => mod(x * x * x + 3n, P);
const isSquare = (a: bigint) => pow(a, C2, P) === 1n;

// expand_message_xmd (RFC 9380 section 5.3.1) to 96 bytes: keccak256 has 32-byte digests and 136-byte blocks.
function expandMessage(message: Uint8Array): Uint8Array {
  const dst = toUtf8Bytes(BEACON_DST), suffix = concat([dst, Uint8Array.of(dst.length)]);
  const b0 = getBytes(keccak256(concat([new Uint8Array(136), message, Uint8Array.of(0, 96, 0), suffix])));
  const blocks: Uint8Array[] = [];
  for (let i = 1; i <= 3; i++)
    blocks.push(getBytes(keccak256(concat([i === 1 ? b0 : b0.map((byte, at) => byte ^ blocks[i - 2][at]), Uint8Array.of(i), suffix]))));
  return getBytes(concat(blocks));
}
function mapToPoint(u: bigint): { x: bigint; y: bigint } {
  let tv1 = mod(u * u * C1, P);
  const tv2 = mod(1n + tv1, P);
  tv1 = mod(1n - tv1, P);
  const tv3 = pow(mod(tv1 * tv2, P), P - 2n, P); // inv0: zero maps to zero
  const tv5 = mod(mod(mod(u * tv1, P) * tv3, P) * C3, P);
  const x1 = mod(C2 - tv5, P), x2 = mod(C2 + tv5, P);
  const tv8 = mod(mod(tv2 * tv2, P) * tv3, P);
  const x3 = mod(1n + C4 * mod(tv8 * tv8, P), P);
  const x = isSquare(g(x1)) ? x1 : isSquare(g(x2)) ? x2 : x3;
  const y = pow(g(x), (P + 1n) / 4n, P);
  if (mod(y * y, P) !== g(x)) throw new Error("Map to curve failed");
  return { x, y: (y & 1n) === (u & 1n) ? y : P - y }; // sgn0 is parity
}
/// The G1 point that round's signature signs: hash-to-curve of keccak256(round as 8 big-endian bytes) under BEACON_DST.
export function beaconRoundMessage(round: bigint): { x: bigint; y: bigint } {
  if (!isRound(round, 0n)) throw new Error("Invalid beacon round");
  const uniform = expandMessage(getBytes(keccak256(toBeHex(round, 8)))), G1 = bn254.G1.Point;
  const [p0, p1] = [uniform.subarray(0, 48), uniform.subarray(48)].map(bytes => G1.fromAffine(mapToPoint(BigInt(hexlify(bytes)) % P)));
  const { x, y } = p0.add(p1).toAffine();
  return { x, y };
}

const words = (bytes: Uint8Array) => Array.from({ length: bytes.length / 32 }, (_, i) => BigInt(hexlify(bytes.subarray(32 * i, 32 * i + 32))));
// Points must be canonical (coordinates below the field order), not the infinity encoding, and on the curve; a G2 key must
// also lie in the prime-order subgroup, which D20BeaconVerifier leaves to the pairing precompile.
function g1Point(bytes: Uint8Array) {
  const [x, y] = words(bytes);
  if (x >= P || y >= P) throw new Error("Non-canonical G1 point");
  const point = bn254.G1.Point.fromAffine({ x, y });
  if (point.is0()) throw new Error("G1 point at infinity");
  point.assertValidity();
  return point;
}
function g2Point(bytes: Uint8Array) {
  const [xIm, xRe, yIm, yRe] = words(bytes); // drand's order: the imaginary word first
  if ([xIm, xRe, yIm, yRe].some(word => word >= P)) throw new Error("Non-canonical G2 point");
  const point = bn254.G2.Point.fromAffine({ x: { c0: xRe, c1: xIm }, y: { c0: yRe, c1: yIm } });
  if (point.is0()) throw new Error("G2 point at infinity");
  point.assertValidity();
  return point;
}
/// Whether signature (64 bytes, x ‖ y) is the beacon's signature of round under publicKey (128 bytes, x_im ‖ x_re ‖ y_im
/// ‖ y_re): e(signature, G2) == e(H(round), publicKey). Malformed input is false, never a throw.
export function verifyBeaconRound(publicKey: BytesLike, round: bigint, signature: BytesLike): boolean {
  try {
    const key = getBytes(publicKey), sig = getBytes(signature);
    if (key.length !== 128 || sig.length !== 64 || !isRound(round, 0n)) return false;
    const pk = g2Point(key), sigma = g1Point(sig), { Fp12 } = bn254.fields;
    return Fp12.eql(bn254.pairing(sigma, bn254.G2.Point.BASE), bn254.pairing(bn254.G1.Point.fromAffine(beaconRoundMessage(round)), pk));
  } catch {
    return false;
  }
}
