// Generates API.md, the D20VRFCoordinator and EpochEntropy reference, from the ABIs that `npm run build` writes to
// abi/ and the curated descriptions in scripts/api-descriptions.mjs.
//
//   node scripts/api-reference.mjs          write API.md
//   node scripts/api-reference.mjs --check  exit 1 if API.md differs from the generated text (run by npm test)
//
// Both modes fail when an ABI item has no description, a description names an item that is not in the ABI, an
// `errors`/`emits` entry or backticked name is unknown, a cited source range does not contain its item, a README or
// in-page link target does not exist, or a constant is missing from the Solidity source.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Interface } from 'ethers';
import { references, externalNames } from './api-descriptions.mjs';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(pkg, 'API.md');
const read = path => readFileSync(resolve(pkg, path), 'utf8');
const problems = [];
const problem = message => problems.push(message);

for (const { abi } of references) {
  if (!existsSync(resolve(pkg, abi))) throw new Error(`${abi} is missing: run npm run build first.`);
}
const packageJson = JSON.parse(read('package.json'));
const provenance = JSON.parse(read('PROTOCOL-PROVENANCE.json'));
const compiler = existsSync(resolve(pkg, 'BUILD-MANIFEST.json')) ? JSON.parse(read('BUILD-MANIFEST.json')).compiler : null;
if (!compiler) throw new Error('BUILD-MANIFEST.json is missing: run npm run build first.');

// ---------------------------------------------------------------------------------------------------------------------
// ABI helpers

const typeName = param => /^(?:struct|enum) (.+)$/.exec(param.internalType ?? '')?.[1] ?? param.type;
const params = (list, withIndexed = false) =>
  list.map(p => [typeName(p), withIndexed && p.indexed ? 'indexed' : '', p.name].filter(Boolean).join(' ')).join(', ');
function declaration(item) {
  if (item.type === 'event') return `event ${item.name}(${params(item.inputs, true)})`;
  if (item.type === 'error') return `error ${item.name}(${params(item.inputs)})`;
  const mutability = item.stateMutability === 'nonpayable' ? '' : ` ${item.stateMutability}`;
  const returns = item.outputs.length ? ` returns (${params(item.outputs)})` : '';
  return `function ${item.name}(${params(item.inputs)}) external${mutability}${returns}`;
}
function structsOf(abi) {
  const structs = new Map();
  const visit = param => {
    const name = /^struct ([^[\]]+)/.exec(param.internalType ?? '')?.[1];
    if (name && param.components) {
      if (!structs.has(name)) structs.set(name, param.components);
      param.components.forEach(visit);
    }
  };
  for (const item of abi) for (const param of [...(item.inputs ?? []), ...(item.outputs ?? [])]) visit(param);
  return structs;
}

const anchor = (key, kind, name) => `${key}-${kind}-${name.toLowerCase().replace(/[^a-z0-9_]+/g, '-')}`;
const slug = text => text.trim().toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');

// ---------------------------------------------------------------------------------------------------------------------
// Load and validate every contract before rendering anything.

const readmeAnchors = new Set();
{
  let fenced = false;
  for (const line of read('README.md').split(/\r?\n/)) {
    if (line.startsWith('```')) fenced = !fenced;
    const heading = !fenced && /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) readmeAnchors.add(slug(heading[1]));
  }
}

const contracts = references.map(ref => {
  const abiText = read(ref.abi);
  const abi = JSON.parse(abiText);
  const iface = new Interface(abi);
  const byKind = { function: new Map(), event: new Map(), error: new Map() };
  for (const item of abi) {
    if (!Object.hasOwn(byKind, item.type)) continue; // constructor
    if (byKind[item.type].has(item.name)) problem(`${ref.title}: overloaded ${item.type} ${item.name} needs a descriptions format that tells overloads apart`);
    byKind[item.type].set(item.name, item);
  }
  const lines = file => {
    const path = `protocol/contracts/${file}`;
    if (!existsSync(resolve(pkg, path))) { problem(`${ref.title}: cited source ${path} does not exist`); return null; }
    return read(path).split(/\r?\n/);
  };
  return { ...ref, abiPath: ref.abi, abiText, abi, iface, byKind, structs: structsOf(abi), lines };
});

