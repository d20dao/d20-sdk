// SDK-owned network data (not part of the vendored protocol copy): the public D20DAO deployments, copied from their
// deployment manifests. Addresses are valid together with the manifest revision they came from; implementations move only
// through owner-authorized upgrades, so check the implementation behind a proxy before relying on it.

/** `epoch`: requests bind an epoch packet published by `EpochEntropy` (Arc). `round`: requests bind a future drand round (Robinhood Chain). */
export type D20CoordinatorKind = "epoch" | "round";
export type D20NetworkName = "arc-mainnet" | "arc-testnet" | "robinhood-mainnet" | "robinhood-testnet";

interface NetworkBase {
  name: D20NetworkName;
  /** Human-readable chain name, as for `wallet_addEthereumChain`. */
  displayName: string;
  chainId: bigint;
  testnet: boolean;
  /** Public RPC endpoint of the chain operator. Some providers rate-limit batches; see README "Frontend and backend use". */
  rpcUrl: string;
  explorerUrl: string;
  /** Native gas token, which also pays request fees. 18 decimals on every network here. */
  nativeCurrency: { name: string; symbol: string; decimals: 18 };
  /** Coordinator proxy: the address a consumer is constructed with and requests go to. */
  coordinator: string;
  /** Coordinator implementation behind the proxy at the manifest revision this SDK copies. */
  coordinatorImplementation: string;
  /** `keccak256` of that implementation's runtime code. */
  coordinatorImplementationCodeHash: string;
  /** Stateless drand BN254 verifier, not behind a proxy. */
  beaconVerifier: string;
  /** Owner of the proxies: upgrade authority. */
  owner: string;
  /** `protocolConfigurationHash()` bound at initialization; every transcript commits to it. */
  protocolConfigurationHash: string;
}

/** An Arc deployment: `D20VRFCoordinator` with the `EpochEntropy` epoch registry. */
export interface EpochNetwork extends NetworkBase {
  kind: "epoch";
  registry: string;
  registryImplementation: string;
  registryImplementationCodeHash: string;
}

/** A Robinhood Chain deployment: `D20VRFCoordinatorRobinhood`, which binds each request to a future drand evmnet round. */
export interface RoundNetwork extends NetworkBase {
  kind: "round";
  /** `keyHash()`: `keccak256(abi.encode(publicKey))` of the VRF key. */
  keyHash: string;
  /** Stateless VRF proof check the implementation calls; fixed in the implementation's code. */
  proofVerifier: string;
  /** Linked `LinkedRandomnessMapping` library behind `getMappedResult` and `mapRandomness`. */
  mappingLibrary: string;
  /** Block of the proxy deployment: beacon logs (`readRoundBeaconLogs`) start here. */
  deploymentBlock: bigint;
}

export type D20Network = EpochNetwork | RoundNetwork;

const ETH = Object.freeze({ name: "Ether", symbol: "ETH", decimals: 18 as const });
const USDC = Object.freeze({ name: "USDC", symbol: "USDC", decimals: 18 as const });
const BEACON_VERIFIER = "0xd20dA01Aa16AeD6b77Cd8DDb869151802599100a";
// Arc: both networks run the same implementations behind their own proxies.
const ARC = Object.freeze({
  coordinatorImplementation: "0xD20da000125643B4db5A6A36A3b853c17745DF44",
  coordinatorImplementationCodeHash: "0x3dda400d8360d7e03b8dacd8ba1ffad7ad672e07628bee7de4542d754dd5348c",
  registryImplementation: "0xD20dA0853a6f894c0cdc9018fD4F8F67Eac15704",
  registryImplementationCodeHash: "0xb5e125e3b0f63ffe516d781266c1cbacebe3d131148b69f8736d3ca78bcddb12",
});
// Robinhood Chain: the implementation and its helpers are CREATE2 deployments with the same address on both networks.
const ROBINHOOD = Object.freeze({
  coordinatorImplementation: "0xC8Cd79B9092AEA38f3434388F291eb861b148f45",
  coordinatorImplementationCodeHash: "0xe692b447c02225cb95c921ed29952edb566f2afdfe28ff929452b4909460e8f6",
  proofVerifier: "0x1EEBe8B8f7a6A18b966C3fBe3f644B8234f93709",
  mappingLibrary: "0xA57093a645C1Aed12486da50AfA95F3284826849",
});

