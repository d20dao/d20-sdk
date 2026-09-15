import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import solc from 'solc';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(pkg, 'protocol');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = {
  compiler: solc.version(),
  protocol: JSON.parse(readFileSync(resolve(pkg, 'PROTOCOL-PROVENANCE.json'), 'utf8')),
  packageLockSha256: sha256(readFileSync(resolve(pkg, 'package-lock.json'))),
  buildDependencies: {},
  sources: {},
};
const read = path => {
  const bytes = readFileSync(resolve(repo, path));
  manifest.sources[path] = sha256(bytes);
  if (manifest.protocol.files[path] !== manifest.sources[path]) throw new Error(`Protocol provenance mismatch: ${path}`);
  return bytes.toString();
};
for (const path of Object.keys(manifest.protocol.files)) read(path);
const put = (path, value) => { const dest = resolve(pkg, path); mkdirSync(dirname(dest), { recursive: true }); writeFileSync(dest, value); };
// Only these package-owned generated directories can be removed. Never touch repository assets.
for (const name of ['.generated', 'dist', 'abi', 'contracts', 'notices']) {
  const target = resolve(pkg, name);
  if (dirname(target) !== pkg) throw new Error('Unsafe generated output path');
  rmSync(target, { recursive: true, force: true });
}
const modules = ['index', 'mapping', 'verification', 'sources', 'snapshots', 'replay', 'source-catalog', 'compact-catalog', 'evidence'];
for (const name of modules) {
  // Mechanical module-specifier conversion only; protocol implementation remains canonical in repo/src.
  put(`.generated/${name}.ts`, read(`src/${name}.ts`).replace(/(from\s+["']\.\/[^"']+)\.ts(["'])/g, '$1.js$2'));
}
const input = {
  language: 'Solidity', sources: {
    'contracts/ArcVRFCoordinator.sol': { content: read('contracts/ArcVRFCoordinator.sol') },
    'contracts/EntropySnapshots.sol': { content: read('contracts/EntropySnapshots.sol') },
  },
  settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun', outputSelection: { '*': { '*': ['abi'] } } },
};
const output = JSON.parse(solc.compile(JSON.stringify(input), { import: path => {
  try {
    if (path.startsWith('@openzeppelin/contracts/')) {
      const bytes = readFileSync(resolve(pkg, 'node_modules', path));
      manifest.buildDependencies[path] = sha256(bytes);
      return { contents: bytes.toString() };
    }
    if (!path.startsWith('contracts/') || path.includes('..')) throw new Error(`Unexpected import ${path}`);
    return { contents: read(path) };
  } catch (error) { return { error: error.message }; }
} }));
const errors = (output.errors ?? []).filter(e => e.severity === 'error');
if (errors.length) throw new Error(errors.map(e => e.formattedMessage).join('\n'));
const abi = output.contracts['contracts/ArcVRFCoordinator.sol'].ArcVRFCoordinator.abi;
put('abi/ArcVRFCoordinator.json', JSON.stringify(abi, null, 2) + '\n');
const snapshotAbi = output.contracts['contracts/EntropySnapshots.sol'].EntropySnapshots.abi;
put('abi/EntropySnapshots.json', JSON.stringify(snapshotAbi, null, 2) + '\n');
put('.generated/abi.ts', `// Generated from canonical protocol sources with solc ${solc.version()}.\nexport const coordinatorAbi = ${JSON.stringify(abi)} as const;\nexport const snapshotAbi = ${JSON.stringify(snapshotAbi)} as const;\n`);
const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true, skipLibCheck: false, declaration: true, rootDir: resolve(pkg, '.generated'), outDir: resolve(pkg, 'dist'), types: [], noEmitOnError: true };
const program = ts.createProgram([...modules, 'abi'].map(n => resolve(pkg, `.generated/${n}.ts`)), options);
const result = program.emit();
const diagnostics = [...ts.getPreEmitDiagnostics(program), ...result.diagnostics];
if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: () => pkg, getCanonicalFileName: f => f, getNewLine: () => '\n' }));
for (const path of ['ArcVRFConsumer.sol', 'interfaces/IArcVRF.sol', 'libraries/ArcVRFRequests.sol', 'libraries/RandomnessMapping.sol', 'examples/MiningRandomnessConsumer.sol']) {
  put(`contracts/${path}`, read(`contracts/${path}`));
}
put('LICENSE', read('LICENSE'));
put('notices/CHAINLINK-LICENSE', read('contracts/vendor/CHAINLINK-LICENSE'));
put('notices/PROVENANCE.md', read('contracts/vendor/PROVENANCE.md'));
put('BUILD-MANIFEST.json', JSON.stringify(manifest, null, 2) + '\n');
console.log('Built public ESM/declarations, canonical coordinator/snapshot ABIs and five consumer Solidity sources.');
