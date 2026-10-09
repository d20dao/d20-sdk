// SDK-owned chain readers (not part of the vendored protocol copy) for D20VRFCoordinatorRobinhood: they gather, from an RPC, the
// input that replayRoundRequest and roundScheduleFromEvents take. Reading is not verification: the replay checks the values,
// and that the RPC serves the chain's canonical blocks and logs is for the caller to establish.
import { Interface, getAddress, hexlify, type BlockTag, type TransactionRequest } from "ethers";
import { decodeEvidencePacket } from "./evidence.js";
import type { RoundBeaconLog, RoundRequestEvidence } from "./round.js";

/** Provider surface the readers need. Any ethers v6 `Provider`, such as `JsonRpcProvider`, satisfies it. */
export interface RoundEvidenceProvider {
  getNetwork(): Promise<{ chainId: bigint }>;
  getBlockNumber(): Promise<number>;
  getBlock(blockTag: BlockTag): Promise<{ number: number; timestamp: number } | null>;
  call(tx: TransactionRequest): Promise<string>;
  getLogs(filter: { address: string; fromBlock: number; toBlock: number; topics: (string | string[] | null)[] }):
    Promise<readonly { address: string; topics: readonly string[]; data: string; blockNumber: number; index: number; transactionHash: string; removed?: boolean }[]>;
}
/** A block range for log queries. `chunkSize` bounds each eth_getLogs call; public RPCs limit the range one call may span. */
export interface RoundLogQuery { fromBlock: bigint | number; toBlock?: bigint | number; chunkSize?: number; }

let fragments: Interface | undefined;
const iface = () => fragments ??= new Interface([
  "function getRoundRequest(uint256 requestId) view returns (tuple(address consumer, uint32 callbackGasLimit, uint64 requestBlock, uint64 deadline, address refundAddress, bytes32 clientSeed, bytes32 mappingHash, uint8 beaconId, uint64 round, bytes32 roundRandomness, bytes32 randomness, bytes32 proofHash, bytes32 transcriptHash, uint256 feePaid, bool fulfilled, bool delivered, bool refunded))",
  "function getMapping(uint256 requestId) view returns (tuple(uint8 operation, uint256 lower, uint256 upper, uint32 count, uint32 population))",
  "function getMappedResult(uint256 requestId) view returns (uint256[])",
  "function keyHash() view returns (bytes32)",
  "function protocolConfigurationHash() view returns (bytes32)",
  "function publicKeyX() view returns (uint256)",
  "function publicKeyY() view returns (uint256)",
  "function initialFeeRecipient() view returns (address)",
  "function initialMinFee() view returns (uint256)",
  "function beaconIdentity(uint8 beaconId) view returns (bytes32)",
  "function getBeacon(uint8 beaconId) view returns (tuple(address verifier, uint64 genesis, uint64 period, bytes32 chainHash, bytes publicKey))",
  "event RandomnessFulfilled(uint256 indexed requestId, bytes32 randomness, address indexed submitter)",
  "event FulfillmentEvidence(uint256 indexed requestId, bytes32 indexed transcriptHash, bytes packet)",
  "event RoundVerified(uint8 indexed beaconId, uint64 indexed round, bytes32 randomness, bytes signature)",
  "event BeaconRegistered(uint8 indexed beaconId, bytes32 indexed identity, address indexed verifier, bytes32 chainHash, bytes publicKey, uint64 genesis, uint64 period)",
  "event BeaconScheduled(uint8 indexed beaconId, uint64 indexed fromTime)",
  "event BeaconScheduleCancelled(uint8 indexed beaconId, uint64 indexed fromTime)",
]);
const word = (value: bigint) => "0x" + value.toString(16).padStart(64, "0");
const topic = (name: string) => iface().getEvent(name)!.topicHash;

/**
 * Read everything `replayRoundRequest` needs for one fulfilled request of a round coordinator: the initialized configuration, its
 * hash and the key hash; the registration of the request's beacon; the request's fixed fields, block timestamp and deadline; the
 * round's signature and randomness from `RoundVerified`; the proof from `FulfillmentEvidence`; and the stored result, transcript
 * and mapped values. The fulfilment is searched from the request block over `maxBlocks` blocks (default 2,000, wider than a
 * 60-second deadline on Robinhood Chain), capped at the chain head. Throws for a request that is not fulfilled.
 *
 * The result also names the blocks and transactions it came from. Pass it to `replayRoundRequest`, with a schedule from
 * `roundScheduleFromEvents(coordinator, await readRoundBeaconLogs(...))` to also check that the beacon was in force.
 */
