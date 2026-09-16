// SDK-owned helper (not part of the vendored protocol copy): off-chain request fee quoting for ethers v6.
import { Interface, type BlockTag, type TransactionRequest } from "ethers";

/**
 * Provider surface needed to quote a request. Any ethers v6 `Provider` (for example `JsonRpcProvider`) satisfies it;
 * tests can pass a small mock.
 */
export interface FeeQuoteProvider {
  getBlock(blockTag: BlockTag): Promise<{ number: number; baseFeePerGas: bigint | null } | null>;
  call(tx: TransactionRequest): Promise<string>;
}

export interface FeeQuoteOptions {
  /** Base-fee headroom in basis points used for `value`. Default 3000 (30%). */
  bufferBps?: number | bigint;
  /** Block whose `baseFeePerGas` anchors the quote. Default `"latest"`. */
  blockTag?: BlockTag;
}

export interface FeeQuote {
  /** Number of the block whose base fee was read. */
  blockNumber: number;
  /** `baseFeePerGas` of that block. */
  baseFee: bigint;
  /** Buffer applied, in basis points. */
  bufferBps: bigint;
  /** `baseFee` raised by `bufferBps` (rounded up). */
  bufferedBaseFee: bigint;
  /** `quoteFeeAt(callbackGasLimit, baseFee)`: the fee if the request were included at exactly `baseFee`. */
  fee: bigint;
  /** `quoteFeeAt(callbackGasLimit, bufferedBaseFee)`: send this as `msg.value`. Never below `fee`. */
  value: bigint;
}

/** Default headroom: 30% above the header base fee (an EIP-1559 base fee can rise 12.5% per block). */
export const DEFAULT_FEE_BUFFER_BPS = 3000n;
const MAX_UINT32 = 0xffffffffn;
const quoteInterface = new Interface(["function quoteFeeAt(uint32 callbackGasLimit, uint256 baseFee) view returns (uint256)"]);

/**
 * Quote a request fee off-chain from a block header's base fee.
 *
 * The coordinator prices each request with `block.basefee` of the transaction that creates it:
 * `fee = max(minFee, feeMultiplier * baseFee * (fulfillGasOverhead + callbackGasLimit))`. `quoteFee(callbackGasLimit)`
 * is therefore exact only inside that transaction; through `eth_call` the base fee is commonly reported as 0
 * (observed on Arc), so it must not be used as an off-chain quote. This helper reads `baseFeePerGas` from the
 * requested block (default `latest`) and calls `quoteFeeAt(callbackGasLimit, baseFee)` instead.
 *
 * Why `value` carries a buffer: the base fee can move between reading the header and the block that includes the
 * request. `value` is the quote recomputed at a base fee `bufferBps` higher, so the request still pays if the base fee
 * rises by up to that much. If the minimum fee dominates even at the buffered base fee, `value` equals `fee` and
 * nothing extra is sent. Whatever is sent above the fee the coordinator computes in the transaction is not revenue:
 * it is credited to the request's refund address as refund credit (`FeeOverpaymentCredited`) and can be pulled by that
 * address with `withdrawRefundCredit(recipient)`. Sending less than the transaction's own quote reverts with
 * `IncorrectFee(expected, actual)`; re-quote and resend.
 *
 * @param provider ethers v6 provider (or any object with `getBlock` and `call`).
 * @param coordinator Coordinator proxy address on the configured chain.
 * @param callbackGasLimit The `callbackGasLimit` the request will use (uint32).
 */
export async function quoteRequestFee(
  provider: FeeQuoteProvider,
  coordinator: string,
  callbackGasLimit: number | bigint,
  options: FeeQuoteOptions = {},
): Promise<FeeQuote> {
  const gas = BigInt(callbackGasLimit);
  if (gas < 0n || gas > MAX_UINT32) throw new Error("callbackGasLimit must fit uint32");
  const bufferBps = BigInt(options.bufferBps ?? DEFAULT_FEE_BUFFER_BPS);
  if (bufferBps < 0n) throw new Error("bufferBps must not be negative");
  const block = await provider.getBlock(options.blockTag ?? "latest");
  if (!block || block.baseFeePerGas == null) throw new Error("Block has no baseFeePerGas; quoting needs an EIP-1559 header");
  const baseFee = block.baseFeePerGas;
  const bufferedBaseFee = baseFee + (baseFee * bufferBps + 9999n) / 10000n;
  const quote = async (atBaseFee: bigint): Promise<bigint> => {
    const result = await provider.call({ to: coordinator, data: quoteInterface.encodeFunctionData("quoteFeeAt", [gas, atBaseFee]) });
    if (result === "0x") throw new Error("quoteFeeAt returned no data; check that coordinator is the coordinator proxy on this chain");
    return quoteInterface.decodeFunctionResult("quoteFeeAt", result)[0] as bigint;
  };
  const [fee, value] = await Promise.all([quote(baseFee), quote(bufferedBaseFee)]);
  return { blockNumber: block.number, baseFee, bufferBps, bufferedBaseFee, fee, value };
}
