# SDK release gate

Status: **blocked; local packaging smoke only**. No npm scope availability/ownership, deployed address or production-readiness claim has been made.

Before proposing release:

- Complete keeper review and readiness decision; resolve or explicitly disposition protocol Seed V2 response-selection risk, source admission and external VRF crypto review.
- Resolve public TypeScript versus Solidity signature-canonicality verification parity; a passing SDK smoke cannot establish protocol equivalence.
- Validate actual chain block timing, fee/native-token behavior, immutable coordinator source/key configuration, game payment refunds and operator recovery.
- Confirm consumer onboarding to the keeper allowlist before accepting live game requests; permissionless coordinator submission is not a service guarantee.
- Verify npm scope ownership, intended registry, package name/version and license/provenance. Review the actual tarball and dependencies for secrets, fixtures, keeper code and test provers.
- From the exact reviewed revision run repository required checks/demo and SDK npm ci/build/pack dry-run/real pack/fresh consumer tests. Review generated ABI and source hashes against the intended contract revision. Test browser and Solidity integration; review AGENTS.md and placeholder addresses.
- Obtain explicit user authorization for a concrete release. Only then prepare a separately reviewed change to the private flag and unconditional prepublishOnly guard, and define authorized release credentials/workflow. Never bypass the guard with --ignore-scripts or an environment switch.

No automated publishing workflow or deployment is included in this work. Retest after any protocol or keeper change; pack/install readiness is not release approval.
