// Runs only after installing the actual tarball into an isolated consumer.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import solc from 'solc';
import { Interface, getBytes, getAddress, hexlify, keccak256, toUtf8Bytes, ZeroAddress, ZeroHash } from 'ethers';
import * as sdk from '@d20dao/vrf-sdk';
import * as epoch from '@d20dao/vrf-sdk/epoch';
import { coordinatorAbi, epochEntropyAbi, beaconVerifierAbi } from '@d20dao/vrf-sdk/abi';
const iface = new Interface(coordinatorAbi), registry = new Interface(epochEntropyAbi), verifier = new Interface(beaconVerifierAbi);
assert.deepEqual(coordinatorAbi, JSON.parse(readFileSync('node_modules/@d20dao/vrf-sdk/abi/D20VRFCoordinator.json')));
assert.deepEqual(epochEntropyAbi, JSON.parse(readFileSync('node_modules/@d20dao/vrf-sdk/abi/EpochEntropy.json')));
assert.deepEqual(beaconVerifierAbi, JSON.parse(readFileSync('node_modules/@d20dao/vrf-sdk/abi/D20BeaconVerifier.json')));
for (const name of ['quoteFee','quoteFeeAt','pricing','setPricing','requestFeePaid','requestRefundBps','setRefundBps','withdrawRefundCredit','refundCredits','initialMinFee','fulfillRandomnessBatch',
 'requestRandomness','requestMappedRandomness','refundRequest','retryCallback','getRequest','epochRegistry','retryRefundCallback','refundCallbackDelivered','keeperFeeBps',
 'MAX_FULFILL_BATCH','MAX_MIN_FEE','MAX_FEE_MULTIPLIER','MIN_FULFILL_GAS_OVERHEAD','MAX_FULFILL_GAS_OVERHEAD','MIN_REFUND_BPS','RESPONSE_TIMEOUT']) assert(iface.getFunction(name), name);
// The fee depends on the callback gas limit and the base fee of the requesting transaction.
assert(!iface.hasFunction('requestFee'));
assert.deepEqual(iface.getFunction('quoteFee').inputs.map(p => p.type), ['uint32']);
assert.deepEqual(iface.getFunction('quoteFeeAt').inputs.map(p => p.type), ['uint32','uint256']);
assert.deepEqual(iface.getFunction('pricing').outputs.map(p => p.type), ['uint256','uint16','uint32']);
assert.deepEqual(iface.getFunction('setPricing').inputs.map(p => p.type), ['uint256','uint16','uint32']);
assert.deepEqual(iface.getFunction('fulfillRandomnessBatch').inputs.map(p => p.baseType), ['array','array']);
for (const name of ['RefundCallbackAttempted','PricingChanged','RefundBpsChanged','FeeOverpaymentCredited','FulfillmentSkipped','RequestRefundedTo','RefundCreditWithdrawn','KeeperFeePaid']) assert(iface.getEvent(name), name);
assert(iface.getEvent('RandomnessRequested').inputs.some(p => p.name === 'feePaid'), 'RandomnessRequested must carry the charged fee');
assert.deepEqual(iface.getEvent('FulfillmentSkipped').inputs.map(p => p.type), ['uint256','uint8']);
assert.deepEqual(iface.getError('IncorrectFee').inputs.map(p => p.type), ['uint256','uint256']);
for (const name of ['FeeOverflow','InvalidBatch','NoRefundCredit']) assert(iface.getError(name), name);
for (const name of ['epochStart','epochForBlock','getEpochSelection','getEpochFallbackSelection','fallbackOpensAt','getEpoch','commitEpoch','commitEpochFallback','scheduleCatalog','catalogAt','sourceCountAt','catalogHash','MAX_ATTESTATION_AGE',
 'registerRecipe','recipeCount','getRecipe','recipeRequest','initializeRecipeRegistry','setBackupCommitter','isBackupCommitter','backupCommitterCount','committer',
 'MAX_SOURCES','MAX_RECIPES','MAX_REQUEST_BYTES','MAX_BODY_BYTES','MAX_DATA_BYTES','MAX_TEMPLATE_BYTES','MAX_BACKUP_COMMITTERS']) assert(registry.getFunction(name), name);
