import { AbiCoder, getBytes, keccak256 } from "ethers";
import type { VRFProof, XY } from "./verification.ts";
import type { ApiAttestation } from "./sources.ts";
import { EVIDENCE_PACKET_MAX_BYTES } from "./compact-catalog.ts";

const types = ["uint16",
  "tuple(uint256[2] pk,uint256[2] gamma,uint256 c,uint256 s,uint256 seed,address uWitness,uint256[2] cGammaWitness,uint256[2] sHashWitness,uint256 zInv)",
  "tuple(uint256 timestamp,bytes data,bytes signature)"];
const abi = AbiCoder.defaultAbiCoder();

export function encodeEvidencePacket(proof: VRFProof, apiProof: ApiAttestation): string {
  const packet = abi.encode(types,[1,proof,apiProof]);
  if(getBytes(packet).length > EVIDENCE_PACKET_MAX_BYTES) throw new Error("Evidence packet exceeds 1024 bytes");
  return packet;
}

/// Decoding is not verification. Feed these values to replayCoordinator with trusted chain context.
export function decodeEvidencePacket(packet: string): {version:1; proof:VRFProof; apiProof:ApiAttestation} {
  if(getBytes(packet).length > EVIDENCE_PACKET_MAX_BYTES) throw new Error("Evidence packet exceeds 1024 bytes");
  const [version,p,a]=abi.decode(types,packet);
  if(version!==1n) throw new Error("Unsupported evidence packet version");
  const pair=(value:readonly bigint[]):XY=>[value[0],value[1]];
  const proof:VRFProof={pk:pair(p.pk),gamma:pair(p.gamma),c:p.c,s:p.s,seed:p.seed,uWitness:p.uWitness,
    cGammaWitness:pair(p.cGammaWitness),sHashWitness:pair(p.sHashWitness),zInv:p.zInv};
  const apiProof:ApiAttestation={timestamp:a.timestamp,data:a.data,signature:a.signature};
  if(keccak256(encodeEvidencePacket(proof,apiProof))!==keccak256(packet)) throw new Error("Non-canonical evidence packet");
  return {version:1,proof,apiProof};
}
