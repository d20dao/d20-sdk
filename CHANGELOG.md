# Changelog

## 0.4.0

Both Arc networks run the upgraded contracts. The proxy addresses are unchanged, so nothing in an existing
integration has to move; the coordinator interface a consumer calls is the same as in 0.3.4.

### Protocol

- **The epoch source catalog is an on-chain recipe registry.** A recipe is a canonical request, a data template
  that fixes the exact signed bytes the registry accepts, and the gateway body. `registerRecipe` appends an id
  and a registered recipe never changes. Five sources are active: Hyperliquid BTC day volume, dRPC Ethereum
  block hash, TickerLayer BTCUSD, Nodary ETH/USD and dRPC Base block hash. Arc Testnet already draws from them;
  Arc Mainnet switches at epoch 848 on 2026-09-18.
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
  `scheduleCatalog`, `catalogAt`, `setBackupCommitter` and `isBackupCommitter`. The four-signer catalog views
  (`signersAt`, `catalogHashAt`, `anuSigner`) are gone.
- `replayEpochCommitment` checks the committed packet against the recipe's canonical request and data template,
  and derives the fallback attempt from the committed source.
- Three examples replace the previous two. `examples/DiceConsumer.sol` is a dice roll,
  `examples/RaffleConsumer.sol` draws one winner from a frozen list and `examples/LootDropConsumer.sol` is a
  weighted drop. Each is self-contained and about sixty lines.
- **Removed:** `contracts/examples/MiningRandomnessConsumer.sol`. It was an abstract building block for one
  application, not something to copy on a first day. Nothing else imported it; the payment pattern it showed is
  in [Best practices](README.md#best-practices) and the change-returning variant is in `DiceConsumer`.
- New [Best practices](README.md#best-practices) section in the README, reflected in `AGENTS.md`.
- Vendored protocol re-pinned; `PROTOCOL-PROVENANCE.json` names the commit and the SHA-256 of every file.

## 0.3.4 and earlier

Base-fee request pricing (`quoteFee`, `quoteFeeAt`, `quoteRequestFee`) with overpayment credit, epoch source
fallback, the generated `API.md` reference, the Arc Mainnet deployment and the 50% keeper share.