// Catalogs name registered recipe ids with one signer each; the four-signer catalog views are gone.
assert.deepEqual(registry.getFunction('scheduleCatalog').inputs.map(p => p.type), ['uint8[]','address[]','uint64']);
assert.deepEqual(registry.getFunction('catalogAt').outputs.map(p => p.type), ['bytes32','uint8[]','address[]']);
assert.deepEqual(registry.getFunction('getRecipe').outputs.map(p => p.type), ['bytes32','string','bytes','string']);
assert.deepEqual(registry.getFunction('registerRecipe').inputs.map(p => p.type), ['string','bytes','string']);
assert.deepEqual(registry.getFunction('getEpochSelection').outputs[0].components.map(p => p.name), ['source','recipe','airnode','selector','queryHash','canonicalRequest']);
for (const name of ['signersAt','catalogHashAt','anuSigner']) assert(!registry.hasFunction(name), name);
for (const name of ['EpochCommitted','CatalogScheduled','RecipeRegistered','BackupCommitterSet']) assert(registry.getEvent(name), name);
assert.deepEqual(registry.getEvent('CatalogScheduled').inputs.map(p => p.type), ['uint64','bytes32','uint8[]','address[]']);
for (const name of ['InvalidRecipe','InvalidTemplate','OnlyCommitter']) assert(registry.getError(name), name);
// Beacon recipes: registerBeacon appends one, beaconOf, slotSigner and verifyBeacon read it, and the registry calls a stateless verifier.
for (const name of ['registerBeacon','beaconOf','slotSigner','verifyBeacon','BEACON_VERIFY_GAS','BEACON_DOMAIN']) assert(registry.getFunction(name), name);
assert.deepEqual(registry.getFunction('registerBeacon').inputs.map(p => p.type), ['address','bytes32','bytes','uint64','uint64','uint64','bytes']);
assert.deepEqual(registry.getFunction('beaconOf').outputs[0].components.map(p => `${p.name}:${p.type}`), ['verifier:address','genesis:uint64','period:uint64','chainHash:bytes32','publicKey:bytes']);
assert.deepEqual(registry.getFunction('verifyBeacon').inputs.map(p => p.type), ['uint8','uint64','bytes']);
assert.equal(registry.getFunction('slotSigner').outputs[0].type, 'address');
assert.deepEqual(registry.getEvent('BeaconRegistered').inputs.map(p => `${p.name}:${p.type}`), ['recipe:uint8','verifier:address','chainHash:bytes32','publicKey:bytes','genesis:uint64','period:uint64']);
assert(registry.getError('BeaconGasTooLow'));
assert.deepEqual(['isValidPublicKey','roundMessage','verifyRound','DST','PAIRING_GAS'].filter(name => verifier.hasFunction(name)), ['isValidPublicKey','roundMessage','verifyRound','DST','PAIRING_GAS']);
assert.deepEqual(verifier.getFunction('verifyRound').inputs.map(p => p.type), ['bytes','uint64','bytes']);
assert(verifier.getError('InsufficientGas'));
assert.equal(verifier.deploy.inputs.length, 0);
for (const abi of [iface,registry]) { assert(abi.getFunction('renounceOwnership')); assert(abi.getError('RenounceDisabled')); }
assert.equal(epoch.MAX_ATTESTATION_AGE, 240n);
assert(iface.getEvent('FulfillmentEvidence'));
assert.equal(iface.getFunction('fulfillRandomness').inputs.length, 2);
const requestOutputs = JSON.stringify(iface.getFunction('getRequest').outputs);
assert(requestOutputs.includes('epochId') && requestOutputs.includes('epochHash'));
assert(!requestOutputs.includes('apiDataHash'));
const fixtureProvenance = JSON.parse(readFileSync('fixture-provenance.json','utf8'));
assert(['live API3','explicit CI fixture'].includes(fixtureProvenance.sourceMode));
const fixtures = JSON.parse(readFileSync('fixture-names.json','utf8')).map(name => JSON.parse(readFileSync(name,'utf8'), (_key,value) => typeof value === 'string' && /^[0-9]+$/.test(value) ? BigInt(value) : value));
const fixture = fixtures[0];
const canonicalProof = proof => ({...proof,uWitness:getAddress(proof.uWitness)});
const recipeOf = f => (f.epoch.catalog.recipes ?? epoch.INITIAL_EPOCH_RECIPES)[Number(f.epoch.record.source)];
const coveredRecipes = [...new Set(fixtures.map(recipeOf))].sort((a, b) => a - b);
assert.deepEqual(coveredRecipes, [0,1,2,4,5], 'Current fixture coverage must include every rollout catalog recipe');
assert(fixtures.some(f => f.epoch.catalog.recipes === undefined) && fixtures.some(f => f.epoch.catalog.recipes !== undefined), 'Fixtures must replay the initial and a scheduled catalog');
assert.deepEqual(epoch.BUILTIN_EPOCH_RECIPES.map(r => r.id), [0,1,2,3,4,5]);
assert.deepEqual(epoch.INITIAL_EPOCH_RECIPES, [0,1,2,3]);
assert.equal(registry.deploy.inputs.length,0);
assert.equal(iface.deploy.inputs.length,0);
assert.equal(registry.getFunction('initialize').inputs[0].type,'address[4]');
for (const abi of [iface,registry]) for (const name of ['initialize','owner','pendingOwner','upgradeToAndCall']) assert(abi.getFunction(name));
assert(iface.getFunction('initialFeeRecipient'));
assert(requestOutputs.includes('requestBlock') && requestOutputs.includes('targetBlock'));
assert(fixtures.some(f => epoch.epochForBlock(f.configuration.firstEpochStart,f.acceptanceBlock) > f.context.epochId), 'Fixture set must replay a request accepted across an epoch boundary');
for (const f of fixtures) {
 assert.equal(f.epoch.catalog.signers.length,(f.epoch.catalog.recipes ?? epoch.INITIAL_EPOCH_RECIPES).length);
 // Built-in recipes replay without a recipe book; a registered definition from getRecipe gives the same result.
 const builtinOnly = {...f, epoch: {...f.epoch, catalog: {...f.epoch.catalog, recipeBook: undefined}}};
 assert.deepEqual(sdk.replayCoordinator(builtinOnly), sdk.replayCoordinator(f));
 const book = f.epoch.catalog.recipeBook;
 for (const [id, definition] of Object.entries(book)) assert.deepEqual({...definition}, {canonicalRequest: epoch.BUILTIN_EPOCH_RECIPES[id].canonicalRequest, template: epoch.BUILTIN_EPOCH_RECIPES[id].template, body: epoch.BUILTIN_EPOCH_RECIPES[id].body});
 const recipe = recipeOf(f), selected = epoch.selectEpoch(f.epoch.catalog, f.context.epochId, f.epoch.record.anchorHash, 0);
 assert.equal(selected.recipe, recipe);
 // The recipe's data template decides which signed bytes the registry accepts: one changed byte is rejected.
 const signed = epoch.decodeEpochEvidencePacket(f.epoch.packet).attestation.data;
 assert(sdk.matchesDataTemplate(book[recipe].template, signed));
 assert(!sdk.matchesDataTemplate(book[recipe].template, signed + '20'));
 const otherTemplate = book[recipe === 0 ? 2 : 0].template; // a template of another record shape
 assert.throws(() => sdk.replayCoordinator({...f, epoch: {...f.epoch, catalog: {...f.epoch.catalog, recipeBook: {...book, [recipe]: {...book[recipe], template: otherTemplate}}}}}), /Invalid exact epoch data/);
 assert.equal(typeof f.configuration.initialMinFee, 'bigint');
 assert(!('requestFee' in f.configuration), 'Fixtures carry the initialize() fee as initialMinFee');
 const evidence = epoch.decodeEpochEvidencePacket(f.epoch.packet);
 assert(getBytes(evidence.attestation.data).length <= 128);
 // Attestations may be up to MAX_ATTESTATION_AGE (240 s) old at publication; the replayed catalog binds record.catalogHash.
 const commitment = {...f.epoch, epochId: f.context.epochId};
 assert.equal(epoch.replayEpochCommitment({...commitment, commitTimestamp: evidence.attestation.timestamp + 240n}).epochHash, f.context.epochHash);
 assert.throws(() => epoch.replayEpochCommitment({...commitment, commitTimestamp: evidence.attestation.timestamp + 241n}), /attestation time/);
 assert.throws(() => epoch.replayEpochCommitment({...commitment, catalog: {...f.epoch.catalog, signers: [...f.epoch.catalog.signers.slice(0,3), f.epoch.catalog.signers[0]]}}));
 const replayed = sdk.replayCoordinator(f);
 assert.equal(replayed.reveal.randomness,f.recorded.randomness);
 assert.equal(sdk.deriveRequestSeed(f.context),f.vrfProof.seed);
 assert.deepEqual(sdk.decodeEvidencePacket(sdk.encodeEvidencePacket(f.vrfProof)).proof,canonicalProof(f.vrfProof));
}
const result = sdk.replayCoordinator(fixture);
assert.equal(result.reveal.randomness, fixture.recorded.randomness);
assert.equal(sdk.deriveRequestSeed(fixture.context), fixture.vrfProof.seed);
assert.equal(sdk.epochProtocolConfigurationHash(fixture.configuration), fixture.protocolConfigurationHash);
assert.notEqual(sdk.epochProtocolConfigurationHash({...fixture.configuration, initialMinFee: fixture.configuration.initialMinFee + 1n}), fixture.protocolConfigurationHash);
const packet = sdk.encodeEvidencePacket(fixture.vrfProof);
assert.equal(getBytes(packet).length, 416);
assert.equal(getBytes(iface.encodeFunctionData('fulfillRandomness',[fixture.context.requestId,fixture.vrfProof])).length,452);
assert.deepEqual(sdk.decodeEvidencePacket(packet).proof, canonicalProof(fixture.vrfProof));
assert.throws(() => sdk.decodeEvidencePacket(packet + '00'));
assert.throws(() => sdk.decodeEvidencePacket(packet.slice(0,-2)));
assert.throws(() => sdk.decodeEvidencePacket(fixture.epoch.packet));
assert.throws(() => epoch.decodeEpochEvidencePacket(packet));
const decodedEpoch = epoch.decodeEpochEvidencePacket(fixture.epoch.packet);
assert.equal(epoch.encodeEpochEvidencePacket(decodedEpoch.canonicalRequest,decodedEpoch.attestation),fixture.epoch.packet);
assert.throws(() => epoch.decodeEpochEvidencePacket(fixture.epoch.packet+'00'));
assert.throws(() => sdk.replayCoordinator({...fixture,context:{...fixture.context,epochId:fixture.context.epochId+1n}}));
assert.throws(() => sdk.replayCoordinator({...fixture,context:{...fixture.context,epochHash:'0x'+'00'.repeat(32)}}));
assert.throws(() => sdk.replayCoordinator({...fixture,context:{...fixture.context,requestBlock:fixture.context.requestBlock+1n}}));
assert.throws(() => sdk.replayCoordinator({...fixture,context:{...fixture.context,targetBlock:fixture.context.targetBlock-1n}}));
assert.throws(() => sdk.replayCoordinator({...fixture,vrfProof:{...fixture.vrfProof,seed:0n}}));
assert.throws(() => sdk.replayCoordinator({...fixture,acceptanceTimestamp:fixture.deadline+1n}));
assert.throws(() => sdk.replayCoordinator({...fixture,epoch:{...fixture.epoch,record:{...fixture.epoch.record,committedBlock:fixture.context.targetBlock}}}));
assert.equal(epoch.epochForBlock(300n,299n),0n);
assert.equal(epoch.epochForBlock(300n,300n),1n);
assert.equal(epoch.epochForBlock(300n,499n),1n);
assert.equal(epoch.epochForBlock(300n,500n),2n);
assert(Number(fixture.epoch.record.source) < (fixture.epoch.catalog.recipes ?? epoch.INITIAL_EPOCH_RECIPES).length);
// Data templates: the encoding round-trips and matching is exact.
const tradeTemplate = sdk.encodeDataTemplate([{literal:'{"symbol":"BTCUSD","price":'},{decimal:{fraction:true,exponent:true}},{literal:',"size":'},{decimal:{fraction:true,exponent:true}},{literal:',"timestamp":'},{integer:{minDigits:1,maxDigits:16}},{literal:'}'}]);
assert.equal(tradeTemplate, epoch.BUILTIN_EPOCH_RECIPES[2].template);
assert.deepEqual(sdk.decodeDataTemplate(tradeTemplate)[1], {decimal:{fraction:true,exponent:true}});
const utf8 = text => '0x' + Buffer.from(text).toString('hex');
assert(sdk.matchesDataTemplate(tradeTemplate, utf8('{"symbol":"BTCUSD","price":117000.5,"size":0.01,"timestamp":1789503538000}')));
assert(!sdk.matchesDataTemplate(tradeTemplate, utf8('{"symbol":"BTCUSD","price":0117000.5,"size":0.01,"timestamp":1789503538000}')));
assert.throws(() => sdk.encodeDataTemplate([{literal:'only literals'}]));
assert.equal(sdk.isValidDataTemplate('0x0101'), false);
// Evidence recorded before the recipe registry used ANU in slot 1. It replays when its definition is supplied as
// a registered recipe, and a recipe book cannot turn it into the built-in recipe 1.
const anu = {canonicalRequest:'["randomNumbers",[["length",4],["size",8],["type","hex8"]]]',
 template:sdk.encodeDataTemplate([{literal:'{"success":true,"type":"hex8","length":"4","data":["'},{hex:16},{literal:'","'},{hex:16},{literal:'","'},{hex:16},{literal:'","'},{hex:16},{literal:'"]}'}]),
 body:'{"operation":"randomNumbers","parameters":{"type":"hex8","length":4,"size":8}}'};