const knownNames = new Set([...externalNames, ...references.map(ref => ref.title)]);
for (const contract of contracts) {
  for (const map of Object.values(contract.byKind)) for (const name of map.keys()) knownNames.add(name);
  for (const name of contract.structs.keys()) { knownNames.add(name); knownNames.add(name.split('.').pop()); }
}

function checkText(where, text) {
  for (const [, span] of text.matchAll(/`([^`]+)`/g)) {
    const match = /^([A-Za-z_]\w*)(\(.*\))?$/.exec(span);
    if (!match) continue;
    const [, name, call] = match;
    if (!call && !/^[A-Z]/.test(name)) continue; // bare lowercase words are fields, variables and parameters
    if (!knownNames.has(name)) problem(`${where}: \`${span}\` names nothing in the ABIs or in externalNames`);
  }
  for (const [, target] of text.matchAll(/\]\(README\.md#([^)]+)\)/g)) {
    if (!readmeAnchors.has(target)) problem(`${where}: README.md#${target} is not a README heading`);
  }
}

function checkSource(contract, where, name, src) {
  if (!src) return;
  const [file, ranges] = src.includes(':') ? src.split(':') : [contract.source, src];
  const text = contract.lines(file);
  if (!text) return;
  const parsed = ranges.split(',').map(part => part.trim().split('-').map(Number));
  for (const [start, end = start] of parsed) {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > text.length) {
      problem(`${where}: source range ${start}-${end} is outside ${file} (${text.length} lines)`);
      return;
    }
  }
  const [start, end = start] = parsed[0];
  const short = name.split('.').pop();
  if (!new RegExp(`\\b${short}\\b`).test(text.slice(start - 1, end).join('\n'))) {
    problem(`${where}: ${file} lines ${start}-${end} do not contain ${short}`);
  }
}

const formatSource = (contract, src) => {
  if (!src) return null;
  const [file, ranges] = src.includes(':') ? src.split(':') : [contract.source, src];
  return `\`${file}\` ${ranges.includes(',') || ranges.includes('-') ? 'lines' : 'line'} ${ranges.replace(/-/g, '–')}`;
};

