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
function packedInfo(args) {
  const text = npm(args);
  const start = text.indexOf('[\n');
  if (start < 0) throw new Error(`No npm pack JSON: ${text}`);
  return JSON.parse(text.slice(start))[0];
}
const dry = packedInfo(['pack', '--dry-run', '--json']);
const packed = packedInfo(['pack', '--json']);
assert.deepEqual(dry.files.map(f => f.path), packed.files.map(f => f.path));
const required = ['AGENTS.md', 'LICENSE', 'README.md', 'BUILD-MANIFEST.json', 'dist/index.js', 'dist/index.d.ts',
  'dist/abi.js', 'dist/abi.d.ts', 'dist/epoch.js', 'dist/epoch.d.ts', 'abi/D20VRFCoordinator.json', 'abi/EpochEntropy.json', 'examples/DiceConsumer.sol', 'notices/CHAINLINK-LICENSE'];
for (const name of required) assert(packed.files.some(f => f.path === name), `Missing ${name}`);
for (const { path } of packed.files) {
  assert(/^(?:dist\/(?:index|mapping|verification|sources|replay|evidence|epoch|abi)\.(?:js|d\.ts)|abi\/(?:D20VRFCoordinator|EpochEntropy)\.json|contracts\/(?:D20VRFConsumer\.sol|interfaces\/ID20VRF\.sol|libraries\/(?:RandomnessMapping|D20VRFRequests)\.sol|examples\/MiningRandomnessConsumer\.sol)|examples\/DiceConsumer\.sol|notices\/(?:CHAINLINK-LICENSE|PROVENANCE\.md)|scripts\/block-publish\.mjs|package\.json|README\.md|AGENTS\.md|LICENSE|THIRD_PARTY_NOTICES\.md|BUILD-MANIFEST\.json)$/.test(path), `Unexpected payload ${path}`);
}
assert.equal(JSON.parse(readFileSync(resolve(pkg, 'package.json'))).private, true);
let guardBlocked = false;
try { execFileSync(process.execPath, [resolve(pkg, 'scripts/block-publish.mjs')], { stdio: 'pipe' }); }
catch (error) { guardBlocked = error.status !== 0 && error.stderr.toString().includes('SDK RELEASE BLOCKED'); }
assert(guardBlocked, 'Publish guard must fail closed');
const temp = mkdtempSync(resolve(tmpdir(), 'd20dao-sdk-consumer-'));
console.log(`Fresh consumer: ${temp}`);
writeFileSync(resolve(temp, 'package.json'), JSON.stringify({ name: 'sdk-smoke-consumer', private: true, type: 'module', overrides: { solc: { tmp: '0.2.7' } } }));
console.log(npm(['install', '--ignore-scripts', '--no-audit', '--no-fund', resolve(pkg, packed.filename), 'typescript@5.9.3', 'solc@0.8.28', 'esbuild@0.28.2'], temp));
copyFileSync(resolve(pkg, 'examples/DiceConsumer.sol'), resolve(temp, 'DiceConsumer.sol'));
// Explicitly selected current fixture provenance distinguishes CI signatures from live API3.
const activeFixtures = JSON.parse(readFileSync(resolve(pkg, 'scripts/fixtures/active.json'),'utf8'));
assert(/^[a-z0-9-]+$/.test(activeFixtures.directory), 'Fixture directory must remain local');
const fixtureDirectory = resolve(pkg, 'scripts/fixtures', activeFixtures.directory);
const fixtureNames = readdirSync(fixtureDirectory).filter(name => /^epoch-replay.*\.json$/.test(name)).sort();
assert(fixtureNames.length > 0, 'Actual current-recipe fixtures required');
for (const name of fixtureNames) copyFileSync(resolve(fixtureDirectory, name), resolve(temp, name));
writeFileSync(resolve(temp, 'fixture-names.json'), JSON.stringify(fixtureNames));
copyFileSync(resolve(fixtureDirectory, 'provenance.json'), resolve(temp, 'fixture-provenance.json'));
copyFileSync(resolve(pkg, 'scripts/consumer-smoke.mjs'), resolve(temp, 'smoke.mjs'));
writeFileSync(resolve(temp, 'typecheck.ts'), `
import { builtins, mapRandomness, replayCoordinator, decodeEvidencePacket, type RequestContext } from '@d20dao/vrf-sdk';
import { coordinatorAbi, epochEntropyAbi } from '@d20dao/vrf-sdk/abi';
import { replayEpochCommitment, type EpochCatalog, type EpochSigners } from '@d20dao/vrf-sdk/epoch';
import { Interface, Contract } from 'ethers';
const signers: EpochSigners = ['0x0000000000000000000000000000000000000001','0x0000000000000000000000000000000000000002','0x0000000000000000000000000000000000000003','0x0000000000000000000000000000000000000003'];
type ReplayInput = Parameters<typeof replayCoordinator>[0];
const values: bigint[] = mapRandomness('0x' + '00'.repeat(32), builtins.d20());
const coordinator = new Contract('0x0000000000000000000000000000000000000001', coordinatorAbi);
const registry = new Interface(epochEntropyAbi);
console.log(values, coordinator, registry);
`);
writeFileSync(resolve(temp, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true, skipLibCheck: false, types: [] }, files: ['typecheck.ts'] }));
execFileSync(process.execPath, [resolve(temp, 'node_modules/typescript/bin/tsc'), '-p', resolve(temp, 'tsconfig.json')], { cwd: temp, stdio: 'inherit' });
execFileSync(process.execPath, [resolve(temp, 'smoke.mjs')], { cwd: temp, stdio: 'inherit', env: { ...process.env, NODE_PATH: '' } });
console.log(`Tarball: ${resolve(pkg, packed.filename)}; ${packed.files.length} files, ${packed.size} compressed bytes.`);
console.log(packed.files.map(f => `${f.path} (${f.size} bytes)`).join('\n'));