const legacyFixtures = JSON.parse(readFileSync('legacy-fixture-names.json','utf8')).map(name => JSON.parse(readFileSync(name,'utf8'), (_key,value) => typeof value === 'string' && /^[0-9]+$/.test(value) ? BigInt(value) : value));
assert(legacyFixtures.some(f => Number(f.epoch.record.source) === 1), 'Legacy fixtures must include an ANU epoch');
for (const f of legacyFixtures) {
 const withAnu = {...f, epoch: {...f.epoch, catalog: {...f.epoch.catalog, recipeBook: {1: anu}}}};
 assert.equal(sdk.replayCoordinator(withAnu).reveal.randomness, f.recorded.randomness);
 if (Number(f.epoch.record.source) === 1) assert.throws(() => sdk.replayCoordinator(f), /Epoch recipe mismatch/);
 else assert.equal(sdk.replayCoordinator(f).reveal.randomness, f.recorded.randomness);
}
// Real Arc data, recorded with scripts/record-live-fixture.mjs from the public RPCs: signed-record and drand beacon epochs of
// both networks. Every accepted request replays through the public API to the word the chain recorded.
const revive = (_key,value) => typeof value === 'string' && /^[0-9]+$/.test(value) ? BigInt(value) : value;
const liveNames = JSON.parse(readFileSync('live-fixture-names.json','utf8'));
const liveSets = Object.fromEntries(Object.entries(liveNames).map(([set, names]) => [set, {
 provenance: JSON.parse(readFileSync(`${set}-provenance.json`,'utf8')),
 fixtures: names.map(name => [name.slice(set.length + 1), JSON.parse(readFileSync(name,'utf8'), revive)]),
}]));
const recipesOf = ({fixtures: recorded}) => recorded.map(([, f]) => recipeOf(f)).sort((a, b) => a - b);
assert.deepEqual(recipesOf(liveSets['arc-mainnet-signed']), [0,1,2,2,4,5,6,7,8]);
assert.deepEqual(recipesOf(liveSets['arc-testnet-signed']), [3,9,10]);
assert.deepEqual(recipesOf(liveSets['arc-testnet-drand']), [11,11]);
assert.deepEqual(recipesOf(liveSets['arc-mainnet-drand']), [11,11]);
// Each network's signed set holds epochs of its initial catalog and of a scheduled catalog.
for (const set of ['arc-mainnet-signed', 'arc-testnet-signed']) assert(liveSets[set].fixtures.some(([, f]) => f.epoch.catalog.recipes === undefined) && liveSets[set].fixtures.some(([, f]) => f.epoch.catalog.recipes !== undefined), set);
for (const [set, {provenance, fixtures: recorded}] of Object.entries(liveSets)) {
 assert.match(provenance.sourceMode, /^live Arc (?:Mainnet|Testnet)$/);
 assert.equal(set.startsWith('arc-mainnet'), provenance.sourceMode.endsWith('Mainnet'));
 assert.deepEqual(Object.keys(provenance.fixtures).sort(), recorded.map(([name]) => name).sort());
 for (const [name, f] of recorded) {
  const entry = provenance.fixtures[name];
  assert.equal(f.context.chainId, provenance.sourceMode.endsWith('Mainnet') ? 5042n : 5042002n);
  assert.equal(BigInt(provenance.chainId), f.context.chainId);
  assert.equal(BigInt(entry.requestId), f.context.requestId);
  assert.equal(BigInt(entry.epochId), f.context.epochId);
  assert.equal(BigInt(entry.acceptanceBlock), f.acceptanceBlock);
  assert.match(entry.fulfillmentTransactionHash, /^0x[0-9a-f]{64}$/);
  assert.equal(sdk.replayCoordinator(f).reveal.randomness, f.recorded.randomness, `${set} ${name}`);
  assert.equal(sdk.deriveRequestSeed(f.context), f.vrfProof.seed);
  assert.equal(sdk.epochProtocolConfigurationHash(f.configuration), f.protocolConfigurationHash);
  // The epoch alone, and its freshness bound: signed (a beacon round: scheduled) at most 240 seconds before publication.
  const commitment = {...f.epoch, epochId: f.context.epochId}, signedAt = f.epoch.record.signedAt;
  assert.equal(epoch.replayEpochCommitment(commitment).epochHash, f.context.epochHash);
  assert.equal(epoch.decodeEpochEvidencePacket(f.epoch.packet).attestation.timestamp, signedAt);
  assert.equal(epoch.replayEpochCommitment({...commitment, commitTimestamp: signedAt + 240n}).epochHash, f.context.epochHash);
  assert.throws(() => epoch.replayEpochCommitment({...commitment, commitTimestamp: signedAt + 241n}), /attestation time/);
  assert.throws(() => epoch.replayEpochCommitment({...commitment, commitTimestamp: signedAt - 1n}), /attestation time/);
 }
}
const flipByte = (hex, index) => { const bytes = getBytes(hex).slice(); bytes[index] ^= 1; return hexlify(bytes); };
const attestationOf = f => epoch.decodeEpochEvidencePacket(f.epoch.packet);
// f.epoch with its committed attestation changed, or with its catalog changed; the rest of the evidence stays as recorded.
const withAttestation = (f, change) => { const {canonicalRequest, attestation} = attestationOf(f); return {...f.epoch, epochId: f.context.epochId, packet: epoch.encodeEpochEvidencePacket(canonicalRequest, {...attestation, ...change(attestation)})}; };
const withCatalog = (f, change) => ({...f.epoch, epochId: f.context.epochId, catalog: change(f.epoch.catalog)});
// Signed-record epochs, as before the drand beacon: a 65-byte EIP-191 signature of the catalog's signer.
const signedFixtures = ['arc-mainnet-signed', 'arc-testnet-signed'].flatMap(set => liveSets[set].fixtures.map(([, f]) => f));
const passthroughOf = {6: 0, 7: 1, 8: 2, 9: 4, 10: 5}; // recipes 6-10 are the passthrough listings of built-in recipes 0, 1, 2, 4, 5
for (const f of signedFixtures) {
 const book = f.epoch.catalog.recipeBook, recipe = recipeOf(f), {attestation} = attestationOf(f);
 assert(Object.values(book).every(entry => entry.beacon === undefined));
 assert.equal(getBytes(attestation.signature).length, 65);
 for (const [id, definition] of Object.entries(book)) {
  const expected = id < 6 ? epoch.BUILTIN_EPOCH_RECIPES[id] : epoch.passthroughEpochRecipe(passthroughOf[id]);
  assert.deepEqual({...definition}, {canonicalRequest: expected.canonicalRequest, template: expected.template, body: expected.body});
 }
 // Built-in recipes replay without a recipe book; the passthrough recipes need their registered definitions.
 const bare = withCatalog(f, catalog => ({...catalog, recipeBook: undefined}));
 if (recipe < 6) assert.equal(epoch.replayEpochCommitment(bare).epochHash, f.context.epochHash);
 else assert.throws(() => epoch.replayEpochCommitment(bare), /Unknown epoch recipe/);
 assert.throws(() => epoch.replayEpochCommitment(withAttestation(f, a => ({signature: flipByte(a.signature, 40)}))));
 assert.throws(() => epoch.replayEpochCommitment(withAttestation(f, a => ({signature: hexlify(getBytes(a.signature).slice(0, 64))}))), /65-byte/);
 assert.throws(() => epoch.replayEpochCommitment(withAttestation(f, a => ({timestamp: a.timestamp - 1n}))));
 assert.throws(() => sdk.replayCoordinator({...f, epoch: withCatalog(f, catalog => ({...catalog, signers: catalog.signers.map(() => '0x' + '11'.repeat(20))}))}));
}
// A beacon epoch commits one drand round: the round number as data, its scheduled time and the beacon's 64-byte BLS signature.
const g2Generator = '0x' + [11559732032986387107991004021392285783925812861821192530917403151452391805634n, 10857046999023057135944570762232829481370756359578518086990519993285655852781n,
 4082367875863433681332203403145435568316851327593401208105741076214120093531n, 8495653923123431417604973247489272438418190587263600148770280649306958101930n].map(word => word.toString(16).padStart(64, '0')).join('');
