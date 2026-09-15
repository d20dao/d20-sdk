import { AbiCoder, id, keccak256 } from "ethers";
import { hashMapping, mapRandomness } from "./mapping.ts";
import { selectSource, sourceConfigurationHash, verifyApiAttestation, type ApiAttestation } from "./sources.ts";
import { deriveRequestSeed, hashPublicKey, hashProof, verifyVRFProof, type RequestContext, type VRFProof, type XY } from "./verification.ts";

export function transcriptHash(context: RequestContext, attestationHash: string, proofHash: string, randomness: string): string {
  return keccak256(AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "uint256", "address", "uint256", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32"],
    [id("VRF_ARCDAO_TRANSCRIPT_V1"), context.chainId, context.coordinator, context.requestId, context.sourceConfigurationHash,
      context.blockHash, context.apiRequestHash, context.apiDataHash, attestationHash, proofHash, randomness, hashMapping(context.mapping)]
  ));
}

/// Replays public coordinator computations. Chain inclusion/timestamps must come from independently trusted chain data.
export function replayCoordinator(input: {
  context: RequestContext; requestedAt: bigint; deadline: bigint; acceptanceTimestamp: bigint;
  publicKey: XY; sourceSigners: readonly string[]; apiProof: ApiAttestation; vrfProof: VRFProof;
  enabledSourceMask?: number;
  recorded: { fulfilled: boolean; randomness: string; apiDataHash: string; proofHash: string; transcriptHash: string };
}) {
  const c = input.context;
  if (hashPublicKey(input.publicKey) !== c.keyHash) throw new Error("Public key commitment mismatch");
  if (sourceConfigurationHash(input.sourceSigners, input.enabledSourceMask ?? 7) !== c.sourceConfigurationHash) throw new Error("Source configuration mismatch");
  if (input.deadline !== input.requestedAt + 60n || input.acceptanceTimestamp < input.requestedAt || input.acceptanceTimestamp > input.deadline)
    throw new Error("Invalid acceptance deadline");
  const selected = selectSource(c.requestId, c.blockHash, input.requestedAt, input.sourceSigners, input.enabledSourceMask ?? 7);
  if (selected.requestHash !== c.apiRequestHash) throw new Error("Source/query/projection mismatch");
  const api = verifyApiAttestation(selected, input.apiProof, input.requestedAt, input.deadline, input.acceptanceTimestamp);
  if (api.dataHash !== c.apiDataHash) throw new Error("API data commitment mismatch");
  const seed = deriveRequestSeed(c);
  const vrf = verifyVRFProof(input.vrfProof, input.publicKey, seed);
  if (!vrf.valid) throw new Error(vrf.reason);
  const proofHash = hashProof(input.vrfProof);
  const transcript = transcriptHash(c, api.attestationHash, proofHash, vrf.randomness);
  const recorded = input.recorded;
  if (!recorded.fulfilled || recorded.randomness !== vrf.randomness || recorded.apiDataHash !== api.dataHash ||
      recorded.proofHash !== proofHash || recorded.transcriptHash !== transcript) throw new Error("Recorded coordinator state mismatch");
  return {
    request: { source: selected.source, airnode: selected.airnode, canonicalRequest: selected.canonicalRequest, requestHash: selected.requestHash, seed },
    reveal: { apiSigner: api.signer, dataHash: api.dataHash, attestationHash: api.attestationHash, randomness: vrf.randomness },
    map: { values: mapRandomness(vrf.randomness, c.mapping), mappingHash: hashMapping(c.mapping) },
    proof: { proofHash, transcriptHash: transcript, matchesRecordedState: true },
  };
}
