# SDK release audit — 2026-09-15

**Publish remains blocked.** The alpha package is private and its unconditional prepublishOnly guard remains enabled. Scope ownership, release credentials and release authorization are unverified.

## Four-recipe update

TickerLayer BTCUSD and ETHUSD lastTrade recipes add slots 2 and 3 to the current catalog. Both use the same API3 signer; the catalog now binds four ordered addresses. The 128-byte raw-data bound and full epoch event evidence remain unchanged. Five current live-API3 fixtures cover all four slots and a request fulfilled across an epoch boundary. They come from the canonical 13-epoch/14-request local-chain demo and retain its sourceMode and trace hash in repository-only fixture provenance. The current tarball passed npm test in fresh consumer tohe9c: 33 files, 30,192 compressed bytes and a 283,252-byte browser-target bundle. Installed JavaScript and the browser-target bundle replay every fixture; exact four-address ABI/type checks, codec/input rejection and consumer Solidity compilation pass. The additional epoch-boundary coverage assertion passed against the same installed tarball. All 18 public source files now match exact canonical Git blobs at `dcca615b3e07f273e45fa5596f80b63da241896a`; vendor bytes are unchanged. The final npm test passed after this pin. The known healthy-with-missing-epoch readiness gap remains open.

The canonical independent review closed the JavaScript-number reconstruction signature mismatch and late API-completion state race. These are keeper repairs in the pinned revision; no browser dependency change was needed. The P2 healthy-with-missing-epoch issue remains open and service readiness is still blocked.

## Baseline verification

The public SDK is being synchronized to the single current epoch API3 plus fixed-key VRF coordinator. Public exports comprise mapping, current proof/evidence replay, epoch helpers and coordinator/epoch registry ABIs. The consumer Solidity ABI remains minimal. Source and build provenance record canonical Git revisions and hashes.

The single current source and unprefixed codecs passed npm test in fresh consumer QcZyjj: 33 tarball files, 29,457 compressed bytes and a 282,549-byte browser-target bundle. Both Hyperliquid and ANU fixtures contain real API3 signatures and Rust-generated VRF proofs accepted on the local chain. They were extracted from the canonical epoch demo's replayInput records. Installed JavaScript and the browser-target bundle replay both records. The codec checks account for ethers address checksum formatting without changing fixture bytes. All 18 public protocol files are pinned byte-for-byte to canonical Git blobs at db7101890b151f4539b3f6050d708bf7bfd381c7. The final npm test passed after that pin; source and manifest hashes were checked against those committed blobs.

The smoke installs a real tarball, verifies exported JSON ABIs, type-checks TypeScript without skipLibCheck, executes current epoch/VRF replay, rejects changed epoch ID/hash, wrong proof seed, late fulfillment/commitment and invalid packet lengths/schema, executes a browser-target bundle under Node and compiles shipped Solidity consumer examples. A Node-executed browser bundle is not a live browser-session test.

The package must exclude all fixtures, private keys, proof generation, keeper code and environments. Public test fixtures used by smoke tests remain repository-only. No npm publication, deployment or real-fund operation is authorized by these tests.

## Remaining release gates

External crypto review, real API3 source admission, publisher nonce/restart/reorg recovery, keeper readiness/onboarding, actual chain timing/native-fee behavior, application payments/refunds, registry/scope ownership and concrete release authorization remain separate from package correctness. See sdk-release-checklist.md. Local fixtures do not establish production service availability.