const testnetBeacon = liveSets['arc-testnet-drand'].fixtures.map(([, f]) => f), mainnetBeacon = liveSets['arc-mainnet-drand'].fixtures.map(([, f]) => f);
const beaconFixtures = [...testnetBeacon, ...mainnetBeacon];
const roundOf = f => sdk.decodeBeaconRound(attestationOf(f).attestation.data);
assert.equal(new Set(testnetBeacon.map(f => f.context.epochId)).size, 2);
assert.deepEqual([...new Set(mainnetBeacon.map(f => f.context.epochId))], [12448n]); // both requests are in the first Arc Mainnet drand epoch
for (const f of beaconFixtures) {
 const recipe = f.epoch.catalog.recipeBook[11], registration = recipe.beacon, {canonicalRequest, attestation} = attestationOf(f), round = roundOf(f);
 assert.deepEqual(f.epoch.catalog.recipes, [11]);
 assert.equal(canonicalRequest, recipe.canonicalRequest);
 // The registration is drand's evmnet, and the recipe is the one registerBeacon appends for it.
 assert.deepEqual({chainHash: registration.chainHash, publicKey: registration.publicKey, genesis: registration.genesis, period: registration.period},
  {chainHash: sdk.DRAND_EVMNET.chainHash, publicKey: sdk.DRAND_EVMNET.publicKey, genesis: sdk.DRAND_EVMNET.genesis, period: sdk.DRAND_EVMNET.period});
 assert.equal(sdk.beaconCanonicalRequest(registration.chainHash), recipe.canonicalRequest);
 assert.equal(recipe.body, recipe.canonicalRequest);
 assert.equal(recipe.template, sdk.BEACON_TEMPLATE);
 assert.equal(sdk.beaconSlotSigner(registration), f.epoch.catalog.signers[0]); // what slotSigner(recipe) returns on chain
 assert.equal(getBytes(attestation.signature).length, 64);
 assert.equal(attestation.timestamp, sdk.beaconRoundTime(registration, round));
 assert.equal(sdk.beaconRoundAt(registration, attestation.timestamp), round);
 assert.equal(sdk.encodeBeaconRound(round), attestation.data);
 assert(sdk.verifyBeaconRound(registration.publicKey, round, attestation.signature));
 assert(!sdk.verifyBeaconRound(registration.publicKey, round + 1n, attestation.signature));
 assert(!sdk.verifyBeaconRound(g2Generator, round, attestation.signature));
 const replay = change => () => epoch.replayEpochCommitment(withAttestation(f, change));
 const replayCatalog = change => () => epoch.replayEpochCommitment(withCatalog(f, change));
 const withBeacon = beacon => catalog => ({...catalog, recipeBook: {...catalog.recipeBook, 11: {...recipe, beacon}}});
 const otherSignature = '0x' + JSON.parse(readFileSync('drand-rounds.json','utf8')).rounds[1].signature; // a genuine signature of another round
 // A tampered signature, a signature of another round or malformed coordinates and lengths: no beacon epoch.
 assert.throws(replay(a => ({signature: flipByte(a.signature, 5)})), /Invalid beacon signature/);
 assert.throws(replay(a => ({signature: flipByte(a.signature, 40)})), /Invalid beacon signature/);
 assert.throws(replay(() => ({signature: otherSignature})), /Invalid beacon signature/);
 assert.throws(replay(() => ({signature: '0x' + 'ff'.repeat(64)})), /Invalid beacon signature/);
 assert.throws(replay(() => ({signature: '0x' + '00'.repeat(64)})), /Invalid beacon signature/);
 assert.throws(replay(a => ({signature: hexlify(getBytes(a.signature).slice(0, 63))})), /Invalid beacon signature/);
 assert.throws(replay(a => ({signature: a.signature + '00'})), /Invalid beacon signature/);
 // A wrong round: the data no longer matches the scheduled time, or matches it but is not what the signature signs.
 assert.throws(replay(() => ({data: sdk.encodeBeaconRound(round + 1n)})), /attestation time/);
 assert.throws(replay(() => ({data: sdk.encodeBeaconRound(round + 1n), timestamp: sdk.beaconRoundTime(registration, round + 1n)})), /Invalid beacon signature/);
 assert.throws(replay(() => ({data: sdk.encodeBeaconRound(round - 1n), timestamp: sdk.beaconRoundTime(registration, round - 1n)})), /Invalid beacon signature/);
 for (const data of ['0x30', utf8('0' + round), utf8(`${round}0`.repeat(3)), utf8(`${round}.0`), '0x']) assert.throws(replay(() => ({data})), /Invalid exact epoch data/);
 assert.throws(replay(a => ({timestamp: a.timestamp - 3n})), /attestation time/);
 // A wrong slot signer: the catalog must list the identity this registration derives.
 assert.throws(replayCatalog(catalog => ({...catalog, signers: ['0x' + '11'.repeat(20)]})), /Wrong epoch signer/);
 assert.throws(replayCatalog(catalog => ({...catalog, signers: [getAddress('0x' + '00'.repeat(19) + '01')]})), /Wrong epoch signer/);
 // A missing registration: without it the recipe reads as a signed one and fails closed, and a missing recipe is unknown.
 assert.throws(replayCatalog(withBeacon(undefined)), /65-byte/);
 assert.throws(replayCatalog(catalog => ({...catalog, recipeBook: {}})), /Unknown epoch recipe 11/);
 assert.throws(replayCatalog(catalog => ({...catalog, recipeBook: undefined})), /Unknown epoch recipe 11/);
 // A registration that is not the registered one: another key, another schedule, another chain or no verifier.
 assert.throws(replayCatalog(withBeacon({...registration, publicKey: g2Generator})), /Invalid beacon signature/);
 assert.throws(replayCatalog(withBeacon({...registration, genesis: registration.genesis + 3n})), /attestation time/);
 assert.throws(replayCatalog(withBeacon({...registration, period: registration.period + 1n})), /attestation time/);
 assert.throws(replayCatalog(withBeacon({...registration, chainHash: '0x' + '22'.repeat(32)})), /chain hash/);
 assert.throws(replayCatalog(withBeacon({...registration, verifier: ZeroAddress})), /Invalid beacon registration/);
 assert.throws(replayCatalog(withBeacon({...registration, publicKey: '0x' + '00'.repeat(127)})), /Invalid beacon registration/);
 assert.throws(replayCatalog(catalog => ({...catalog, recipeBook: {11: {...recipe, template: epoch.BUILTIN_EPOCH_RECIPES[2].template}}})), /one round number/);
 // The same checks through replayCoordinator.
 assert.throws(() => sdk.replayCoordinator({...f, epoch: withAttestation(f, a => ({signature: flipByte(a.signature, 5)}))}), /Invalid beacon signature/);
 assert.throws(() => sdk.replayCoordinator({...f, epoch: withCatalog(f, withBeacon(undefined))}), /65-byte/);
 assert.throws(() => sdk.replayCoordinator({...f, context: {...f.context, epochId: f.context.epochId + 1n}}));
 assert.throws(() => sdk.replayCoordinator({...f, context: {...f.context, epochHash: '0x' + '00'.repeat(32)}}));
 assert.throws(() => sdk.replayCoordinator({...f, context: {...f.context, targetBlock: f.context.targetBlock - 1n}}));
}
// Both networks registered the same beacon, so its registration and the catalog's signer are the same. The first Arc Mainnet drand
// epoch served a raw word asked for before its publication (request 40) and a d20 roll asked for after it (request 41).
assert.deepEqual(mainnetBeacon[0].epoch.catalog.recipeBook[11], testnetBeacon[0].epoch.catalog.recipeBook[11]);
assert.deepEqual(mainnetBeacon[0].epoch.catalog.signers, testnetBeacon[0].epoch.catalog.signers);
const [rawRequest, rollRequest] = mainnetBeacon;
assert.deepEqual([rawRequest.context.requestId, rollRequest.context.requestId], [40n, 41n]);
assert.deepEqual(rawRequest.context.mapping, sdk.builtins.raw());
assert.deepEqual(rollRequest.context.mapping, sdk.builtins.d20());
assert.equal(rawRequest.context.targetBlock, rawRequest.epoch.record.committedBlock + 1n);
assert.equal(rollRequest.context.targetBlock, rollRequest.context.requestBlock);
assert.deepEqual(sdk.replayCoordinator(rawRequest).map.values, [BigInt(rawRequest.recorded.randomness)]);
assert.deepEqual(sdk.replayCoordinator(rollRequest).map.values, [11n]);
// Drand rounds fetched from four public relays, with hash-to-curve points computed by another library (see the file's own source field).
const drand = JSON.parse(readFileSync('drand-rounds.json','utf8')), evmnetKey = '0x' + drand.info.public_key;
assert.deepEqual({chainHash: '0x' + drand.info.hash, publicKey: evmnetKey, genesis: BigInt(drand.info.genesis_time), period: BigInt(drand.info.period)},
 {chainHash: sdk.DRAND_EVMNET.chainHash, publicKey: sdk.DRAND_EVMNET.publicKey, genesis: sdk.DRAND_EVMNET.genesis, period: sdk.DRAND_EVMNET.period});
