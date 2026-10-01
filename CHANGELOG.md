# Changelog

## 0.5.0

Replay covers drand beacon epochs. Arc Testnet draws its epochs from drand since epoch 11319 (2026-09-30) and Arc
Mainnet since epoch 12448 (2026-10-01). The proxy addresses are unchanged and the
interface a consumer calls is the same as in 0.4.0, so a consumer needs no change. Replay tools do: 0.4.0 rejects a
beacon epoch's 64-byte signature with `Expected canonical 65-byte low-s EIP-191 signature`.

### Protocol

- **The registry has beacon recipes.** `registerBeacon` appends a public randomness beacon as an immutable recipe;
  `beaconOf`, `slotSigner`, `verifyBeacon`, `BEACON_VERIFY_GAS` and `BEACON_DOMAIN` read it, and `BeaconRegistered`
  and `BeaconGasTooLow` are the new event and error. An epoch it serves commits one drand round: the round number as
  data, the round's scheduled time as timestamp and the beacon's 64-byte BLS signature, which the stateless
  `D20BeaconVerifier` (BLS on BN254, built on the unmodified kevincharm/bls-bn254 library) checks on chain. The
  catalog's signer for a beacon slot is `slotSigner(recipe)`.
- `scheduleCatalog` keeps the version that takes effect at the next epoch and replaces only a version two or more
  epochs ahead. A beacon recipe must be listed with its `slotSigner`.
- New registry implementation `0xD20dA0853a6f894c0cdc9018fD4F8F67Eac15704` and verifier
  `0xd20dA01Aa16AeD6b77Cd8DDb869151802599100a` on both chains, behind the unchanged proxies: Arc Testnet from block
  64712965, Arc Mainnet from block 23724929 (transaction
  `0x5a7a2fa8f15eefccee99f6bd363ce7717e65c5571c8c76396337fd8a1261a7cb`).
  `protocol/` now also carries the source of the coordinator implementation `0xD20da000125643B4db5A6A36A3b853c17745DF44`
  live since 2026-09-22: the batch gas guard and the zero minimum fee check.
- Catalogs: Arc Testnet `[0,1,2,4,5]` from epoch 966, `[6,7,8,9,10]` from 10108 and `[11]` from 11319; Arc Mainnet
  `[0,1,2,4,5]` from epoch 848, `[6,7,8,9,10]` from 10070 and `[11]` from 12448.

### SDK

- `replayEpochCommitment` and `replayCoordinator` verify both record types. A beacon epoch needs the registration in
  the recipe book: round, scheduled time, BLS signature and slot signer are checked. Signed-record epochs replay as
  before: nine Arc Mainnet and three Arc Testnet signed-record requests give the same result in 0.4.0 and 0.5.0.
- `readEpochRecipes` reads `beaconOf` for a recipe that names drand and accepts `{ blockTag }`. `EpochRecipe` has an
  optional `beacon` registration.
- New exports: `DRAND_EVMNET`, `BEACON_TEMPLATE`, `BEACON_DST`, `BEACON_DOMAIN`, `beaconRoundTime`, `beaconRoundAt`,
  `encodeBeaconRound`, `decodeBeaconRound`, `beaconCanonicalRequest`, `beaconSlotSigner`, `beaconRoundMessage`,
  `verifyBeaconRound` and `BeaconRegistration`. The passthrough-recipe helpers of the protocol source are exported too:
  `PASSTHROUGH`, `PASSTHROUGH_EPOCH_REQUESTS`, `passthroughEpochRecipe`, `canonicalPassthroughRequest`,
  `parsePassthroughRequest` and `passthroughUrl`; `canonicalRequestOfBody` accepts a passthrough body.
- `beaconVerifierAbi` and `abi/D20BeaconVerifier.json` are the verifier's ABI, and `epochEntropyAbi` covers the beacon
  functions. `API.md` documents them and the changed coordinator source.
- The BN254 curve comes from `@noble/curves` 1.9.7, the version already in use. It is read only inside the functions
  that verify a round, so a bundler leaves it out of a bundle that reaches none of them; importing the package in Node
  loads it, which adds about 45 ms.
