// Records the replayCoordinator input of accepted requests from a public RPC as replay fixtures.
//
//   npm run build
//   node scripts/record-live-fixture.mjs --rpc https://rpc.testnet.arc.io --coordinator 0xd20DA0FF9087d053f0291524Eac12abA1ADBd945 \
//     --requests 5655,5812 --out scripts/fixtures/live-arc-testnet-drand
//
// Writes <out>/epoch-replay-<requestId>.json for each request and adds its entry to <out>/provenance.json (created on
// first use; edit its note by hand). Every value is final chain state (the request, its epoch record, the EpochCommitted
// packet, the FulfillmentEvidence packet, the block timestamps and the proxies' implementation slots), so recording the
// same request again writes the same bytes. A fixture is replayed with the public API before it is written; a request
// that does not replay is an error. The RPC must serve logs and the state of the blocks involved. This script is a
// development tool and is not part of the package.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Contract, Interface, JsonRpcProvider, getAddress } from 'ethers';
import { decodeEvidencePacket, readEpochRecipes, replayCoordinator, resolveEpochCatalog } from '../dist/index.js';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// ERC-1967 implementation slot.
const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const abi = name => JSON.parse(readFileSync(resolve(pkg, `abi/${name}.json`), 'utf8'));
const { values } = parseArgs({ options: { rpc: { type: 'string' }, coordinator: { type: 'string' }, requests: { type: 'string' }, out: { type: 'string' } } });
for (const name of ['rpc', 'coordinator', 'requests', 'out']) if (!values[name]) throw new Error(`Missing --${name}`);

const provider = new JsonRpcProvider(values.rpc, undefined, { staticNetwork: true, batchMaxCount: 1 });
const { chainId } = await provider.getNetwork();
const coordinatorInterface = new Interface(abi('D20VRFCoordinator'));
const registryInterface = new Interface(abi('EpochEntropy'));
const coordinator = new Contract(values.coordinator, coordinatorInterface, provider);
const registryAddress = await coordinator.epochRegistry();
const registry = new Contract(registryAddress, registryInterface, provider);

const timestamps = new Map();
const timestampOf = async number => {
  if (!timestamps.has(number)) timestamps.set(number, BigInt((await provider.getBlock(number)).timestamp));
  return timestamps.get(number);
};
// The single log with this topic0 and indexed id, searched in an inclusive block range.
async function logOf(address, iface, event, id, from, to) {
  const logs = await provider.getLogs({ address, fromBlock: from, toBlock: to, topics: [iface.getEvent(event).topicHash, `0x${BigInt(id).toString(16).padStart(64, '0')}`] });
  if (logs.length !== 1) throw new Error(`Expected one ${event} log for ${id} in blocks ${from}-${to}, found ${logs.length}`);
  return { log: logs[0], args: iface.parseLog(logs[0]).args };
}
const json = value => JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item, 2) + '\n';
const pair = result => [result[0], result[1]];

const configuration = {
  publicKey: [await coordinator.publicKeyX(), await coordinator.publicKeyY()],
  feeRecipient: await coordinator.initialFeeRecipient(),
  initialMinFee: await coordinator.initialMinFee(),
  confirmationBlocks: Number(await coordinator.confirmationBlocks()),
  registry: registryAddress,
  catalogHash: await registry.catalogHash(),
  firstEpochStart: await registry.firstEpochStart(),
};
const protocolConfigurationHash = await coordinator.protocolConfigurationHash();
const keyHash = await coordinator.keyHash();