assert.equal(drand.info.schemeID, 'bls-bn254-unchained-on-g1');
for (const {round, signature, randomness} of drand.rounds) {
 const point = drand.messagePoints.points.find(candidate => candidate.round === round);
 assert.deepEqual(sdk.beaconRoundMessage(BigInt(round)), {x: BigInt(point.x), y: BigInt(point.y)});
 assert.equal(createHash('sha256').update(Buffer.from(signature, 'hex')).digest('hex'), randomness); // drand's randomness is the hash of the signature
 assert(sdk.verifyBeaconRound(evmnetKey, BigInt(round), '0x' + signature));
 assert(!sdk.verifyBeaconRound(evmnetKey, BigInt(round) + 1n, '0x' + signature));
 assert(!sdk.verifyBeaconRound(evmnetKey, BigInt(round), '0x' + drand.rounds.find(candidate => candidate.round !== round).signature));
 assert.equal(sdk.beaconRoundTime(sdk.DRAND_EVMNET, BigInt(round)), sdk.DRAND_EVMNET.genesis + BigInt(round - 1) * sdk.DRAND_EVMNET.period);
}
// Malformed input is false, not an exception; out-of-range rounds and keys are refused.
const [{signature: drandSignature}] = drand.rounds;
for (const [key, round, signature] of [[evmnetKey.slice(0, -2), 1n, '0x' + drandSignature], ['0x', 1n, '0x' + drandSignature], [evmnetKey, 1n, '0x' + drandSignature.slice(2)], [evmnetKey, 1n, '0x'],
 [evmnetKey, 2n ** 64n, '0x' + drandSignature], [evmnetKey, -1n, '0x' + drandSignature], [evmnetKey, 1n, '0x' + 'ff'.repeat(64)], ['0x' + 'ff'.repeat(128), 1n, '0x' + drandSignature]]) assert.equal(sdk.verifyBeaconRound(key, round, signature), false);