for (const contract of contracts) {
  const { title, byKind } = contract;
  contract.intro.forEach((paragraph, index) => checkText(`${title} intro ${index + 1}`, paragraph));
  contract.described = { function: new Map(), event: new Map(), error: new Map() };
  const register = (kind, groups) => {
    for (const group of groups) {
      checkText(`${title} ${kind} group ${group.title}`, group.intro ?? '');
      for (const [name, entry] of Object.entries(group.items)) {
        const where = `${title}.${name}`;
        if (!byKind[kind].has(name)) problem(`${where}: described as a ${kind} but not in ${contract.abiPath}`);
        if (contract.described[kind].has(name)) problem(`${where}: described twice`);
        contract.described[kind].set(name, { ...entry, group });
        if (!entry.text) problem(`${where}: missing text`);
        checkText(where, `${entry.text ?? ''} ${entry.response ?? ''} ${entry.caller ?? ''} ${entry.also ?? ''}`);
        checkSource(contract, where, name, entry.src);
        if (kind === 'error' && !entry.response) problem(`${where}: errors need a response`);
        if (group.table && (entry.emits?.length || entry.caller)) problem(`${where}: table groups take no emits or caller`);
        if (group.table && /\|/.test(entry.text ?? '')) problem(`${where}: table text cannot contain |`);
        for (const [list, target] of [['errors', 'error'], ['emits', 'event']]) {
          for (const ref of entry[list] ?? []) if (!byKind[target].has(ref)) problem(`${where}: ${list} names ${ref}, which is not in ${contract.abiPath}`);
        }
      }
    }
  };
  register('function', contract.functions);
  register('event', contract.events);
  register('error', contract.errors);
  for (const kind of Object.keys(byKind)) {
    for (const name of byKind[kind].keys()) if (!contract.described[kind].has(name)) problem(`${title}: ABI ${kind} ${name} has no description`);
  }

  // Reverse indexes: which functions raise each error and emit each event.
  contract.raisedBy = new Map();
  contract.emittedBy = new Map();
  for (const [name, entry] of contract.described.function) {
    for (const error of entry.errors ?? []) contract.raisedBy.set(error, [...(contract.raisedBy.get(error) ?? []), name]);
    for (const event of entry.emits ?? []) contract.emittedBy.set(event, [...(contract.emittedBy.get(event) ?? []), name]);
  }
  for (const [name, entry] of contract.described.error) {
    if (!contract.raisedBy.has(name) && !entry.also) problem(`${title}.${name}: no function lists this error and it has no \`also\``);
  }
  for (const [name, entry] of contract.described.event) {
    if (!contract.emittedBy.has(name) && !entry.also) problem(`${title}.${name}: no function emits this event and it has no \`also\``);
  }

  for (const [name, components] of contract.structs) {
    const entry = contract.types[name];
    if (!entry) { problem(`${title}: struct ${name} has no description`); continue; }
    checkText(`${title} type ${name}`, entry.text);
    checkSource(contract, `${title} type ${name}`, name, entry.src);
    const expected = components.map(c => c.name);
    const described = Object.keys(entry.fields);
    if (expected.join() !== described.join()) problem(`${title} type ${name}: fields ${described.join(', ')} differ from the ABI ${expected.join(', ')}`);
    for (const [field, text] of Object.entries(entry.fields)) checkText(`${title} type ${name}.${field}`, text);
  }
  for (const name of Object.keys(contract.types)) if (!contract.structs.has(name)) problem(`${title}: type ${name} is not in ${contract.abiPath}`);

  // Constant values come from the Solidity source.
  for (const group of contract.functions.filter(g => g.constants)) {
    for (const [name, entry] of Object.entries(group.items)) {
      const path = entry.valueFrom ?? `protocol/contracts/${contract.source}`;
      const match = existsSync(resolve(pkg, path)) && new RegExp(`\\bconstant\\s+${name}\\s*=\\s*([^;]+);`).exec(read(path));
      if (!match) problem(`${title}.${name}: no constant ${name} in ${path}`);
      else entry.value = match[1].trim();
      const abiItem = byKind.function.get(name);
      if (abiItem && (abiItem.inputs.length || abiItem.stateMutability !== 'view')) problem(`${title}.${name}: listed as a constant but is not a view without inputs`);
    }
  }
}