export async function readRoundRequestEvidence(provider: RoundEvidenceProvider, coordinator: string, requestId: bigint | number,
    options: { maxBlocks?: number } = {}): Promise<RoundRequestEvidence & {
      acceptanceBlock: bigint; fulfillmentTransactionHash: string; roundVerifiedBlock: bigint; roundVerifiedTransactionHash: string }> {
  const address = getAddress(coordinator), id = BigInt(requestId);
  const read = async (name: string, args: readonly unknown[] = []) => {
    const data = await provider.call({ to: address, data: iface().encodeFunctionData(name, args) });
    if (data === "0x") throw new Error(`${name} returned no data; check that coordinator is a round coordinator proxy on this chain`);
    return iface().decodeFunctionResult(name, data)[0];
  };
  const { chainId } = await provider.getNetwork();
  const request = await read("getRoundRequest", [id]);
  if (!request.fulfilled) throw new Error(`Request ${id} is not fulfilled`);
  const beaconId = Number(request.beaconId), round = BigInt(request.round), requestBlock = BigInt(request.requestBlock);
  const [keyHash, configurationHash, x, y, feeRecipient, initialMinFee, beacon0, identity, beacon, mapping, mappedResult] = await Promise.all([
    read("keyHash"), read("protocolConfigurationHash"), read("publicKeyX"), read("publicKeyY"), read("initialFeeRecipient"),
    read("initialMinFee"), read("beaconIdentity", [0]), read("beaconIdentity", [beaconId]), read("getBeacon", [beaconId]),
    read("getMapping", [id]), read("getMappedResult", [id]),
  ]);

  const head = await provider.getBlockNumber();
  const last = Math.min(Number(requestBlock) + (options.maxBlocks ?? 2000), head);
  const single = async (name: string, topics: (string | null)[], from: number, to: number) => {
    const logs = (await provider.getLogs({ address, fromBlock: from, toBlock: to, topics: [topic(name), ...topics] })).filter(log => !log.removed);
    if (logs.length !== 1) throw new Error(`Expected one ${name} log in blocks ${from}-${to}, found ${logs.length}`);
    return { log: logs[0], args: iface().parseLog({ topics: [...logs[0].topics], data: logs[0].data })!.args };
  };
  const fulfilled = await single("RandomnessFulfilled", [word(id)], Number(requestBlock), last);
  const acceptanceBlock = fulfilled.log.blockNumber;
  const evidence = await single("FulfillmentEvidence", [word(id)], acceptanceBlock, acceptanceBlock);
  // The round is verified by the first fulfilment of any of its requests: after this request was made, and no later than its own.
  const verified = await single("RoundVerified", [word(BigInt(beaconId)), word(round)], Number(requestBlock), acceptanceBlock);
  const timestamp = async (number: number) => {
    const block = await provider.getBlock(number);
    if (!block) throw new Error(`Block ${number} not found`);
    return BigInt(block.timestamp);
  };
  const packet = hexlify(evidence.args.packet);
  return {
    chainId, coordinator: address,
    configuration: { publicKey: [x, y], feeRecipient, initialMinFee, beaconIdentity: beacon0 },
    configurationHash, keyHash,
    beacon: { verifier: getAddress(beacon.verifier), chainHash: beacon.chainHash, publicKey: hexlify(beacon.publicKey),
      genesis: BigInt(beacon.genesis), period: BigInt(beacon.period), identity },
    requestId: id, consumer: getAddress(request.consumer), clientSeed: request.clientSeed,
    mapping: { operation: Number(mapping.operation), lower: mapping.lower, upper: mapping.upper, count: Number(mapping.count), population: Number(mapping.population) },
    mappingHash: request.mappingHash, requestBlock, requestTimestamp: await timestamp(Number(requestBlock)), deadline: BigInt(request.deadline),
    beaconId, round, roundSignature: hexlify(verified.args.signature), roundRandomness: request.roundRandomness,
    proof: decodeEvidencePacket(packet).proof, randomness: request.randomness, proofHash: request.proofHash, transcriptHash: request.transcriptHash,
    evidencePacket: packet, mappedResult: Array.from(mappedResult as bigint[]),
    acceptanceTimestamp: await timestamp(acceptanceBlock),
    acceptanceBlock: BigInt(acceptanceBlock), fulfillmentTransactionHash: fulfilled.log.transactionHash,
    roundVerifiedBlock: BigInt(verified.log.blockNumber), roundVerifiedTransactionHash: verified.log.transactionHash,
  };
}

/**
 * A round coordinator's `BeaconRegistered`, `BeaconScheduled` and `BeaconScheduleCancelled` logs with their block timestamps, in the
 * form `roundScheduleFromEvents` takes. Start at the proxy's deployment block (`deploymentBlock` in `D20_NETWORKS`) so that the logs
 * reach initialization; `toBlock` defaults to the chain head. Each eth_getLogs call spans at most `chunkSize` blocks (default 10,000).
 */
export async function readRoundBeaconLogs(provider: RoundEvidenceProvider, coordinator: string, query: RoundLogQuery): Promise<RoundBeaconLog[]> {
  const address = getAddress(coordinator), chunk = query.chunkSize ?? 10_000;
  if (!Number.isSafeInteger(chunk) || chunk < 1) throw new Error("chunkSize must be a positive integer");
  const from = Number(query.fromBlock), to = query.toBlock === undefined ? await provider.getBlockNumber() : Number(query.toBlock);
  const topics = [["BeaconRegistered", "BeaconScheduled", "BeaconScheduleCancelled"].map(topic)];
  const logs = [];
  for (let start = from; start <= to; start += chunk)
    logs.push(...await provider.getLogs({ address, fromBlock: start, toBlock: Math.min(start + chunk - 1, to), topics }));
  const times = new Map<number, bigint>();
  for (const { blockNumber } of logs) if (!times.has(blockNumber)) {
    const block = await provider.getBlock(blockNumber);
    if (!block) throw new Error(`Block ${blockNumber} not found`);
    times.set(blockNumber, BigInt(block.timestamp));
  }
  return logs.map(log => ({ address: log.address, topics: [...log.topics], data: log.data, blockNumber: log.blockNumber, index: log.index,
    blockTimestamp: times.get(log.blockNumber)!, removed: log.removed }));
}
