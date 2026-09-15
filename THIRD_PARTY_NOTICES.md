# Third-party attribution

The redistributed consumer Solidity files and public TypeScript helpers are from this repository under its MIT LICENSE. The coordinator ABI is generated, not hand-maintained. The coordinator implementation and Chainlink Solidity verifier are not distributed as SDK runtime or import sources.

Public proof verification implements compatibility with the pinned Chainlink secp256k1/Keccak construction. Its upstream provenance and full preserved root license are included in `notices/PROVENANCE.md` and `notices/CHAINLINK-LICENSE`. The provenance path describes the original repository, not a bundled verifier. This is not a Chainlink service or an extension of an upstream audit.

`ethers` and `@noble/curves` are runtime npm dependencies, not copied/bundled source. Their distributions carry their own licenses and transitive dependency notices. Build-only Solidity compilation uses OpenZeppelin 5.6.1 and solc 0.8.28; neither is bundled into the public JavaScript.