mkdirSync(resolve(pkg, values.out), { recursive: true });
const entries = {};
for (const text of values.requests.split(',')) {
  const requestId = BigInt(text);
  const request = await coordinator.getRequest(requestId);
  if (!request.fulfilled) throw new Error(`Request ${requestId} is not fulfilled`);
  // The proof is accepted after the target block and at most 60 seconds after the request; this window has room to spare.
  const fulfilled = await logOf(values.coordinator, coordinatorInterface, 'RandomnessFulfilled', requestId, Number(request.targetBlock), Number(request.requestBlock) + 2000);
  const acceptanceBlock = BigInt(fulfilled.log.blockNumber);
  const evidence = await logOf(values.coordinator, coordinatorInterface, 'FulfillmentEvidence', requestId, fulfilled.log.blockNumber, fulfilled.log.blockNumber);
  const mapping = await coordinator.getMapping(requestId);
  const epochId = request.epochId;
  const record = await registry.getEpoch(epochId);
  const published = await logOf(registryAddress, registryInterface, 'EpochCommitted', epochId, Number(record.committedBlock), Number(record.committedBlock));
  const [hash, recipes, signers] = await registry.catalogAt(epochId);
  const recipeBook = await readEpochRecipes(provider, registryAddress, recipes.map(Number));
  const catalog = resolveEpochCatalog({ registry: registryAddress, chainId, firstEpochStart: configuration.firstEpochStart, recipeBook }, { hash, recipes, signers });
  const fixture = {
    context: {
      chainId, coordinator: values.coordinator, keyHash, requestId, consumer: request.consumer, clientSeed: request.clientSeed,
      mapping: { operation: Number(mapping.operation), lower: mapping.lower, upper: mapping.upper, count: Number(mapping.count), population: Number(mapping.population) },
      requestBlock: request.requestBlock, targetBlock: request.targetBlock, blockHash: request.blockHash, epochId, epochHash: request.epochHash,
    },
    configuration: { ...configuration, publicKey: pair(configuration.publicKey) },
    protocolConfigurationHash,
    epoch: {
      catalog,
      record: {
        epochHash: record.epochHash, catalogHash: record.catalogHash, anchorHash: record.anchorHash, source: record.source, queryHash: record.queryHash,
        dataHash: record.dataHash, attestationHash: record.attestationHash, signedAt: record.signedAt, committedBlock: record.committedBlock,
      },
      commitTimestamp: await timestampOf(record.committedBlock),
      packet: published.args.packet,
    },
    requestedAt: await timestampOf(request.requestBlock),
    deadline: request.deadline,
    acceptanceTimestamp: await timestampOf(acceptanceBlock),
    acceptanceBlock,
    vrfProof: decodeEvidencePacket(evidence.args.packet).proof,
    recorded: { fulfilled: request.fulfilled, randomness: request.randomness, proofHash: request.proofHash, transcriptHash: request.transcriptHash },
  };
  const replayed = replayCoordinator(fixture);
  if (replayed.reveal.randomness !== request.randomness) throw new Error(`Request ${requestId} replays to another word`);
  const name = `epoch-replay-${requestId}.json`;
  writeFileSync(resolve(pkg, values.out, name), json(fixture));
  // The implementations behind the proxies when the epoch was published and when the proof was accepted: the code a replay trusts.
  const implementationAt = async (proxy, block) => getAddress(`0x${(await provider.getStorage(proxy, IMPLEMENTATION_SLOT, block)).slice(-40)}`);
  entries[name] = {
    requestId: `${requestId}`, epochId: `${epochId}`, source: Number(record.source), recipe: Number(recipes[Number(record.source)]),
    catalog: `[${recipes.join(',')}]`, requestBlock: `${request.requestBlock}`, committedBlock: `${record.committedBlock}`,
    acceptanceBlock: `${acceptanceBlock}`, fulfillmentTransactionHash: fulfilled.log.transactionHash,
    registryImplementation: await implementationAt(registryAddress, record.committedBlock),
    coordinatorImplementation: await implementationAt(values.coordinator, acceptanceBlock),
  };
  console.log(`${name}: epoch ${epochId}, recipe ${entries[name].recipe}, catalog ${entries[name].catalog}, randomness ${request.randomness}`);
}
// provenance.json keeps its hand-written fields and gains one entry per recorded request, in request order.
const provenancePath = resolve(pkg, values.out, 'provenance.json');
const provenance = existsSync(provenancePath) ? JSON.parse(readFileSync(provenancePath, 'utf8')) : {
  sourceMode: `live ${chainId === 5042n ? 'Arc Mainnet' : chainId === 5042002n ? 'Arc Testnet' : `chain ${chainId}`}`,
  chainId: `${chainId}`, rpc: values.rpc, coordinator: values.coordinator, registry: registryAddress,
  recorder: 'scripts/record-live-fixture.mjs', note: '', fixtures: {},
};
const merged = { ...provenance.fixtures, ...entries };
provenance.fixtures = Object.fromEntries(Object.entries(merged).sort(([, a], [, b]) => Number(BigInt(a.requestId) - BigInt(b.requestId))));
writeFileSync(provenancePath, json(provenance));
console.log(`Wrote ${Object.keys(entries).length} fixtures and ${values.out}/provenance.json`);
