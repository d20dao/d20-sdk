# SDK release audit — 2026-09-15

**Publish remains blocked.** The alpha package is private and its unconditional prepublishOnly guard remains enabled. Scope ownership, release credentials and release authorization are unverified.

## Current work

The public SDK is being synchronized to the single current epoch API3 plus fixed-key VRF coordinator. Public exports comprise mapping, current proof/evidence replay, epoch helpers and coordinator/epoch registry ABIs. The consumer Solidity ABI remains minimal. Source and build provenance record canonical Git revisions and hashes.

The single current source and unprefixed codecs passed npm test in fresh consumer QcZyjj: 33 tarball files, 29,457 compressed bytes and a 282,549-byte browser-target bundle. Both Hyperliquid and ANU fixtures contain real API3 signatures and Rust-generated VRF proofs accepted on the local chain. They were extracted from the canonical epoch demo's replayInput records. Installed JavaScript and the browser-target bundle replay both records. The codec checks account for ethers address checksum formatting without changing fixture bytes. All 18 public protocol files are pinned byte-for-byte to canonical Git blobs at db7101890b151f4539b3f6050d708bf7bfd381c7. The final npm test passed after that pin; source and manifest hashes were checked against those committed blobs.

The smoke installs a real tarball, verifies exported JSON ABIs, type-checks TypeScript without skipLibCheck, executes current epoch/VRF replay, rejects changed epoch ID/hash, wrong proof seed, late fulfillment/commitment and invalid packet lengths/schema, executes a browser-target bundle under Node and compiles shipped Solidity consumer examples. A Node-executed browser bundle is not a live browser-session test.

The package must exclude all fixtures, private keys, proof generation, keeper code and environments. Public test fixtures used by smoke tests remain repository-only. No npm publication, deployment or real-fund operation is authorized by these tests.

## Remaining release gates

External crypto review, real API3 source admission, publisher nonce/restart/reorg recovery, keeper readiness/onboarding, actual chain timing/native-fee behavior, application payments/refunds, registry/scope ownership and concrete release authorization remain separate from package correctness. See sdk-release-checklist.md. Local fixtures do not establish production service availability.
