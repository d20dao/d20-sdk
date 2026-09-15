import { EntropySource, SOURCE_ENDPOINTS } from "./sources.ts";

// Catalog visibility is not production activation. Direct recipes still require passing live compatibility checks.
export const sourceCatalog = [
  { id: EntropySource.Weather, name: "CustomWeather", endpoint: SOURCE_ENDPOINTS[0], policy: "direct-historical-record",
    status: "projection-compatibility-blocked", operation: "dailyClimateHistory", sourceType: "third-party-airnode" },
  { id: EntropySource.PokeAPI, name: "PokeAPI", endpoint: SOURCE_ENDPOINTS[1], policy: "direct-historical-record",
    status: "projection-compatibility-blocked", operation: "getPokemonForm", sourceType: "third-party-airnode" },
  { id: EntropySource.Hyperliquid, name: "Hyperliquid", endpoint: SOURCE_ENDPOINTS[2], policy: "direct-historical-record",
    status: "live-probe-passed-not-production-certified", operation: "candleSnapshot", sourceType: "third-party-airnode" },
  { id: EntropySource.AnuQrng, name: "ANU Quantum Numbers", endpoint: SOURCE_ENDPOINTS[3], policy: "precommitted-snapshot-required",
    status: "not-enabled", operation: "randomNumbers", sourceType: "third-party-airnode" },
  { id: EntropySource.NasaEonet, name: "NASA EONET", endpoint: SOURCE_ENDPOINTS[4], policy: "precommitted-snapshot-required",
    status: "not-enabled", operation: "getEvent", sourceType: "third-party-airnode" },
  { id: EntropySource.Usgs, name: "USGS Earthquakes", endpoint: SOURCE_ENDPOINTS[5], policy: "precommitted-snapshot-required",
    status: "compact-sample-verified-not-enabled", operation: "countEvents", sourceType: "third-party-airnode" },
  { id: EntropySource.Frankfurter, name: "Frankfurter", endpoint: SOURCE_ENDPOINTS[6], policy: "bounded-historical-recipe-required",
    status: "compact-sample-verified-recipe-pending", operation: "getRate", sourceType: "third-party-airnode" },
  { id: EntropySource.Ecb, name: "ECB Data Portal", endpoint: SOURCE_ENDPOINTS[7], policy: "bounded-historical-recipe-required",
    status: "catalog-only-schema-inspected", operation: "getData", sourceType: "third-party-airnode" },
  { id: EntropySource.GeoDb, name: "GeoDB Cities", endpoint: SOURCE_ENDPOINTS[8], policy: "identified-record-recipe-required",
    status: "compact-sample-verified-recipe-pending", operation: "cityDistance", sourceType: "third-party-airnode" },
  { id: EntropySource.Eodhd, name: "EODHD", endpoint: SOURCE_ENDPOINTS[9], policy: "bounded-historical-recipe-required",
    status: "compact-sample-verified-recipe-pending", operation: "eodPrices", sourceType: "third-party-airnode" },
  { id: EntropySource.PandaScore, name: "PandaScore", endpoint: SOURCE_ENDPOINTS[10], policy: "identified-record-recipe-required",
    status: "catalog-only-schema-inspected", operation: "getMatch", sourceType: "third-party-airnode" },
  { id: EntropySource.Eurostat, name: "Eurostat", endpoint: SOURCE_ENDPOINTS[11], policy: "bounded-historical-recipe-required",
    status: "catalog-only-schema-inspected", operation: "getData", sourceType: "third-party-airnode" },
] as const;

// Planned narrow record profiles, not promises of source immutability or uptime.
export const preferredRecordProfiles = [
  {source: EntropySource.PokeAPI, record: "Pinned numeric form ID and one name/type field", avoid: "Search, random IDs selected by keeper, sprites/full resources"},
  {source: EntropySource.Hyperliquid, record: "Exact market and closed hourly candle", avoid: "Live order books, allMids, incomplete candles"},
  {source: EntropySource.Frankfurter, record: "One currency pair on an explicit past business date", avoid: "latest, unsupported currency/day fallback"},
  {source: EntropySource.Ecb, record: "One EXR series and one explicit published observation", avoid: "Wildcards, unpublished weekends, provisional/revised versions without a pinned record"},
  {source: EntropySource.GeoDb, record: "Country/city identifier and a bounded reference field", avoid: "Population, cityDateTime, unconstrained searches"},
  {source: EntropySource.Eodhd, record: "One instrument and raw close from a completed session", avoid: "Live quotes, news, retrospectively split-adjusted close"},
] as const;
