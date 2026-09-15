# ArcDao VRF SDK â€” unreleased alpha

Public replay/mapping/evidence helpers, a compiler-generated coordinator ABI and minimal Solidity consumer imports. Package name `@arcdao/vrf-sdk` and version `0.1.0-alpha.0` are provisional; scope ownership is not verified. Local pack/install is supported. Publishing is blocked by `private: true` and an unconditional prepublishOnly guard pending keeper readiness, protocol review and an explicitly authorized release.

## Build and try locally

From this directory in the repository, with Node >=22.13:

```sh
npm ci
npm run build
npm pack --dry-run
npm pack
npm test
```

Install the resulting local tarball in a separate project (there is no published-install claim):

```sh
npm install /absolute/path/to/arcdao-vrf-sdk-0.1.0-alpha.0.tgz
```

```js
import { builtins, hashMapping, mapRandomness } from '@arcdao/vrf-sdk';
import { coordinatorAbi } from '@arcdao/vrf-sdk/abi';
const mapping = builtins.d20();
console.log(hashMapping(mapping));
// Use ONLY the word from an independently verified accepted request in a real integration.
const illustrativeWord = `0x${'00'.repeat(32)}`;
console.log(mapRandomness(illustrativeWord, mapping));
console.log(coordinatorAbi.length);
```

ESM JavaScript and `.d.ts` are exported at the root. `@arcdao/vrf-sdk/abi` exports `coordinatorAbi` and `snapshotAbi`; JSON forms are available at `@arcdao/vrf-sdk/abi/ArcVRFCoordinator.json` and `@arcdao/vrf-sdk/abi/EntropySnapshots.json`. Runtime dependencies are ethers 6.17.0 and @noble/curves 1.9.7. Solidity imports require compiler **0.8.28**. `examples/DiceConsumer.sol` is a compilable starter using the actual request helper and authenticated raw-word callback. Copy/adapt it in your contract project and use your tool's npm/node_modules import resolver. No deployment address is supplied: configure `<VERIFIED_COORDINATOR_ADDRESS>` on `<VERIFIED_CHAIN_ID>` after validating code and immutable configuration. The constructor's code check alone does not establish trust.

Solidity import paths:

- `@arcdao/vrf-sdk/contracts/ArcVRFConsumer.sol`
- `@arcdao/vrf-sdk/contracts/interfaces/IArcVRF.sol`
- `@arcdao/vrf-sdk/contracts/libraries/ArcVRFRequests.sol`
- `@arcdao/vrf-sdk/contracts/libraries/RandomnessMapping.sol`
- `@arcdao/vrf-sdk/contracts/examples/MiningRandomnessConsumer.sol` (abstract game integration building block)

The d20 example requires exact `msg.value == requestFee()`, fixes the refund recipient to the player and stores the raw callback word. `result(id)` returns the coordinator's mapped value from 1 through 20. A valid proof must be accepted onchain within 60 seconds. A failing callback does not undo paid service; `retryCallback(id, gasLimit)` can only redeliver the accepted result. Expired unfulfilled requests use `refundRequest(id)`; transfers go to the fixed recipient (or its refund credit), not the caller. These recovery functions are in the generated full coordinator ABI, not the smaller IArcVRF consumer interface. The starter does not implement game payment refunds, PoW checks, claim locking or minting.

## Verify public evidence

Use `decodeEvidencePacket` on FulfillmentEvidence.packet, then `replayCoordinator` with `apiProof: decoded.apiProof` and `vrfProof: decoded.proof` plus independently trusted chain context. Inspect the exported TypeScript input type for exact fields. Fetch a successful receipt from your trusted chain/indexer and check the log emitter equals the pinned coordinator on the pinned chain. Use the actual acceptance block timestamp, request anchor block hash and request's immutable public key, mapping and source configuration. Pass the actual `enabledSourceMask` explicitly; the helper default is not a deployment recommendation. Compare replayed transcriptHash to BOTH the event and recorded storage. Acceptance is proof inclusion, not callback success. Reorg/finality policy and trusted RPC selection belong to the integrator.