- Tests replay real Arc requests recorded from the public RPCs, with tampered-signature, wrong-round, wrong-signer and
  missing-registration cases, and real drand rounds checked against another library's hash-to-curve points.
- README and `AGENTS.md`: verification covers both record types, the catalog history replaces the single five-source
  catalog, the implementation tables list the registry upgrade and the verifier, and `protocol/` is described as a
  byte-for-byte copy of the keeper source at the pinned commit, checked by its SHA-256 list; that commit is ahead of the
  latest release of the public keeper repository.
- Vendored protocol re-pinned; `PROTOCOL-PROVENANCE.json` names the commit and the SHA-256 of every file, including
  the vendored bls-bn254 library, whose license ships as `notices/BLS-BN254-LICENSE`.

## 0.4.0

Both Arc networks run the upgraded contracts. The proxy addresses are unchanged, so nothing in an existing
integration has to move; the coordinator interface a consumer calls is the same as in 0.3.4.

### Protocol

- **The epoch source catalog is an on-chain recipe registry.** A recipe is a canonical request, a data template
  that fixes the exact signed bytes the registry accepts, and the gateway body. `registerRecipe` appends an id
  and a registered recipe never changes. Five sources are active: Hyperliquid BTC day volume, dRPC Ethereum
  block hash, TickerLayer BTCUSD, Nodary ETH/USD and dRPC Base block hash. Arc Testnet draws from them
  from epoch 966 and Arc Mainnet from epoch 848.
- **The keeper share follows the wallet that serves the request.** At proof acceptance `keeperFeeBps` of the
  escrowed fee goes to the submitting wallet when the registry authorizes it — the committer or an allowed
  backup committer — and to `committer()` for any other submitter. Backup committers let a second keeper take
  over. Consumers see no API change.
- New implementations behind the unchanged proxies on both chains: registry
  `0xd20dA048C969e5aDcC703Dfdf8220cc9dCB2f865`, coordinator `0xd20da0DADa4352A1a9722be43a2D85923443458c`.

### SDK

- New epoch helpers for the registry: `BUILTIN_EPOCH_RECIPES`, `readEpochRecipes`, `resolveEpochCatalog` and
  `MAX_ATTESTATION_AGE`, plus the data-template helpers `encodeDataTemplate`, `decodeDataTemplate`,
  `matchesDataTemplate`, `isValidDataTemplate` and `validateDataTemplate` on the root entry point.
- `epochEntropyAbi` and `abi/EpochEntropy.json` cover `registerRecipe`, `getRecipe`, `recipeCount`,
  `scheduleCatalog`, `catalogAt`, `setBackupCommitter`, `isBackupCommitter` and `isAuthorizedCommitter`. The
  four-signer catalog views (`signersAt`, `catalogHashAt`, `anuSigner`) are gone.
- `replayEpochCommitment` checks the committed packet against the recipe's canonical request and data template,
  and derives the fallback attempt from the committed source.
- Three examples replace the previous two. `examples/DiceConsumer.sol` is a dice roll,
  `examples/RaffleConsumer.sol` draws one winner from a frozen list and shows the `_onRefund` hook, and
  `examples/LootDropConsumer.sol` is a weighted drop. Each is self-contained and sixty to seventy lines.
- **Removed:** `contracts/examples/MiningRandomnessConsumer.sol`. It was an abstract building block for one
  application, not something to copy on a first day. Nothing else imported it; the payment pattern it showed is
  in [Best practices](README.md#best-practices) and the change-returning variant is in `DiceConsumer`.
- New [Best practices](README.md#best-practices) section in the README, reflected in `AGENTS.md`.
- Vendored protocol re-pinned; `PROTOCOL-PROVENANCE.json` names the commit and the SHA-256 of every file.

## 0.3.4 and earlier

Base-fee request pricing (`quoteFee`, `quoteFeeAt`, `quoteRequestFee`) with overpayment credit, epoch source
fallback, the generated `API.md` reference, the Arc Mainnet deployment and the 50% keeper share.
