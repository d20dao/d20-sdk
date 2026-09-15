# SDK release audit — 2026-09-15

**publish: blocked.** Local pack/install checks do not authorize publication or establish production protocol safety. The package remains private and its unconditional `prepublishOnly` guard remains enabled. The `@arcdao` scope and release credentials/authorization have not been verified.

## Baseline and package checks

The initial SDK checkout was `5a197d7c26f7074e84e4c6e4690739d51894cb09`. Every pinned `protocol/` source, contract and license matched the corresponding canonical keeper file at the start of this audit, whose HEAD was `68c0f131661e7b1292114caf4e8aeb4c43b53044`. The final SDK protocol snapshot is pinned byte-for-byte to canonical commit `7656c3eca6d4b5889254d337c650543e8793af90`, including snapshots.ts, snapshotSourceCatalog, strict attestation encoding and EntropySnapshots.sol. PROTOCOL-PROVENANCE.json records that revision and each file's SHA-256; the build checks every hash. Operational keeper and snapshot collection tooling are intentionally excluded.

Environment: Node 24.19.0, npm 11.17.0, TypeScript 5.9.3, solc 0.8.28, esbuild 0.28.2. `npm ci` and `npm test` passed after the dependency fix below. The smoke runs an explicit build, lifecycle builds, dry-run and real packs, compares file lists, verifies the private flag and failing publish guard, and installs the real tarball in an isolated temporary consumer.

Final `npm test` after pinning canonical commit `7656c3eca6d4b5889254d337c650543e8793af90` passed in fresh consumer `arcdao-sdk-consumer-6kuiFT`: 37 packaged files, 35,926 compressed bytes, and a 297,229-byte browser-target bundle. The public snapshotSourceCatalog export contains all 12 stable IDs and identifies six measured snapshot-admission passes; admission is not production activation.

The fresh consumer executes public ESM exports, checks both JSON ABIs against their JavaScript exports, type-checks with `strict: true` and `skipLibCheck: false`, bundles all public exports for a browser target, executes the resulting bundle under Node, and compiles the packaged DiceConsumer and MiningRandomnessConsumer imports with solc 0.8.28. Every IArcVRF function is checked against the generated coordinator ABI for selector, mutability and return types. Snapshot checks cover an authenticated opaque query, exact record matching, commitment ordering, invalid signatures and browser-bundle configuration-hash agreement. This is browser-target bundle validation, not an actual browser-session test or a live chain deployment.

The allowlisted tarball contains public JavaScript/declarations, generated ABI, five consumer Solidity files, DiceConsumer, agent instructions, README, licenses/notices, build manifest and the blocking publish script. The smoke rejects keeper code, test/prover directories, secrets, environment files, generated TypeScript sources, dependencies and nested tarballs. Runtime dependencies remain exactly ethers 6.17.0 and @noble/curves 1.9.7; both declare MIT. The package preserves the protocol MIT license and Chainlink provenance/full upstream license. The coordinator implementation and verifier are excluded from the distributed Solidity sources.

## Audit fixes

- Pinned solc's build-only transitive `tmp` dependency to 0.2.7 in both the repository and isolated test consumer. This resolves GHSA-52f5-9888-hmc6, GHSA-ph9p-34f9-6g65 and GHSA-7c78-jf6q-g5cm without changing compiler 0.8.28. Full `npm audit --json` and production-only audit report zero known vulnerabilities after the fix. Audit results are time-dependent and do not substitute for security review.
- BUILD-MANIFEST.json now records the package-lock hash and hashes of OpenZeppelin sources used to generate the ABI, in addition to protocol source hashes and compiler version.
- Added complete packaged consumer-interface ABI parity checks.
- Added the snapshot public module, TypeScript types, generated snapshotAbi and JSON export. The build fails on any protocol file whose hash differs from the recorded current provenance. Updated public integration instructions distinguish legacy replay from explicit pinned-catalog replay without reinterpreting old proofs.

## Release gates still requiring disposition

Read `sdk-release-checklist.md` and the final canonical protocol review. External cryptographic review, source admission and actual configuration validation, keeper readiness/onboarding, chain timing/native-fee behavior and application payment/refund behavior remain separate from package correctness. Immutable snapshots require an explicit reviewed new deployment; they do not repair or silently replace legacy deployments. Scope ownership, intended registry/name/version, release credentials and explicit authorization must be resolved before a separately reviewed guard-removal change. No npm publish, deployment, real-fund operation, commit or push was performed by this audit.
