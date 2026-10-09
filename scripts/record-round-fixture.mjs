// Records the replayRoundRequest input of fulfilled round-coordinator requests (Robinhood Chain) from a public RPC as replay fixtures.
//
//   npm run build
//   node scripts/record-round-fixture.mjs --rpc https://rpc.mainnet.chain.robinhood.com --network robinhood-mainnet \
//     --requests 1,2 --out scripts/fixtures/live-robinhood-mainnet
//
// Writes <out>/round-replay-<requestId>.json for each request, <out>/beacon-logs.json (the coordinator's beacon logs from its
// deployment block to the latest recorded acceptance block, for roundScheduleFromEvents) and adds each request to
// <out>/provenance.json (created on first use; edit its note by hand). Every value is final chain state, so recording the same
// requests again writes the same bytes. A fixture is replayed with the public API, beacon schedule included, before it is written;
// a request that does not replay is an error. The RPC must serve logs and the state of the blocks involved. This script is a
// development tool and is not part of the package.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { JsonRpcProvider, getAddress } from 'ethers';
import { D20_NETWORKS } from '../dist/index.js';
import { readRoundRequestEvidence, readRoundBeaconLogs, roundScheduleFromEvents, replayRoundRequest } from '../dist/round.js';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// ERC-1967 Upgraded(address indexed implementation).
const UPGRADED = '0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b';
const { values } = parseArgs({ options: { rpc: { type: 'string' }, network: { type: 'string' }, requests: { type: 'string' }, out: { type: 'string' } } });
for (const name of ['rpc', 'network', 'requests', 'out']) if (!values[name]) throw new Error(`Missing --${name}`);
const network = D20_NETWORKS[values.network];
if (network?.kind !== 'round') throw new Error(`${values.network} is not a round-coordinator network`);

const provider = new JsonRpcProvider(values.rpc, undefined, { staticNetwork: true, batchMaxCount: 1 });
const { chainId } = await provider.getNetwork();
if (chainId !== network.chainId) throw new Error(`RPC serves chain ${chainId}, not ${network.chainId}`);
const json = value => JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item, 2) + '\n';

mkdirSync(resolve(pkg, values.out), { recursive: true });
const recorded = [];
for (const text of values.requests.split(',')) recorded.push(await readRoundRequestEvidence(provider, network.coordinator, BigInt(text)));
// The schedule as of the latest acceptance: enough to place every recorded request, and the same bytes on every recording.
const toBlock = recorded.reduce((max, e) => e.acceptanceBlock > max ? e.acceptanceBlock : max, 0n);
const beaconLogs = await readRoundBeaconLogs(provider, network.coordinator, { fromBlock: network.deploymentBlock, toBlock });
const schedule = roundScheduleFromEvents(network.coordinator, beaconLogs);
writeFileSync(resolve(pkg, values.out, 'beacon-logs.json'), json({ fromBlock: network.deploymentBlock, toBlock, logs: beaconLogs }));

// The implementation behind the proxy at a block, from its Upgraded logs: public Robinhood RPCs do not serve historical state.
const upgrades = [];
for (let start = Number(network.deploymentBlock); start <= Number(toBlock); start += 10_000)
  upgrades.push(...await provider.getLogs({ address: network.coordinator, topics: [UPGRADED], fromBlock: start, toBlock: Math.min(start + 9_999, Number(toBlock)) }));
const implementationAt = block => getAddress(`0x${upgrades.filter(log => BigInt(log.blockNumber) <= block).at(-1).topics[1].slice(-40)}`);
const entries = {};
for (const { acceptanceBlock, fulfillmentTransactionHash, roundVerifiedBlock, roundVerifiedTransactionHash, ...evidence } of recorded) {
  const verdict = replayRoundRequest(evidence, { schedule });
  if (!verdict.valid) throw new Error(`Request ${evidence.requestId} does not replay: ${verdict.failed.join(', ')}`);
  const name = `round-replay-${evidence.requestId}.json`;
  writeFileSync(resolve(pkg, values.out, name), json(evidence));
  // The implementation behind the proxy when the proof was accepted: the code a replay trusts.
  const implementation = implementationAt(acceptanceBlock);
  entries[name] = {
    requestId: `${evidence.requestId}`, beaconId: evidence.beaconId, round: `${evidence.round}`, roundLeadSeconds: `${verdict.roundLeadSeconds}`,
    requestBlock: `${evidence.requestBlock}`, roundVerifiedBlock: `${roundVerifiedBlock}`, roundVerifiedTransactionHash,
    acceptanceBlock: `${acceptanceBlock}`, fulfillmentTransactionHash, coordinatorImplementation: implementation,
  };
  console.log(`${name}: round ${evidence.round} (${verdict.roundLeadSeconds} s after the request), randomness ${evidence.randomness}`);
}
// provenance.json keeps its hand-written fields and gains one entry per recorded request, in request order.
const provenancePath = resolve(pkg, values.out, 'provenance.json');
const provenance = existsSync(provenancePath) ? JSON.parse(readFileSync(provenancePath, 'utf8')) : {
  sourceMode: `live ${network.displayName}`, chainId: `${chainId}`, rpc: values.rpc, coordinator: network.coordinator,
  recorder: 'scripts/record-round-fixture.mjs', note: '', fixtures: {},
};
const merged = { ...provenance.fixtures, ...entries };
provenance.fixtures = Object.fromEntries(Object.entries(merged).sort(([, a], [, b]) => Number(BigInt(a.requestId) - BigInt(b.requestId))));
writeFileSync(provenancePath, json(provenance));
console.log(`Wrote ${Object.keys(entries).length} fixtures, beacon-logs.json (${beaconLogs.length} logs) and ${values.out}/provenance.json`);
