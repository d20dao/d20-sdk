// SDK-owned helpers (not part of the vendored protocol copy): find a request's ID in a receipt and read its state on either
// coordinator kind, Arc's epoch coordinator (getRequest) or Robinhood Chain's round coordinator (getRoundRequest).
import { Interface, getAddress, type BlockTag, type TransactionRequest } from "ethers";

/** Provider surface needed to read a request. Any ethers v6 `Provider` satisfies it. */
export interface RequestReadProvider {
  getBlock(blockTag: BlockTag): Promise<{ number: number; timestamp: number } | null>;
  call(tx: TransactionRequest): Promise<string>;
}
/** A log as ethers v6 receipts and `getLogs` return it. */
export interface RequestLog { address: string; topics: readonly string[]; data: string; }

/**
 * - `pending`: not fulfilled, not refunded, and the block read is at or before `deadline`; a proof can still be accepted.
 * - `fulfilled`: a proof was accepted; `randomness` is final.
 * - `expired`: not fulfilled and the block read is after `deadline`; it can only be refunded (`refundRequest`).
 * - `refunded`: `refundRequest` settled it; it never has a result.
 */
export type RequestStatus = "pending" | "fulfilled" | "expired" | "refunded";

/** A request's state, read at one block, in the fields both coordinator kinds share plus the binding of its kind. */
export interface RequestState {
  kind: "epoch" | "round";
  requestId: bigint;
  status: RequestStatus;
  /** The block the state was read at, and its timestamp, against which `status` compares `deadline`. */
  blockNumber: number; blockTimestamp: bigint;
  consumer: string; callbackGasLimit: bigint; requestBlock: bigint; deadline: bigint; refundAddress: string;
  clientSeed: string; mappingHash: string;
  /** Escrowed fee (`requestFeePaid`). */
  feePaid: bigint;
  /** The accepted word, or null until `fulfilled`. */
  randomness: string | null;
  proofHash: string; transcriptHash: string;
  fulfilled: boolean; delivered: boolean; refunded: boolean;
  /** Epoch coordinator: the epoch fixed at request time; the target block, 0 until the epoch packet is published. */
  epochId?: bigint; targetBlock?: bigint;
  /** Round coordinator: the beacon and drand round fixed at request time; the round's randomness, null until verified on chain. */
  beaconId?: number; round?: bigint; roundRandomness?: string | null;
}

const ZERO = "0x" + "00".repeat(32);
let fragments: Interface | undefined;
const iface = () => fragments ??= new Interface([
  "event RandomnessRequested(uint256 indexed requestId, address indexed consumer, bytes32 indexed keyHash, bytes32 clientSeed, uint64 requestBlock, uint32 callbackGasLimit, uint256 feePaid, address refundAddress, uint64 deadline)",
  "function getRequest(uint256 requestId) view returns (tuple(address consumer, uint32 callbackGasLimit, uint64 requestBlock, uint64 targetBlock, uint64 deadline, address refundAddress, bytes32 clientSeed, bytes32 mappingHash, bytes32 blockHash, bytes32 randomness, bytes32 proofHash, bytes32 transcriptHash, bool fulfilled, bool delivered, bool refunded, uint64 epochId, bytes32 epochHash))",
  "function requestFeePaid(uint256 requestId) view returns (uint256)",
  "function getRoundRequest(uint256 requestId) view returns (tuple(address consumer, uint32 callbackGasLimit, uint64 requestBlock, uint64 deadline, address refundAddress, bytes32 clientSeed, bytes32 mappingHash, uint8 beaconId, uint64 round, bytes32 roundRandomness, bytes32 randomness, bytes32 proofHash, bytes32 transcriptHash, uint256 feePaid, bool fulfilled, bool delivered, bool refunded))",
]);

/**
 * The request IDs that a coordinator's `RandomnessRequested` logs carry, in log order. Both coordinator kinds emit the same event.
 * Pass a request receipt's `logs`: logs from other addresses, such as the consumer's own events, are ignored.
 */
export function requestIdsFromLogs(logs: readonly RequestLog[], coordinator: string): bigint[] {
  const address = getAddress(coordinator), topic = iface().getEvent("RandomnessRequested")!.topicHash;
  return logs.filter(log => log.topics[0]?.toLowerCase() === topic && getAddress(log.address) === address)
    .map(log => iface().parseLog({ topics: [...log.topics], data: log.data })!.args.requestId as bigint);
}
/** The one request ID in a receipt's logs; throws when the coordinator logged none or several. */
export function requestIdFromLogs(logs: readonly RequestLog[], coordinator: string): bigint {
  const ids = requestIdsFromLogs(logs, coordinator);
  if (ids.length !== 1) throw new Error(`Expected one RandomnessRequested log from ${coordinator}, found ${ids.length}`);
  return ids[0];
}

/**
 * Read a request at one block and classify it. `target` names the coordinator proxy and its kind; a network from `D20_NETWORKS`
 * has both. The block is read first (default `latest`) and the request at that block, so `status` is consistent with it.
 * Throws `UnknownRequest` revert data through the provider for an ID the coordinator never issued.
 */
export async function readRequest(provider: RequestReadProvider, target: { coordinator: string; kind: "epoch" | "round" },
    requestId: bigint | number, options: { blockTag?: BlockTag } = {}): Promise<RequestState> {
  const id = BigInt(requestId);
  const block = await provider.getBlock(options.blockTag ?? "latest");
  if (!block) throw new Error("Block not found");
  const call = async (name: string) => {
    const data = await provider.call({ to: target.coordinator, data: iface().encodeFunctionData(name, [id]), blockTag: block.number });
    if (data === "0x") throw new Error(`${name} returned no data; check that coordinator is the ${target.kind} coordinator proxy on this chain`);
    return iface().decodeFunctionResult(name, data)[0];
  };
  const blockTimestamp = BigInt(block.timestamp);
  let state: Omit<RequestState, "status">;
  if (target.kind === "round") {
    const r = await call("getRoundRequest");
    state = { kind: "round", requestId: id, blockNumber: block.number, blockTimestamp, ...shared(r), feePaid: r.feePaid,
      beaconId: Number(r.beaconId), round: r.round, roundRandomness: r.roundRandomness === ZERO ? null : r.roundRandomness };
  } else if (target.kind === "epoch") {
    const [r, feePaid] = await Promise.all([call("getRequest"), call("requestFeePaid")]);
    state = { kind: "epoch", requestId: id, blockNumber: block.number, blockTimestamp, ...shared(r), feePaid,
      epochId: r.epochId, targetBlock: r.targetBlock };
  } else {
    throw new Error("kind must be epoch or round");
  }
  const status: RequestStatus = state.refunded ? "refunded" : state.fulfilled ? "fulfilled" : blockTimestamp > state.deadline ? "expired" : "pending";
  return { ...state, status };
}

// The fields of getRequest and getRoundRequest that mean the same thing.
function shared(r: Record<string, any>) {
  return {
    consumer: r.consumer as string, callbackGasLimit: BigInt(r.callbackGasLimit), requestBlock: BigInt(r.requestBlock), deadline: BigInt(r.deadline),
    refundAddress: r.refundAddress as string, clientSeed: r.clientSeed as string, mappingHash: r.mappingHash as string,
    randomness: r.fulfilled ? r.randomness as string : null, proofHash: r.proofHash as string, transcriptHash: r.transcriptHash as string,
    fulfilled: r.fulfilled as boolean, delivered: r.delivered as boolean, refunded: r.refunded as boolean,
  };
}