assert.throws(() => sdk.beaconRoundMessage(2n ** 64n));
assert.throws(() => sdk.beaconRoundTime(sdk.DRAND_EVMNET, 0n));
assert.equal(sdk.beaconRoundAt(sdk.DRAND_EVMNET, sdk.DRAND_EVMNET.genesis - 1n), 0n);
assert.equal(sdk.beaconRoundAt(sdk.DRAND_EVMNET, sdk.DRAND_EVMNET.genesis), 1n);
assert.equal(sdk.beaconRoundAt(sdk.DRAND_EVMNET, sdk.DRAND_EVMNET.genesis + 5n), 2n);
assert.equal(sdk.decodeBeaconRound(utf8('21072526')), 21072526n);
for (const bad of ['0x', '0x30', utf8('007'), utf8('1'.repeat(20)), utf8('1.5'), utf8(' 1')]) assert.throws(() => sdk.decodeBeaconRound(bad), /Invalid beacon round data/);
assert.throws(() => sdk.encodeBeaconRound(0n));
assert.throws(() => sdk.beaconCanonicalRequest('0x1234'));
// readEpochRecipes reads getRecipe, asks for beaconOf only for a recipe that names drand, and reads as of the block tag it is given.
const REGISTRY = '0xD20Da00B47A7cD2211dC4683E306913b05903756';
const registryReader = (book, seen) => ({async call(tx) {
 assert.equal(tx.to, REGISTRY);
 const call = registry.parseTransaction({data: tx.data}), id = Number(call.args[0]), entry = book[id];
 seen.push([call.name, id, tx.blockTag]);
 if (call.name === 'getRecipe') return registry.encodeFunctionResult('getRecipe', [keccak256(toUtf8Bytes(entry.canonicalRequest)), entry.canonicalRequest, entry.template, entry.body]);
 assert.equal(call.name, 'beaconOf');
 const b = entry.beacon;
 return registry.encodeFunctionResult('beaconOf', [b ? [b.verifier, b.genesis, b.period, b.chainHash, b.publicKey] : [ZeroAddress, 0n, 0n, ZeroHash, '0x']]);
}});
const seen = [], beaconBook = beaconFixtures[0].epoch.catalog.recipeBook;
assert.deepEqual(await epoch.readEpochRecipes(registryReader(beaconBook, seen), REGISTRY, [11], {blockTag: 64713483}), beaconBook);
assert.deepEqual(seen, [['getRecipe', 11, 64713483], ['beaconOf', 11, 64713483]]);
seen.length = 0;
assert.deepEqual(await epoch.readEpochRecipes(registryReader(beaconBook, seen), REGISTRY, [11]), beaconBook);
assert.deepEqual(seen, [['getRecipe', 11, undefined], ['beaconOf', 11, undefined]]);
seen.length = 0;
const signedBook = signedFixtures[0].epoch.catalog.recipeBook;
assert.deepEqual(await epoch.readEpochRecipes(registryReader(signedBook, seen), REGISTRY, Object.keys(signedBook).map(Number), {blockTag: 'latest'}), signedBook);
assert(seen.length === Object.keys(signedBook).length && seen.every(([name, , blockTag]) => name === 'getRecipe' && blockTag === 'latest'));
// A recipe read from the registry that is not what registerBeacon appends for its registration is refused.
assert.throws(() => epoch.validateEpochRecipe({...beaconBook[11], beacon: {...beaconBook[11].beacon, chainHash: '0x' + '33'.repeat(32)}}), /chain hash/);
assert.throws(() => epoch.validateEpochRecipe({...beaconBook[11], body: '["drand"]'}), /chain hash/);
const mapped = sdk.mapRandomness(result.reveal.randomness,sdk.builtins.d20());
assert(mapped.length===1 && mapped[0]>=1n && mapped[0]<=20n);
const bundle = await build({stdin:{contents:"export * from '@d20dao/vrf-sdk'; export * from '@d20dao/vrf-sdk/abi';",resolveDir:process.cwd(),sourcefile:'public-entry.js'},bundle:true,platform:'browser',format:'esm',target:'es2022',write:false,metafile:true});
const forbidden = Object.keys(bundle.metafile.inputs).filter(p=>/(^|\/)(keeper|test|secrets)(\/|$)|node:/.test(p.replaceAll('\\','/')));
assert.deepEqual(forbidden,[]);
// BN254 setup (tens of milliseconds to evaluate) is read only inside the functions that verify a round or hash to the curve, never at
// module scope, so a bundle that reaches none of them carries none of it; a bundle that verifies carries it.
const bytesFrom = (result, pattern) => Object.entries(Object.values(result.metafile.outputs)[0].inputs).filter(([path]) => pattern.test(path.replaceAll('\\','/'))).reduce((sum, [, input]) => sum + input.bytesInOutput, 0);
const bundleOf = names => build({stdin:{contents:`export { ${names} } from '@d20dao/vrf-sdk';`,resolveDir:process.cwd(),sourcefile:'entry.js'},bundle:true,platform:'browser',format:'esm',target:'es2022',write:false,metafile:true});
const bn254Code = /@noble\/curves\/esm\/(?:bn254|abstract\/(?:bls|tower))\.js/;
for (const names of ['quoteRequestFee, builtins, mapRandomness', 'beaconRoundAt, beaconRoundTime, beaconCanonicalRequest, encodeBeaconRound, DRAND_EVMNET']) assert.equal(bytesFrom(await bundleOf(names), bn254Code), 0, names);
for (const names of ['verifyBeaconRound', 'beaconRoundMessage', 'replayCoordinator']) assert(bytesFrom(await bundleOf(names), bn254Code) > 0, names);
assert(bytesFrom(bundle, bn254Code) > 0);
const browser = await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
for (const f of fixtures) assert.deepEqual(browser.replayCoordinator(f),sdk.replayCoordinator(f));
for (const {fixtures: recorded} of Object.values(liveSets)) for (const [, f] of recorded) assert.deepEqual(browser.replayCoordinator(f),sdk.replayCoordinator(f));
assert.deepEqual(browser.coordinatorAbi,coordinatorAbi);
assert.deepEqual(browser.epochEntropyAbi,epochEntropyAbi);
assert.deepEqual(browser.beaconVerifierAbi,beaconVerifierAbi);
assert.deepEqual(browser.decodeEvidencePacket(packet).proof,canonicalProof(fixture.vrfProof));
// Off-chain fee quoting against a mock provider (no network): header base fee in, quoteFeeAt at the actual and buffered base fee out.
const gwei = 10n**9n, pricing = { minFee: 8n*10n**16n, multiplier: 5n, overhead: 300_000n }, coordinatorAddress = '0x000000000000000000000000000000000000d20d';
const quoteAt = (gas, base) => { const dynamic = pricing.multiplier*base*(pricing.overhead+gas); return dynamic > pricing.minFee ? dynamic : pricing.minFee; };
const calls = [];
const mockProvider = (baseFeePerGas, number = 123) => ({
 async getBlock(tag) { calls.push(['getBlock', tag]); return { number, baseFeePerGas }; },
 async call(tx) {
  assert.equal(tx.to, coordinatorAddress);
  const [gas, base] = iface.decodeFunctionData('quoteFeeAt', tx.data); // decodes only if the helper sends the canonical selector/encoding
  calls.push(['call', gas, base]);
  return iface.encodeFunctionResult('quoteFeeAt', [quoteAt(gas, base)]);
 },
});
const high = await sdk.quoteRequestFee(mockProvider(176n*gwei), coordinatorAddress, 100_000);
assert.equal(high.fee, 5n*176n*gwei*400_000n); // 0.352 USDC at 176 gwei with 100k callback gas
assert.equal(high.baseFee, 176n*gwei); assert.equal(high.bufferBps, 3000n); assert.equal(high.bufferedBaseFee, 176n*gwei*13n/10n);
assert.equal(high.value, 5n*(176n*gwei*13n/10n)*400_000n); assert(high.value > high.fee); assert.equal(high.blockNumber, 123);
assert.deepEqual(calls, [['getBlock','latest'],['call',100_000n,176n*gwei],['call',100_000n,176n*gwei*13n/10n]]);
const low = await sdk.quoteRequestFee(mockProvider(20n*gwei), coordinatorAddress, 100_000n);
assert.equal(low.fee, pricing.minFee); assert.equal(low.value, pricing.minFee); // the minimum dominates: nothing extra is sent
calls.length = 0;
const custom = await sdk.quoteRequestFee(mockProvider(176n*gwei), coordinatorAddress, 100_000, { bufferBps: 0, blockTag: 'pending' });
assert.equal(custom.value, custom.fee); assert.equal(custom.bufferBps, 0n); assert.deepEqual(calls[0], ['getBlock','pending']);
assert.deepEqual(await browser.quoteRequestFee(mockProvider(176n*gwei), coordinatorAddress, 100_000), high);
assert.equal(sdk.DEFAULT_FEE_BUFFER_BPS, 3000n);
await assert.rejects(sdk.quoteRequestFee({ async getBlock() { return { number: 1, baseFeePerGas: null }; }, async call() { throw new Error('unreachable'); } }, coordinatorAddress, 100_000), /baseFeePerGas/);
await assert.rejects(sdk.quoteRequestFee({ async getBlock() { return { number: 1, baseFeePerGas: 1n }; }, async call() { return '0x'; } }, coordinatorAddress, 100_000), /no data/);
await assert.rejects(sdk.quoteRequestFee(mockProvider(1n), coordinatorAddress, 2n**32n), /uint32/);
await assert.rejects(sdk.quoteRequestFee(mockProvider(1n), coordinatorAddress, 100_000, { bufferBps: -1 }), /negative/);
// The three shipped examples compile exactly as an integrator gets them: from the installed package, with no
// local copy of the protocol sources and no OpenZeppelin.
const exampleNames = ['DiceConsumer', 'RaffleConsumer', 'LootDropConsumer'];
const exampleSources = Object.fromEntries(exampleNames.map(name => [`${name}.sol`, {content: readFileSync(`${name}.sol`,'utf8')}]));
const input={language:'Solidity',sources:{...exampleSources,
 'RequestsImport.sol':{content:'pragma solidity 0.8.28; import "@d20dao/vrf-sdk/contracts/libraries/D20VRFRequests.sol";'}},settings:{optimizer:{enabled:true,runs:200},evmVersion:'cancun',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}};
