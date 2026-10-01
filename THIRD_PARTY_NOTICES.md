# Third-party attribution

The redistributed consumer Solidity files and public TypeScript helpers are from this repository under its MIT LICENSE: the protocol sources are vendored from d20dao/keeper as recorded in PROTOCOL-PROVENANCE.json, and the fee-quoting helper (`src/fees.ts`) is maintained here. The coordinator, registry and beacon verifier ABIs are generated, not hand-maintained. The coordinator implementation, the beacon verifier and the Chainlink Solidity verifier are not distributed as SDK runtime or import sources.

Public proof verification implements compatibility with the pinned Chainlink secp256k1/Keccak construction. Its upstream provenance and full preserved root license are included in `notices/PROVENANCE.md` and `notices/CHAINLINK-LICENSE`. The provenance path describes the original repository, not a bundled verifier. This is not a Chainlink service or an extension of an upstream audit.

Beacon verification implements, in TypeScript, the hash-to-curve and point checks of the kevincharm/bls-bn254 library (MIT), on which the `D20BeaconVerifier` contract is built. Its upstream provenance is in `notices/PROVENANCE.md` and its preserved MIT license in `notices/BLS-BN254-LICENSE`; the library source is not distributed as SDK runtime or import source. This is not a drand or League of Entropy service or an extension of any upstream review.

`ethers` and `@noble/curves` are runtime npm dependencies, not copied/bundled source. Their distributions carry their own licenses and transitive dependency notices. Build-only Solidity compilation uses OpenZeppelin 5.6.1 and solc 0.8.28; neither is bundled into the public JavaScript.

The repository and isolated smoke consumer override solc's build-only `tmp` dependency to 0.2.7 to address GHSA-52f5-9888-hmc6, GHSA-ph9p-34f9-6g65 and GHSA-7c78-jf6q-g5cm while preserving compiler 0.8.28. npm overrides apply only at a project's root; this does not impose an override on SDK consumers, and solc is not an SDK runtime dependency.