/** The public deployments, keyed by name. There is no default network: pick one explicitly. */
export const D20_NETWORKS: Readonly<Record<D20NetworkName, Readonly<D20Network>>> = Object.freeze({
  "arc-mainnet": Object.freeze<EpochNetwork>({
    name: "arc-mainnet", displayName: "Arc Mainnet", kind: "epoch", chainId: 5042n, testnet: false,
    rpcUrl: "https://rpc.mainnet.arc.io", explorerUrl: "https://explorer.arc.io", nativeCurrency: USDC,
    coordinator: "0xd20da057469C45928912d983F45790C41e290571", registry: "0xd20Da048C1A68fa3Bc0B5f5Bc454D1530062C82D",
    ...ARC, beaconVerifier: BEACON_VERIFIER, owner: "0xB57f656149749eff6b496dF090336491f977E744",
    protocolConfigurationHash: "0xa35effe9a9bd1d7c4463215946c65045191be602d92bcb221e8aecf0c8efb9cf",
  }),
  "arc-testnet": Object.freeze<EpochNetwork>({
    name: "arc-testnet", displayName: "Arc Testnet", kind: "epoch", chainId: 5042002n, testnet: true,
    rpcUrl: "https://rpc.testnet.arc.io", explorerUrl: "https://testnet.arcscan.app", nativeCurrency: USDC,
    coordinator: "0xd20DA0FF9087d053f0291524Eac12abA1ADBd945", registry: "0xD20Da00B47A7cD2211dC4683E306913b05903756",
    ...ARC, beaconVerifier: BEACON_VERIFIER, owner: "0xcA35c280c5DF22958Adb74DD03911C8A0ec3eA03",
    protocolConfigurationHash: "0xd88dcce845ab5eb09e95f2512c76c4b1b34306a697c31ac3d1d45deeb499daa4",
  }),
  "robinhood-mainnet": Object.freeze<RoundNetwork>({
    name: "robinhood-mainnet", displayName: "Robinhood Chain", kind: "round", chainId: 4663n, testnet: false,
    rpcUrl: "https://rpc.mainnet.chain.robinhood.com", explorerUrl: "https://robinhoodchain.blockscout.com", nativeCurrency: ETH,
    coordinator: "0xEc8b95B168c87294c45727Bd2ac903d09316D132", ...ROBINHOOD, beaconVerifier: BEACON_VERIFIER,
    owner: "0x7ad78fc8097DFEA5c12DBb503D6EB6E60f34B40B",
    keyHash: "0x9eda619bc1b8267c49204604cad4f5b7cdc1454912faa8141a1e3a9dbe76c003",
    protocolConfigurationHash: "0x66468ef177c711b4380b25f83b4cd461550b896ebaac9e0395abf634cb88f2bf",
    deploymentBlock: 84205956n,
  }),
  "robinhood-testnet": Object.freeze<RoundNetwork>({
    name: "robinhood-testnet", displayName: "Robinhood Chain Testnet", kind: "round", chainId: 46630n, testnet: true,
    rpcUrl: "https://rpc.testnet.chain.robinhood.com", explorerUrl: "https://explorer.testnet.chain.robinhood.com", nativeCurrency: ETH,
    coordinator: "0x2f26513DE4Ed388947f5d22FD395D5E06f472f05", ...ROBINHOOD, beaconVerifier: BEACON_VERIFIER,
    owner: "0x7ad78fc8097DFEA5c12DBb503D6EB6E60f34B40B",
    keyHash: "0xda5b9114edc329e09e5765dbca17ed243f4abdcf34420ea8e6e392ba408a4062",
    protocolConfigurationHash: "0x0834ec1ec066569c75f7323951998130e50295f4829f6f766dd77cc787938429",
    deploymentBlock: 129544569n,
  }),
});

/** The deployment on a chain, by chain ID, or undefined when D20DAO has none there. */
export function getD20Network(chainId: bigint | number): Readonly<D20Network> | undefined {
  const id = BigInt(chainId);
  return Object.values(D20_NETWORKS).find(network => network.chainId === id);
}