Decoding alone is not verification. replayCoordinator checks provided computations/commitments; it does not authenticate the RPC, receipt or its input context. Never derive the expected key/seed from an untrusted proof. `mapRandomness` alone does not verify a proof. No source API calls, transactions, secret storage or keeper service are supplied by this SDK. Catalog inclusion does not activate a source or establish immutable/unbiased source data.

## Maintenance and release boundary

For an approved V2 snapshot deployment, use `snapshotAbi` to read the immutable source's `recordCount()`, `getRecord(index)`, `committedAt()` and `configurationHash()`. Construct a `SnapshotCatalog` with `records` and the independently trusted `committedAt` timestamp, and provide it as `replayCoordinator`'s optional `snapshotCatalog`. The hash from `snapshotConfigurationHash(records)` must match the request's pinned source configuration; replay checks this binding. `sourceSigners` remains a required input for API compatibility but is unused in snapshot mode (pass `[]`). Legacy deployments omit `snapshotCatalog` and retain their original source recipes and actual enabled mask. Never infer a mode from a proof packet or silently substitute a newer catalog.

Snapshot records contain `{ source, airnode, canonicalRequest, attestation: { timestamp, data, signature } }`. The exact signed records must have been committed before the request; catalog expansion requires a new immutable source and coordinator deployment. `selectSnapshot` and `verifySnapshotAttestation` preserve the committed query bytes even when the query is opaque. `snapshotApiRequest` is an optional display/HTTP conversion that may reject an opaque query; it is not required for replay. Snapshots prevent substituting another signed response after commitment, but their public data is not secret entropy and their signatures do not prove the underlying data unbiased or institutionally signed.

Installing the SDK or deploying a consumer does not guarantee service. The keeper uses an explicit consumer allowlist even though the coordinator can accept requests publicly. Obtain approved deployment configuration and consumer onboarding before live requests; this package supplies no onboarding API or operational service.

For agent-assisted work, add this instruction to your own project's AGENTS.md: "Before integrating ArcDao VRF, read `node_modules/@arcdao/vrf-sdk/AGENTS.md` and its README." Bundling instructions under node_modules does not guarantee your agent automatically loads them.

Build reads the pinned `protocol/src/*.ts` and `protocol/contracts/` snapshot in this repository; no sibling checkout is needed. It checks every snapshot file against PROTOCOL-PROVENANCE.json, mechanically changes relative module extensions for ESM and emits declarations; do not hand-edit generated output. ABI generation compiles the pinned coordinator and snapshot sources with pinned solc. BUILD-MANIFEST.json includes protocol provenance, source hashes, the dependency-lock hash and imported OpenZeppelin source hashes. Consumer Solidity is copied byte-for-byte, with its minimal import closure. The coordinator and snapshot implementations, vendored verifier, keeper and test prover are excluded. Preserve LICENSE and third-party notices.

`npm test` creates an isolated OS-temp consumer, installs the real tarball and fresh test tools, executes public exports, compiles TypeScript without skipLibCheck, bundles all public exports for browser use and compiles the packaged Solidity examples. It leaves the temp project for inspection and needs npm registry access. This validates packaging, not production cryptography or protocol safety. No publish or deployment command runs.

Release remains blocked on keeper review/readiness, legacy direct-source Seed V2 response-selection risk, review of the new immutable snapshot mode, source admission, external crypto review, actual chain timing/native-token fee behavior, game refunds and release configuration. TypeScript now enforces Solidity-compatible 65-byte, v=27/28, low-s attestation encoding; retain parity regression coverage. Read packaged AGENTS.md before agent-assisted integration and repository `docs/sdk-release-checklist.md` before any proposed release.

Packaging references: [npm files and package metadata](https://docs.npmjs.com/cli/v11/configuring-npm/package-json), [npm lifecycle scripts](https://docs.npmjs.com/cli/v11/using-npm/scripts), [TypeScript library compiler options](https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options.html).

## Source ownership

The keeper/protocol repository is [d20dao/keeper](https://github.com/d20dao/keeper). `protocol/` is a reviewed snapshot for independent SDK builds; `IMPORT-PROVENANCE.json` preserves the original import history and `PROTOCOL-PROVENANCE.json` records the current snapshot hashes and canonical revision status. When protocol interfaces or replay logic change, update this snapshot from a reviewed keeper revision, record its provenance and rerun the full package tests. Do not patch generated output or silently diverge protocol logic.
