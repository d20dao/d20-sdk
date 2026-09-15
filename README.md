# ArcDao VRF SDK — unreleased alpha

Public epoch attestation, VRF replay and mapping helpers, generated coordinator/epoch-registry ABIs and minimal Solidity consumer imports. The current protocol is epoch API3 plus fixed-key VRF: a signed record is committed before each 200-block service epoch, then every request fixes that epoch ID/hash in its deterministic VRF input. Game fulfillment submits only the real VRF proof; it makes no per-game API call.

`@arcdao/vrf-sdk` `0.1.0-alpha.0` is provisional and private. Scope ownership is unverified. Local pack/install is supported; publishing remains blocked pending protocol/operator review and an explicitly authorized release.

## Build and try locally

With Node >=22.13:

```sh
npm ci
npm run build
npm pack --dry-run
npm pack
npm test
```

Install the tarball reported by `npm pack` in a separate consumer project. There is no published-install or deployment claim.

```js
import { builtins, hashMapping, mapRandomness } from '@arcdao/vrf-sdk';
import { coordinatorAbi, epochEntropyAbi } from '@arcdao/vrf-sdk/abi';
const mapping = builtins.d20();
console.log(hashMapping(mapping));
// Use an independently verified accepted word for real outcomes.
const illustrativeWord = `0x${'00'.repeat(32)}`;
console.log(mapRandomness(illustrativeWord, mapping));
console.log(coordinatorAbi.length, epochEntropyAbi.length);
```

The root exports public ESM and TypeScript declarations; `/epoch` exposes epoch helpers. `/abi` exports `coordinatorAbi` and `epochEntropyAbi`; JSON forms are `@arcdao/vrf-sdk/abi/ArcVRFCoordinator.json` and `@arcdao/vrf-sdk/abi/EpochEntropy.json`. Read installed declarations for exact replay inputs. Runtime dependencies are ethers 6.17.0 and @noble/curves 1.9.7. Solidity imports require compiler **0.8.28**.

## Integrate a consumer

Use the packaged sources and your compiler's npm import resolver:

- `@arcdao/vrf-sdk/contracts/ArcVRFConsumer.sol`
- `@arcdao/vrf-sdk/contracts/interfaces/IArcVRF.sol`
- `@arcdao/vrf-sdk/contracts/libraries/ArcVRFRequests.sol`
- `@arcdao/vrf-sdk/contracts/libraries/RandomnessMapping.sol`
- `@arcdao/vrf-sdk/contracts/examples/MiningRandomnessConsumer.sol`

Start from `examples/DiceConsumer.sol`. Pin the approved chain, deployed coordinator code/configuration, epoch registry and immutable public key. No deployment address is supplied; a constructor code-length check alone does not establish trust. Obtain keeper allowlist onboarding before live requests. Permissionless coordinator acceptance and SDK installation do not guarantee fulfillment.

The dice starter requires exact `msg.value == requestFee()`, fixes the refund recipient to the player and stores the authenticated raw callback word. `result(id)` returns the mapped d20 value from 1 through 20. Built-in mappings still callback with raw `bytes32`; do not treat it directly as the mapped result. Keep minting/transfers separate from the callback. The starter does not implement game-payment refunds, PoW checks, claim locking or minting.

A request is admitted only in a committed epoch. Before the first epoch starts, or when the current epoch has no commitment, creation reverts and retains no request fee. The signed epoch record must be committed before the epoch starts. A late commitment cannot repair an already-started epoch. An accepted request keeps its original epoch across subsequent epoch boundaries.

Valid proof acceptance must occur onchain at or before request time +60 seconds. Callback failure does not undo paid service: `retryCallback(id, gasLimit)` redelivers only the same accepted result. An expired unfulfilled request uses `refundRequest(id)`; payment goes to its fixed recipient or refund credit, not the caller. These recovery functions belong to the full coordinator ABI, not the smaller consumer interface. Game-payment refunds remain separate.

## Verify public evidence

Retrieve successful receipts and state from trusted chain infrastructure. Verify chain, log emitters, deployed code/configuration and actual epoch/request block hashes. The epoch registry's `EpochCommitted.packet` archives the exact query and signed attestation. Use `decodeEpochEvidencePacket` and `replayEpochCommitment` to reconstruct source/query selection, signature, pre-start commitment and epoch hash. Source IDs are 0 for Hyperliquid and 1 for ANU; selected source/query are deterministic and cannot be replaced after failure.

The coordinator's `FulfillmentEvidence.packet` contains only the VRF proof. Decode it with `decodeEvidencePacket`, then use `replayCoordinator` with independently trusted epoch/configuration/request context, actual acceptance block/time and recorded result commitments. Read the exact exported input type. Compare replayed transcript with BOTH event and storage. The proof packet is 416 bytes; neither proof nor epoch packet has a version prefix. Choose the decoder from the trusted emitter/event, not arbitrary packet bytes.

Decoding is not verification. Replay does not authenticate RPC responses or establish receipt inclusion itself. Never derive an expected key or input from the submitted proof. Mapping alone does not verify a proof. Apply the integrator's finality/reorg policy. API3 signatures establish signed wrapper provenance, not unbiased upstream data or immunity to withholding.

This public package does not fetch or publish epochs, generate proofs, hold secrets, send transactions or supply a keeper service. The separate keeper publisher prepares epochs in the background through the same wallet nonce lane as fulfillment; game requests need no additional API fetch.

## Maintenance and release boundary

Build from the pinned `protocol/` snapshot in this repository; no sibling checkout is needed. Canonical upstream is [d20dao/keeper](https://github.com/d20dao/keeper). `PROTOCOL-PROVENANCE.json` records the reviewed commit and source SHA-256 values; every hash is checked at build time. `IMPORT-PROVENANCE.json` preserves import history. Do not fork cryptographic behavior in packaging or hand-edit generated output.

The build mechanically converts relative TypeScript extensions to ESM, emits declarations, compiles coordinator/registry ABIs with pinned solc and copies the minimal consumer Solidity closure byte-for-byte. `BUILD-MANIFEST.json` embeds protocol provenance, dependency-lock hash and imported OpenZeppelin source hashes. Keeper code, coordinator implementation, vendored verifier and test fixtures/provers are excluded from the tarball; licenses and notices are retained.

`npm test` installs an actual tarball in an isolated OS-temp consumer, checks public runtime exports and JSON ABIs, type-checks without `skipLibCheck`, bundles for browser use and compiles consumer Solidity imports. The browser-target bundle is executed under Node; this is not an actual browser-session test. Test fixtures contain public test signatures/proofs and explicit chain context only and are not shipped. Tests require npm registry access and leave the temporary consumer available for inspection.

For agent-assisted work, instruct your agent to read `node_modules/@arcdao/vrf-sdk/AGENTS.md` and this README before integration. Presence in node_modules does not guarantee automatic loading.

Release still requires external cryptographic review, real source admission, epoch publication/recovery and keeper readiness review, actual chain timing/native-fee validation, application refunds, verified registry/scope ownership and explicit release authorization. Passing local package tests does not satisfy those gates. Read `docs/sdk-release-checklist.md`; the private flag and unconditional publish guard remain enabled.
