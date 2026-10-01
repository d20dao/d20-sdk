import { mkdtempSync, readFileSync, writeFileSync, copyFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run with npm test so npm_execpath is available.');
function npm(args, cwd = pkg) {
  return execFileSync(process.execPath, [npmCli, ...args], { cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
}
// Build explicitly and suppress its log on JSON pack calls. Both lifecycle and explicit builds are tested.
console.log(npm(['run', 'build']));
// API.md must equal the reference generated from the ABIs this build just wrote and the curated descriptions.
execFileSync(process.execPath, [resolve(pkg, 'scripts/api-reference.mjs'), '--check'], { cwd: pkg, stdio: 'inherit' });
function packedInfo(args) {
  const text = npm(args);
  const start = text.indexOf('[\n');
  if (start < 0) throw new Error(`No npm pack JSON: ${text}`);
  return JSON.parse(text.slice(start))[0];
}
const dry = packedInfo(['pack', '--dry-run', '--json']);
const packed = packedInfo(['pack', '--json']);
assert.deepEqual(dry.files.map(f => f.path), packed.files.map(f => f.path));
const required = ['AGENTS.md', 'API.md', 'CHANGELOG.md', 'LICENSE', 'README.md', 'BUILD-MANIFEST.json', 'PROTOCOL-PROVENANCE.json', 'dist/index.js', 'dist/index.d.ts',
  'dist/abi.js', 'dist/abi.d.ts', 'dist/epoch.js', 'dist/epoch.d.ts', 'dist/beacon.js', 'dist/beacon.d.ts', 'dist/templates.js', 'dist/templates.d.ts', 'dist/fees.js', 'dist/fees.d.ts',
  'abi/D20VRFCoordinator.json', 'abi/EpochEntropy.json', 'abi/D20BeaconVerifier.json',
  'examples/DiceConsumer.sol', 'examples/RaffleConsumer.sol', 'examples/LootDropConsumer.sol', 'notices/CHAINLINK-LICENSE', 'notices/BLS-BN254-LICENSE'];
for (const name of required) assert(packed.files.some(f => f.path === name), `Missing ${name}`);
for (const { path } of packed.files) {
  assert(/^(?:dist\/(?:index|mapping|verification|sources|replay|evidence|templates|epoch|beacon|fees|abi)\.(?:js|d\.ts)|abi\/(?:D20VRFCoordinator|EpochEntropy|D20BeaconVerifier)\.json|contracts\/(?:D20VRFConsumer\.sol|interfaces\/ID20VRF\.sol|libraries\/(?:RandomnessMapping|D20VRFRequests)\.sol)|examples\/(?:DiceConsumer|RaffleConsumer|LootDropConsumer)\.sol|notices\/(?:CHAINLINK-LICENSE|BLS-BN254-LICENSE|PROVENANCE\.md)|package\.json|README\.md|AGENTS\.md|API\.md|CHANGELOG\.md|LICENSE|THIRD_PARTY_NOTICES\.md|BUILD-MANIFEST\.json|PROTOCOL-PROVENANCE\.json)$/.test(path), `Unexpected payload ${path}`);
}
const metadata = JSON.parse(readFileSync(resolve(pkg, 'package.json')));
assert.notEqual(metadata.private, true);
assert.equal(metadata.publishConfig.access, 'public');
assert.equal(metadata.publishConfig.registry, 'https://registry.npmjs.org/');
const temp = mkdtempSync(resolve(tmpdir(), 'd20dao-sdk-consumer-'));
console.log(`Fresh consumer: ${temp}`);
writeFileSync(resolve(temp, 'package.json'), JSON.stringify({ name: 'sdk-smoke-consumer', private: true, type: 'module', overrides: { solc: { tmp: '0.2.7' } } }));
const installTarget = process.argv.includes('--registry') ? `${metadata.name}@${metadata.version}` : resolve(pkg, packed.filename);
console.log(npm(['install', '--ignore-scripts', '--no-audit', '--no-fund', installTarget, 'typescript@5.9.3', 'solc@0.8.28', 'esbuild@0.28.2'], temp));
for (const name of ['DiceConsumer.sol', 'RaffleConsumer.sol', 'LootDropConsumer.sol']) copyFileSync(resolve(pkg, `examples/${name}`), resolve(temp, name));
// Explicitly selected current fixture provenance distinguishes CI signatures from live API3.
const activeFixtures = JSON.parse(readFileSync(resolve(pkg, 'scripts/fixtures/active.json'),'utf8'));
assert(/^[a-z0-9-]+$/.test(activeFixtures.directory), 'Fixture directory must remain local');
const fixtureDirectory = resolve(pkg, 'scripts/fixtures', activeFixtures.directory);
const fixtureNames = readdirSync(fixtureDirectory).filter(name => /^epoch-replay.*\.json$/.test(name)).sort();
assert(fixtureNames.length > 0, 'Actual current-recipe fixtures required');
for (const name of fixtureNames) copyFileSync(resolve(fixtureDirectory, name), resolve(temp, name));
writeFileSync(resolve(temp, 'fixture-names.json'), JSON.stringify(fixtureNames));
copyFileSync(resolve(fixtureDirectory, 'provenance.json'), resolve(temp, 'fixture-provenance.json'));
// Evidence recorded before the recipe registry, when slot 1 was ANU: it replays with that recipe's definition.
const legacyDirectory = resolve(pkg, 'scripts/fixtures/live-on-demand');
const legacyNames = readdirSync(legacyDirectory).filter(name => /^epoch-replay.*\.json$/.test(name)).sort();
for (const name of legacyNames) copyFileSync(resolve(legacyDirectory, name), resolve(temp, `legacy-${name}`));
writeFileSync(resolve(temp, 'legacy-fixture-names.json'), JSON.stringify(legacyNames.map(name => `legacy-${name}`)));
// Real Arc data recorded with scripts/record-live-fixture.mjs: signed-record and drand beacon epochs of both networks.
// Independent drand rounds come with hash-to-curve points computed by another library.
const liveDirectories = { 'arc-mainnet-signed': 'live-arc-mainnet-signed', 'arc-testnet-signed': 'live-arc-testnet-signed',
  'arc-testnet-drand': 'live-arc-testnet-drand', 'arc-mainnet-drand': 'live-arc-mainnet-drand' };
const liveNames = {};
for (const [set, directory] of Object.entries(liveDirectories)) {
  const source = resolve(pkg, 'scripts/fixtures', directory);
  const names = readdirSync(source).filter(name => /^epoch-replay.*\.json$/.test(name)).sort();
  assert(names.length > 0, `Live fixtures required: ${directory}`);
  for (const name of names) copyFileSync(resolve(source, name), resolve(temp, `${set}-${name}`));
  copyFileSync(resolve(source, 'provenance.json'), resolve(temp, `${set}-provenance.json`));
  liveNames[set] = names.map(name => `${set}-${name}`);
}
writeFileSync(resolve(temp, 'live-fixture-names.json'), JSON.stringify(liveNames));
copyFileSync(resolve(pkg, 'scripts/fixtures/drand-evmnet/rounds.json'), resolve(temp, 'drand-rounds.json'));
copyFileSync(resolve(pkg, 'scripts/consumer-smoke.mjs'), resolve(temp, 'smoke.mjs'));
writeFileSync(resolve(temp, 'typecheck.ts'), `
import { builtins, mapRandomness, replayCoordinator, decodeEvidencePacket, quoteRequestFee, DEFAULT_FEE_BUFFER_BPS, beaconSlotSigner, verifyBeaconRound, beaconRoundTime, DRAND_EVMNET, type RequestContext, type EpochProtocolConfiguration, type FeeQuote, type FeeQuoteProvider, type BeaconRegistration } from '@d20dao/vrf-sdk';
import { coordinatorAbi, epochEntropyAbi, beaconVerifierAbi } from '@d20dao/vrf-sdk/abi';
import { replayEpochCommitment, readEpochRecipes, resolveEpochCatalog, BUILTIN_EPOCH_RECIPES, MAX_ATTESTATION_AGE, type EpochCatalog, type EpochRecipe, type EpochRecipeBook, type EpochSigners } from '@d20dao/vrf-sdk/epoch';
import { encodeDataTemplate, matchesDataTemplate, type DataTemplateSegment } from '@d20dao/vrf-sdk';
import { Interface, Contract, JsonRpcProvider } from 'ethers';
const signers: EpochSigners = ['0x0000000000000000000000000000000000000001','0x0000000000000000000000000000000000000002','0x0000000000000000000000000000000000000003','0x0000000000000000000000000000000000000003'];
type ReplayInput = Parameters<typeof replayCoordinator>[0];
type InitialMinFee = EpochProtocolConfiguration['initialMinFee'];
const values: bigint[] = mapRandomness('0x' + '00'.repeat(32), builtins.d20());
const coordinator = new Contract('0x0000000000000000000000000000000000000001', coordinatorAbi);
const registry = new Interface(epochEntropyAbi);
// Type-only: a real ethers provider satisfies FeeQuoteProvider; nothing here is executed.
const provider: FeeQuoteProvider = new JsonRpcProvider('http://127.0.0.1:8545');
const quote: Promise<FeeQuote> = quoteRequestFee(provider, '0x0000000000000000000000000000000000000001', 100_000, { bufferBps: DEFAULT_FEE_BUFFER_BPS });
const age: bigint = MAX_ATTESTATION_AGE;
const segments: DataTemplateSegment[] = [{ literal: '{"value":' }, { decimal: { fraction: true, exponent: false } }, { literal: '}' }];
const recipe: EpochRecipe = { canonicalRequest: '["op",[]]', template: encodeDataTemplate(segments), body: '{"operation":"op","parameters":{}}' };
const book: EpochRecipeBook = { 6: recipe };
const matched: boolean = matchesDataTemplate(recipe.template, '0x');
const recipes: Promise<Record<number, EpochRecipe>> = readEpochRecipes(new JsonRpcProvider('http://127.0.0.1:8545'), '0x0000000000000000000000000000000000000001', [0, 6]);
const catalog: EpochCatalog = resolveEpochCatalog({ registry: '0x0000000000000000000000000000000000000001', chainId: 5042n, firstEpochStart: 1n, recipeBook: book }, { hash: '0x' + '00'.repeat(32), recipes: [0, 6], signers: signers.slice(0, 2) });
// Beacon recipes carry their registration; recipes can be read as of a block.
const registration: BeaconRegistration = { verifier: '0x0000000000000000000000000000000000000001', chainHash: DRAND_EVMNET.chainHash, publicKey: DRAND_EVMNET.publicKey, genesis: DRAND_EVMNET.genesis, period: DRAND_EVMNET.period };
const beaconRecipe: EpochRecipe = { ...recipe, beacon: registration };
const beaconSigner: string = beaconSlotSigner(registration);
const scheduled: bigint = beaconRoundTime(registration, 1n);
const verified: boolean = verifyBeaconRound(registration.publicKey, 1n, '0x');
const pinned: Promise<Record<number, EpochRecipe>> = readEpochRecipes(new JsonRpcProvider('http://127.0.0.1:8545'), '0x0000000000000000000000000000000000000001', [11], { blockTag: 'latest' });
const verifier = new Interface(beaconVerifierAbi);
console.log(values, coordinator, registry, quote, age, matched, recipes, catalog, BUILTIN_EPOCH_RECIPES.length, beaconRecipe, beaconSigner, scheduled, verified, pinned, verifier);
`);
writeFileSync(resolve(temp, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true, skipLibCheck: false, types: [] }, files: ['typecheck.ts'] }));
execFileSync(process.execPath, [resolve(temp, 'node_modules/typescript/bin/tsc'), '-p', resolve(temp, 'tsconfig.json')], { cwd: temp, stdio: 'inherit' });
execFileSync(process.execPath, [resolve(temp, 'smoke.mjs')], { cwd: temp, stdio: 'inherit', env: { ...process.env, NODE_PATH: '' } });
console.log(`Tarball: ${resolve(pkg, packed.filename)}; ${packed.files.length} files, ${packed.size} compressed bytes.`);
console.log(packed.files.map(f => `${f.path} (${f.size} bytes)`).join('\n'));
