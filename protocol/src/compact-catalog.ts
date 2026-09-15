import { EntropySource } from "./sources.ts";

// Admission budgets concern the exact SIGNED data bytes, not a locally trimmed/reformatted response.
export const COMPACT_DATA_TARGET_BYTES = 128;
export const COMPACT_DATA_MAX_BYTES = 256;
export const EVIDENCE_PACKET_MAX_BYTES = 1024;

export function responseSizeTier(bytes: number): "preferred" | "acceptable" | "reject" {
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > COMPACT_DATA_MAX_BYTES) return "reject";
  return bytes <= COMPACT_DATA_TARGET_BYTES ? "preferred" : "acceptable";
}

// Six bounded operation profiles, not six activated coordinator sources.
// Size compatibility never overrides source immutability or cryptographic release blockers.
export const compactResponseProfiles = [
  { source: EntropySource.Hyperliquid, operation: "candleSnapshot", payload: "One provider-signed closed-candle close projection",
    gate: "direct-recipe-exists-review-pending", expectedShape: '{"value":"price"}', measuredDataBytes: 19 },
  { source: EntropySource.Frankfurter, operation: "getRate", payload: "One currency pair on one fixed past business date",
    gate: "recipe-not-implemented", expectedShape: "One rate record", measuredDataBytes: 62 },
  { source: EntropySource.GeoDb, operation: "cityDistance", payload: "One distance between two fixed city identifiers",
    gate: "recipe-not-implemented", expectedShape: "One distance value", measuredDataBytes: 15 },
  { source: EntropySource.Eodhd, operation: "eodPrices", payload: "One instrument, one completed session, daily period",
    gate: "recipe-not-implemented", expectedShape: "One-element OHLC array", measuredDataBytes: 120 },
  { source: EntropySource.Usgs, operation: "countEvents", payload: "Count only, explicit historical window and format",
    gate: "precommitted-snapshot-required", expectedShape: "One count record", measuredDataBytes: 30 },
  { source: EntropySource.AnuQrng, operation: "randomNumbers", payload: "A bounded 32-byte quantum-number sample",
    gate: "precommitted-snapshot-required", expectedShape: "Four hex8 strings, eight bytes each", measuredDataBytes: 128 },
] as const;
