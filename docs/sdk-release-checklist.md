# SDK release gate

Status: **blocked; local packaging verification only**. No npm scope ownership, live source admission, deployed address or production-readiness claim is made.

Before proposing release:

- Review the real fixed-key VRF, deterministic epoch selection, exact signed payload validation and pre-start commitment behavior. Obtain external cryptographic review.
- Verify epoch publisher nonce ownership, persisted response/proof reuse, restart/reorg recovery, expiry, wallet caps and keeper service readiness.
- Validate real API3 source admission, chain block timing/native-token fee behavior, immutable coordinator/registry/key configuration and game-payment refunds.
- Confirm consumer allowlist onboarding. Permissionless request submission is not a service guarantee.
- Confirm registry/scope ownership, package name/version, intended registry and license/provenance. Review the actual tarball for secrets, fixtures, keeper code and test provers.
- From the exact canonical pinned commit, run required protocol/keeper checks and SDK npm ci/test. Review source hashes, generated ABI, public JS/TypeScript, browser-target and Solidity consumer tests. Review installed AGENTS.md and instructions.
- Obtain explicit authorization for the concrete release, then separately review private-flag/publish-guard removal and release credentials/workflow. Never bypass the guard.

No automated publish or deployment is included. Retest after canonical changes; local installation readiness is not release approval.