if (problems.length) {
  console.error(`API reference descriptions are inconsistent with the ABIs or sources:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------------------------------------------------
// Render

const sha256 = text => createHash('sha256').update(text).digest('hex');
const link = (contract, kind, name) => `[\`${name}\`](#${anchor(contract.key, kind, name)})`;
const out = [];
const push = (...lines) => out.push(...lines);

push(
  '# D20DAO coordinator API reference',
  '',
  '<!-- Generated by scripts/api-reference.mjs from abi/*.json and scripts/api-descriptions.mjs. Do not edit by hand. -->',
  '',
  `Every function, event and error of \`D20VRFCoordinator\` and \`EpochEntropy\`, generated from the ABIs of \`@d20dao/vrf-sdk\` ${packageJson.version}. Regenerate with \`npm run build && npm run api-reference\`; \`npm test\` fails when this file is out of date.`,
  '',
  `- Package: \`@d20dao/vrf-sdk\` ${packageJson.version}`,
  `- Protocol source: commit \`${provenance.sourceCommit}\`, copied to [\`protocol/contracts/\`](protocol/contracts/) (hashes in \`PROTOCOL-PROVENANCE.json\`)`,
  `- Compiler: solc ${compiler}, EVM version \`cancun\``,
  ...contracts.map(c => `- \`${c.abiPath}\` SHA-256: \`${sha256(c.abiText)}\``),
  '',
  'This reference describes that source. A deployment runs it only while the implementation behind each proxy is the one the deployment manifest records for that commit: check when you integrate and whenever a proxy emits `Upgraded` (README [Security and trust](README.md#security-and-trust)).',
  '',
  '## Conventions',
  '',
  '- **Addresses.** Call the proxies listed in README [Deployments](README.md#deployments). The ABIs are those of the implementations; `D20Proxy` adds no functions of its own.',
  '- **Units.** Fees and credits are wei of native USDC, which has 18 decimals (`1e18` is 1 USDC). Deadlines and timestamps are Unix seconds. Ratios are basis points (10000 is 100%).',
  '- **Callers.** "Anyone" means any account or contract; "Any contract" means `msg.sender` must have code. Owner-only functions revert `OwnableUnauthorizedAccount` for other callers.',
  '- **Selectors.** Functions and errors show their 4-byte selector, events their topic 0, so revert data and logs can be matched by hand.',
  '- **Decoding errors.** `coordinatorAbi` and `epochEntropyAbi` (`@d20dao/vrf-sdk/abi`) contain every custom error below. When your consumer calls the coordinator with an ordinary Solidity call, a coordinator revert is passed through unchanged, so a wallet sending a transaction to your consumer sees the coordinator\'s selector. Decode with `coordinator.interface.parseError(data)` in ethers or `decodeErrorResult({ abi: coordinatorAbi, data })` in viem, or build your consumer\'s contract object from its ABI plus the coordinator\'s error entries. Your consumer\'s own errors, such as `OnlyCoordinator` and `InvalidCoordinator` from `D20VRFConsumer`, are only in your consumer\'s ABI. Arithmetic overflow reverts with `Panic(uint256)`.',
  '- **ethers v6 results.** Structs and multiple return values arrive as `Result` objects, which are arrays. A named value is also a property unless its name collides with an `Array` or `Result` member, such as `length`, `values`, `keys`, `map` or `filter`; read such a value with `result.getValue(name)`, by position, or from `result.toObject()`. Unnamed outputs, such as those of `pricing()`, are positional only.',
  '- **Consumer contracts.** `D20VRFConsumer` implements `rawFulfillRandomness(requestId, randomness)` and `onRefund(requestId)`; both revert `OnlyCoordinator` unless called by the coordinator proxy given to its constructor, which reverts `InvalidCoordinator` for an address without code.',
  '',
  '## Contents',
  '',
);
for (const contract of contracts) {
  push(`- [${contract.title}](#${contract.key})`);
  push(`  - [Types](#${contract.key}-types)`);
  for (const group of contract.functions) push(`  - [${group.title}](#${contract.key}-${slug(group.title)})`);
  push(`  - [Events](#${contract.key}-events)`, `  - [Errors](#${contract.key}-errors)`);
}
push('');

const inPageAnchors = new Set();
const heading = (level, id, text) => { inPageAnchors.add(id); push(`${'#'.repeat(level)} <a id="${id}"></a>${text}`, ''); };
const meta = parts => parts.filter(Boolean).join(' · ');

for (const contract of contracts) {
  heading(2, contract.key, contract.title);
  for (const paragraph of contract.intro) push(paragraph, '');

  heading(3, `${contract.key}-types`, 'Types');
  for (const [name, entry] of Object.entries(contract.types)) {
    const components = contract.structs.get(name);
    heading(4, `${contract.key}-type-${name.toLowerCase().replace(/\./g, '-')}`, `\`${name}\``);
    push(entry.text, '', meta([`Source: ${formatSource(contract, entry.src)}`]), '');
    push('| Field | Type | Meaning |', '| --- | --- | --- |');
    for (const component of components) push(`| \`${component.name}\` | \`${typeName(component)}\` | ${entry.fields[component.name]} |`);
    push('');
  }

  for (const group of contract.functions) {
    heading(3, `${contract.key}-${slug(group.title)}`, group.title);
    if (group.intro) push(group.intro, '');
    const entries = Object.entries(group.items).map(([name, entry]) => [name, entry, contract.byKind.function.get(name)]);
    if (group.constants) {
      push('| Constant | Returns | Value | Selector | Meaning |', '| --- | --- | --- | --- | --- |');
      for (const [name, entry, item] of entries) {
        inPageAnchors.add(anchor(contract.key, 'fn', name));
        push(`| <a id="${anchor(contract.key, 'fn', name)}"></a>\`${name}\` | \`${params(item.outputs)}\` | \`${entry.value}\` | \`${contract.iface.getFunction(name).selector}\` | ${entry.text} |`);
      }
      push('');
      continue;
    }
    if (group.table) {
      push('| Function | Selector | Meaning | Source |', '| --- | --- | --- | --- |');
      for (const [name, entry, item] of entries) {
        inPageAnchors.add(anchor(contract.key, 'fn', name));
        const signature = `${name}(${params(item.inputs)}) returns (${params(item.outputs)})`;
        const errors = entry.errors?.length ? ` Reverts ${entry.errors.map(e => link(contract, 'error', e)).join(', ')}.` : '';
        push(`| <a id="${anchor(contract.key, 'fn', name)}"></a>\`${signature}\` | \`${contract.iface.getFunction(name).selector}\` | ${entry.text}${errors} | ${entry.src ? formatSource(contract, entry.src).replace(/`[^`]+` /, '') : ''} |`);
      }
      push('');
      continue;
    }
    for (const [name, entry, item] of entries) {
      heading(4, anchor(contract.key, 'fn', name), `\`${name}\``);
      push('```solidity', declaration(item), '```', '');
      push(meta([`Selector \`${contract.iface.getFunction(name).selector}\``, `Caller: ${entry.caller ?? 'Anyone (view)'}`, entry.src && `Source: ${formatSource(contract, entry.src)}`]), '');
      push(entry.text, '');
      if (entry.emits?.length) push(`**Emits:** ${entry.emits.map(e => link(contract, 'event', e)).join(', ')}.`, '');
      if (entry.errors?.length) push(`**Errors:** ${entry.errors.map(e => link(contract, 'error', e)).join(', ')}.`, '');
    }
  }

  heading(3, `${contract.key}-events`, 'Events');
  for (const group of contract.events) {
    push(`**${group.title}**`, '');
    for (const [name, entry] of Object.entries(group.items)) {
      const item = contract.byKind.event.get(name);
      heading(4, anchor(contract.key, 'event', name), `\`${name}\``);
      push('```solidity', declaration(item), '```', '');
      const emitters = (contract.emittedBy.get(name) ?? []).map(f => link(contract, 'fn', f));
      if (entry.also) emitters.push(entry.also);
      push(meta([`Topic 0 \`${contract.iface.getEvent(name).topicHash}\``, `Emitted by: ${emitters.join(', ')}`, entry.src && `Source: ${formatSource(contract, entry.src)}`]), '');
      push(entry.text, '');
    }
  }

  heading(3, `${contract.key}-errors`, 'Errors');
  for (const group of contract.errors) {
    push(`**${group.title}**`, '');
    for (const [name, entry] of Object.entries(group.items)) {
      const item = contract.byKind.error.get(name);
      heading(4, anchor(contract.key, 'error', name), `\`${name}\``);
      const raisers = (contract.raisedBy.get(name) ?? []).map(f => link(contract, 'fn', f));
      if (entry.also) raisers.push(entry.also);
      push(meta([`\`${declaration(item)}\``, `Selector \`${contract.iface.getError(name).selector}\``, entry.src && `Source: ${formatSource(contract, entry.src)}`]), '');
      push(`**Raised by:** ${raisers.join(', ')}.`, '');
      push(entry.text, '');
      push(`**What to do:** ${entry.response}`, '');
    }
  }
}

let text = out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n*$/, '\n');
for (const [, target] of text.matchAll(/\]\(#([^)]+)\)/g)) {
  if (!inPageAnchors.has(target)) problems.push(`API.md links to #${target}, which is not generated`);
}
if (problems.length) {
  console.error(`API reference rendering problems:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}

if (process.argv.includes('--check')) {
  const current = existsSync(output) ? readFileSync(output, 'utf8').replace(/\r\n/g, '\n') : null;
  if (current !== text) {
    console.error('API.md is out of date with the ABIs or scripts/api-descriptions.mjs. Run: npm run build && npm run api-reference');
    process.exit(1);
  }
  console.log('API.md matches the generated reference.');
} else {
  writeFileSync(output, text);
  console.log(`Wrote API.md (${text.split('\n').length} lines).`);
}