const compiled=JSON.parse(solc.compile(JSON.stringify(input),{import:p=>{try{if(!p.startsWith('@d20dao/vrf-sdk/')||p.includes('..'))throw new Error('unexpected import');return {contents:readFileSync(resolve('node_modules',p),'utf8')};}catch(e){return {error:e.message};}}}));
assert.deepEqual((compiled.errors??[]).filter(e=>e.severity==='error'),[]);
assert(compiled.contracts['@d20dao/vrf-sdk/contracts/libraries/D20VRFRequests.sol'].D20VRFRequests);
const examples = Object.fromEntries(exampleNames.map(name => {
 const artifact = compiled.contracts[`${name}.sol`][name];
 assert(artifact.evm.bytecode.object.length>0, `${name} produced no bytecode`);
 const abi = new Interface(artifact.abi);
 // Every example inherits the authenticated callback hooks and rejects callbacks it did not ask for.
 assert(abi.getFunction('rawFulfillRandomness') && abi.getFunction('onRefund'), name);
 assert(abi.getError('OnlyCoordinator') && abi.getError('InvalidCoordinator'), name);
 assert(abi.deploy.inputs.length===1 && abi.deploy.inputs[0].type==='address', `${name} takes the coordinator proxy`);
 return [name, abi];
}));
// Each example's entry point is payable: a request is always paid for in the transaction that makes it.
for (const [name, fn] of [['DiceConsumer','roll'],['RaffleConsumer','draw'],['LootDropConsumer','open']]) {
 assert.equal(examples[name].getFunction(fn).payable, true, `${name}.${fn}`);
 assert(examples[name].getError('UnexpectedCallback'), name);
}
assert(examples.DiceConsumer.getError('Underpaid'), 'DiceConsumer checks the quote before paying it');
assert.equal(examples.RaffleConsumer.getFunction('winner').stateMutability, 'view');
assert.equal(examples.LootDropConsumer.getFunction('tierOf').stateMutability, 'view');
// Exercise the outcomes the examples publish, using accepted words from the replay fixtures and the same
// mapping the coordinator applies on chain. A word is read, never re-drawn: mapping it twice must agree.
const lootWeights = [600, 250, 130, 20], totalWeight = lootWeights.reduce((a,b)=>a+b,0);
const tierOf = draw => { let cursor = 0; for (let i = 0; i + 1 < lootWeights.length; ++i) { cursor += lootWeights[i]; if (draw <= cursor) return i; } return lootWeights.length - 1; };
// Weights are adjacent ranges over the draw, and every boundary lands in exactly one tier.
assert.deepEqual([1,600,601,850,851,980,981,1000].map(tierOf), [0,0,1,1,2,2,3,3]);
for (const f of fixtures) {
 const accepted = f.recorded.randomness;
 const [face] = sdk.mapRandomness(accepted, sdk.builtins.d20()); // DiceConsumer.result
 assert(face >= 1n && face <= 20n, 'd20 face out of range');
 const entrants = 7, [index] = sdk.mapRandomness(accepted, sdk.builtins.chooseOne(entrants)); // RaffleConsumer.winner
 assert(index >= 0n && index < BigInt(entrants), 'winner index outside the frozen list');
 const [draw] = sdk.mapRandomness(accepted, sdk.builtins.numberRange(1n, BigInt(totalWeight))); // LootDropConsumer.tierOf
 assert(draw >= 1n && draw <= BigInt(totalWeight), 'loot draw outside the weight range');
 assert(tierOf(Number(draw)) < lootWeights.length, 'every draw names a tier');
 assert.deepEqual(sdk.mapRandomness(accepted, sdk.builtins.d20()), [face], 'the same word must always map to the same result');
}
const consumer=new Interface(compiled.contracts['@d20dao/vrf-sdk/contracts/interfaces/ID20VRF.sol'].ID20VRF.abi);
assert(consumer.getFunction('quoteFee') && consumer.getFunction('quoteFeeAt') && !consumer.hasFunction('requestFee'));
consumer.forEachFunction(fragment=>{
 const coordinator=iface.getFunction(fragment.format('sighash'));assert(coordinator);
 assert.equal(coordinator.selector,fragment.selector);assert.equal(coordinator.stateMutability,fragment.stateMutability);
 assert.deepEqual(coordinator.outputs.map(p=>p.format('sighash')),fragment.outputs.map(p=>p.format('sighash')));
});
console.log(fixtureProvenance.sourceMode+' recipe fixture coverage: '+coveredRecipes.join(', ')+'; legacy ANU evidence: '+legacyFixtures.length+' fixtures');
console.log('Real Arc replay: '+Object.entries(liveSets).map(([set, {fixtures: recorded}]) => set+' '+recorded.length+' (recipes '+recipesOf(liveSets[set]).join(', ')+')').join('; ')+'; drand rounds verified: '+drand.rounds.length+'.');
console.log('Examples compiled from the installed package and exercised: '+exampleNames.join(', ')+'.');
console.log('Current epoch/VRF replay, ABI, off-chain fee quoting, strict TypeScript, browser-target bundle ('+bundle.outputFiles[0].contents.length+' bytes) and Solidity checks passed.');
