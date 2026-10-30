import {parseRecoveryPage} from '../../../../shared/src/protocol/scene-v2.ts';
import type {SceneState} from '../../../../shared/src/protocol/scene-v2.ts';
import {encodeSceneMessage,decodeSceneReply} from '../../../../shared/src/protocol/scene-wire.ts';
import {verifyRecoveryPages} from '../../../../shared/src/public-state-proof.ts';
import type {EntryTransport,EntryIdentity} from './ChallengeEntryCoordinator.ts';
export type ProofBinding=Pick<SceneState,'sceneEpoch'|'timelineEpoch'|'checkpointRevision'|'publicStateHash'|'manifestHash'>&{readyTicketId:string;deadline?:number};
export function sameProofState(a:SceneState,b:SceneState):boolean{
 return a.challengeId===b.challengeId&&a.sceneEpoch===b.sceneEpoch&&a.timelineEpoch===b.timelineEpoch&&a.checkpointRevision===b.checkpointRevision&&a.publicStateHash===b.publicStateHash&&a.manifestHash===b.manifestHash&&b.connection==='connected'&&((b.roomPhase==='active'&&b.result==='active')||(b.roomPhase==='cleared'&&b.result==='completed'&&b.lifeState==='alive'));
}
/** Every response must match the requested bounded snapshot before another page is requested. */
export async function fetchRecoveryProof(transport:EntryTransport,identity:EntryIdentity&{challengeId:string},ticket:ProofBinding,prefix:string,current:()=>boolean):Promise<unknown[]|null>{
 const pages:unknown[]=[];let total=1;const {deadline,...binding}=ticket;let issuedDeadline=deadline;
 for(let n=0;n<total;n++){
  const q={protocolVersion:2,query:'scene.recoveryPage',requestId:`${prefix.slice(0,60)}-${n}`,sessionId:identity.sessionId,sessionEpoch:identity.sessionEpoch,payload:{characterId:identity.characterId,rolePlayEpoch:identity.rolePlayEpoch,challengeId:identity.challengeId,...binding,pageIndex:n}};
  const text=await transport.send(encodeSceneMessage(q));if(!current())return null;decodeSceneReply(q,text);const page=parseRecoveryPage(JSON.parse(text));
  if(page.pageIndex!==n||(n>0&&page.totalPages!==total))throw Error('INCOMPLETE_RECOVERY');
  if(issuedDeadline===undefined)issuedDeadline=page.deadline;
  if(page.deadline!==issuedDeadline||page.serverTime>=page.deadline)throw Error('TICKET_PROOF_MISMATCH');
  for(const [key,value] of Object.entries(binding))if(page[key as keyof typeof page]!==value)throw Error('TICKET_PROOF_MISMATCH');
  total=page.totalPages;pages.push(page);
 }
 const proof=await verifyRecoveryPages(pages);if(!current())return null;
 for(const [key,value] of Object.entries({...binding,deadline:issuedDeadline}))if(proof[key as keyof typeof proof]!==value)throw Error('TICKET_PROOF_MISMATCH');
 return pages;
}
