import { mkdtempSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
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
  'dist/abi.js', 'dist/abi.d.ts', 'dist/snapshots.js', 'dist/snapshots.d.ts', 'abi/ArcVRFCoordinator.json', 'abi/EntropySnapshots.json', 'examples/DiceConsumer.sol', 'notices/CHAINLINK-LICENSE'];
for (const name of required) assert(packed.files.some(f => f.path === name), `Missing ${name}`);
for (const { path } of packed.files) {
  assert(!/(^|\/)(node_modules|keeper|test|secrets|\.research|\.generated)(\/|$)|\.env|\.key$|\.tgz$/.test(path), `Forbidden payload ${path}`);
  assert(/^(?:dist\/[\w-]+\.(?:js|d\.ts)|abi\/(?:ArcVRFCoordinator|EntropySnapshots)\.json|contracts\/(?:ArcVRFConsumer\.sol|interfaces\/IArcVRF\.sol|libraries\/(?:RandomnessMapping|ArcVRFRequests)\.sol|examples\/MiningRandomnessConsumer\.sol)|examples\/DiceConsumer\.sol|notices\/(?:CHAINLINK-LICENSE|PROVENANCE\.md)|scripts\/block-publish\.mjs|package\.json|README\.md|AGENTS\.md|LICENSE|THIRD_PARTY_NOTICES\.md|BUILD-MANIFEST\.json)$/.test(path), `Unexpected payload ${path}`);
}
assert.equal(JSON.parse(readFileSync(resolve(pkg, 'package.json'))).private, true);
let guardBlocked = false;
try { execFileSync(process.execPath, [resolve(pkg, 'scripts/block-publish.mjs')], { stdio: 'pipe' }); }
catch (error) { guardBlocked = error.status !== 0 && error.stderr.toString().includes('SDK RELEASE BLOCKED'); }
assert(guardBlocked, 'Publish guard must fail closed');
const temp = mkdtempSync(resolve(tmpdir(), 'arcdao-sdk-consumer-'));
console.log(`Fresh consumer: ${temp}`);
writeFileSync(resolve(temp, 'package.json'), JSON.stringify({ name: 'sdk-smoke-consumer', private: true, type: 'module', overrides: { solc: { tmp: '0.2.7' } } }));
console.log(npm(['install', '--ignore-scripts', '--no-audit', '--no-fund', resolve(pkg, packed.filename), 'typescript@5.9.3', 'solc@0.8.28', 'esbuild@0.28.2'], temp));
copyFileSync(resolve(pkg, 'examples/DiceConsumer.sol'), resolve(temp, 'DiceConsumer.sol'));
writeFileSync(resolve(temp, 'typecheck.ts'), `
import { builtins, mapRandomness, replayCoordinator, decodeEvidencePacket, snapshotConfigurationHash, selectSnapshot, verifySnapshotAttestation, type SnapshotCatalog, type MappingSpec } from '@arcdao/vrf-sdk';
import { coordinatorAbi, snapshotAbi } from '@arcdao/vrf-sdk/abi';
import { Interface, Contract } from 'ethers';
const spec: MappingSpec = builtins.d20();
const result: bigint[] = mapRandomness('0x' + '00'.repeat(32), spec);
const iface = new Interface(coordinatorAbi);
const contract = new Contract('0x0000000000000000000000000000000000000001', coordinatorAbi);
const snapshots = new Contract('0x0000000000000000000000000000000000000001', snapshotAbi);
const snapshotTypecheck = (catalog: SnapshotCatalog) => snapshotConfigurationHash(catalog.records);
type ReplayInput = Parameters<typeof replayCoordinator>[0];
type Evidence = ReturnType<typeof decodeEvidencePacket>;
console.log(result, iface, contract);
`);
writeFileSync(resolve(temp, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true, skipLibCheck: false, types: [] }, files: ['typecheck.ts'] }));
execFileSync(process.execPath, [resolve(temp, 'node_modules/typescript/bin/tsc'), '-p', resolve(temp, 'tsconfig.json')], { cwd: temp, stdio: 'inherit' });
writeFileSync(resolve(temp, 'smoke.mjs'), `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import solc from 'solc';
import { Interface, Wallet, getBytes, hexlify, toUtf8Bytes } from 'ethers';
import * as sdk from '@arcdao/vrf-sdk';
import { coordinatorAbi, snapshotAbi } from '@arcdao/vrf-sdk/abi';
const iface = new Interface(coordinatorAbi);
for (const name of ['requestFee', 'requestMappedRandomness', 'refundRequest', 'retryCallback', 'getRequest']) assert(iface.getFunction(name));
assert(iface.getEvent('FulfillmentEvidence'));
assert.deepEqual(coordinatorAbi, JSON.parse(readFileSync('node_modules/@arcdao/vrf-sdk/abi/ArcVRFCoordinator.json')));
assert.deepEqual(snapshotAbi, JSON.parse(readFileSync('node_modules/@arcdao/vrf-sdk/abi/EntropySnapshots.json')));
const snapshotInterface = new Interface(snapshotAbi);
for (const name of ['configurationHash', 'committedAt', 'recordCount', 'getRecord', 'getSnapshotForSource', 'select', 'verify']) assert(snapshotInterface.getFunction(name));
const signer = Wallet.createRandom();
const request = 'authenticated opaque snapshot query';
const attestation = { timestamp: 100n, data: hexlify(toUtf8Bytes('{"value":"42"}')), signature: '0x' };
const { keccak256 } = await import('ethers');
attestation.signature = await signer.signMessage(getBytes(sdk.attestationDigest(keccak256(toUtf8Bytes(request)), attestation)));
const catalog = { committedAt: 101n, records: [{source: 11, airnode: signer.address, canonicalRequest: request, attestation}] };
const selected = sdk.selectSnapshot(1n, '0x' + '01'.repeat(32), 102n, catalog);
assert.equal(selected.canonicalRequest, request);
assert.equal(sdk.verifySnapshotAttestation(selected, attestation, catalog).dataHash, keccak256(attestation.data));
assert.throws(() => sdk.selectSnapshot(1n, '0x' + '01'.repeat(32), 101n, catalog));
assert.throws(() => sdk.verifySnapshotAttestation(selected, {...attestation, timestamp: 101n}, catalog));
for (const signature of [attestation.signature.slice(0, -2), attestation.signature.slice(0, -2) + '00', attestation.signature.slice(0, 66) + 'ff'.repeat(32) + attestation.signature.slice(-2)]) {
  assert.throws(() => sdk.snapshotConfigurationHash([{...catalog.records[0], attestation: {...attestation, signature}}]));
}
const word = '0x' + '00'.repeat(32);
const mapped = sdk.mapRandomness(word, sdk.builtins.d20());
assert(mapped.length === 1 && mapped[0] >= 1n && mapped[0] <= 20n);
assert.equal(sdk.sourceCatalog.length, 12);
assert.throws(() => sdk.decodeEvidencePacket('0x'));
const bundle = await build({ stdin: { contents: "export * from '@arcdao/vrf-sdk'; export * from '@arcdao/vrf-sdk/abi';", resolveDir: process.cwd(), sourcefile: 'public-entry.js' }, bundle: true, platform: 'browser', format: 'esm', target: 'es2022', write: false, metafile: true });
const forbidden = Object.keys(bundle.metafile.inputs).filter(p => /(^|\\/)(keeper|test|secrets|\\.research)(\\/|$)|node:/.test(p.replaceAll('\\\\', '/')));
assert.deepEqual(forbidden, []);
const browser = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
assert.deepEqual(browser.mapRandomness(word, browser.builtins.d20()), mapped);
assert.equal(browser.coordinatorAbi.length, coordinatorAbi.length);
assert.deepEqual(browser.snapshotAbi, snapshotAbi);
assert.equal(browser.snapshotConfigurationHash(catalog.records), sdk.snapshotConfigurationHash(catalog.records));
const input = { language: 'Solidity', sources: { 'DiceConsumer.sol': { content: readFileSync('DiceConsumer.sol', 'utf8') }, 'MiningImport.sol': { content: 'pragma solidity 0.8.28; import "@arcdao/vrf-sdk/contracts/examples/MiningRandomnessConsumer.sol";' } }, settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } } };
const compiled = JSON.parse(solc.compile(JSON.stringify(input), { import: p => { try { if (!p.startsWith('@arcdao/vrf-sdk/') || p.includes('..')) throw new Error('unexpected import'); return { contents: readFileSync(resolve('node_modules', p), 'utf8') }; } catch (e) { return { error: e.message }; } } }));
const errors = (compiled.errors ?? []).filter(e => e.severity === 'error');
assert.deepEqual(errors, [], JSON.stringify(errors));
assert(compiled.contracts['DiceConsumer.sol'].DiceConsumer.evm.bytecode.object.length > 0);
const consumerInterface = new Interface(compiled.contracts['@arcdao/vrf-sdk/contracts/interfaces/IArcVRF.sol'].IArcVRF.abi);
consumerInterface.forEachFunction(fragment => {
  const coordinatorFunction = iface.getFunction(fragment.format('sighash'));
  assert(coordinatorFunction, 'Consumer function missing from coordinator ABI');
  assert.equal(coordinatorFunction.selector, fragment.selector);
  assert.equal(coordinatorFunction.stateMutability, fragment.stateMutability);
  assert.deepEqual(coordinatorFunction.outputs.map(p => p.format('sighash')), fragment.outputs.map(p => p.format('sighash')));
});
console.log('Fresh runtime, ABI, TypeScript, browser bundle (' + bundle.outputFiles[0].contents.length + ' bytes), Solidity example/import checks passed.');
`);
execFileSync(process.execPath, [resolve(temp, 'smoke.mjs')], { cwd: temp, stdio: 'inherit', env: { ...process.env, NODE_PATH: '' } });
console.log(`Tarball: ${resolve(pkg, packed.filename)}; ${packed.files.length} files, ${packed.size} compressed bytes.`);
console.log(packed.files.map(f => `${f.path} (${f.size} bytes)`).join('\n'));
