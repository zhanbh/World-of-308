import {MovementCoordinator} from './MovementCoordinator.ts';
import {DropCoordinator} from './DropCoordinator.ts';
import {TerminalCoordinator} from './TerminalCoordinator.ts';
import {LootVictoryHUDModel} from '../LootVictoryHUDModel.ts';
import type {EntryTransport,EntryPendingStore} from './ChallengeEntryCoordinator.ts';
import type {TerminalIdentity} from './TerminalCoordinator.ts';
/** Shared transport/persistence and one interaction lane prevent stale scene writes. */
export class LootSceneCoordinator {
 readonly movement:MovementCoordinator;
 readonly drops:DropCoordinator;
 readonly terminal:TerminalCoordinator;
 readonly hud=new LootVictoryHUDModel();
 private working=false;
 private sequence=0;
 private activeTask:Promise<void>|null=null;
 private interactionPending=false;
 private disposed=false;
 private run(task:()=>Promise<void>):Promise<void>{
  this.working=true;const result=task().finally(()=>{this.working=false;if(this.activeTask===result)this.activeTask=null;});this.activeTask=result;return result;
 }
 private async interaction(task:()=>Promise<void>){
  if(this.interactionPending||this.disposed)throw Error('INTERACTION_PENDING');this.interactionPending=true;
  try{if(this.activeTask)await this.activeTask;if(this.disposed)throw Error('SCENE_CLOSED');
   if(this.movement.hasPending)await this.retry();
   if(this.movement.hasPending)throw Error('SIMULATION_RESULT_UNKNOWN');
   if(this.movement.state.queued>0){await this.run(async()=>{await this.movement.flushQueued(this.nextOperation('flush'));if(!this.disposed&&!this.movement.hasPending){await this.drops.refresh();if(!this.disposed)await this.terminal.refresh();}this.sync();});}
   if(this.disposed||this.movement.hasPending)throw Error('SIMULATION_RESULT_UNKNOWN');
   if(this.drops.state.status==='unknown')await this.retry();
   if(this.disposed)throw Error('SCENE_CLOSED');await task();
  }finally{this.interactionPending=false;}
 }
 requestCollect(operationId:string,dropId:string){return this.interaction(()=>this.collect(operationId,dropId));}
 requestLeave(operationId:string){return this.interaction(()=>this.leave(operationId));}
 close(){this.disposed=true;this.movement.close();this.drops.close();this.terminal.close();}
 private identity:TerminalIdentity;
 constructor(movement:MovementCoordinator,transport:EntryTransport,persistence:EntryPendingStore,identity:TerminalIdentity){this.movement=movement;this.drops=new DropCoordinator(transport,persistence);this.terminal=new TerminalCoordinator(transport,persistence);this.identity=identity;}
 get busy(){return this.working||this.movement.hasPending||['unknown','submitting'].includes(this.drops.state.status)||['unknown','submitting'].includes(this.terminal.state.status);}
 get canMove(){return !this.disposed&&!this.interactionPending&&!this.busy&&this.terminal.state.status!=='closed';}
 async open(){return this.run(async()=>{await this.drops.open({...this.identity,sceneEpoch:this.movement.state.confirmed!.sceneEpoch});if(this.disposed)return;await this.terminal.open(this.identity);this.sync();});}
 sync(){if(this.disposed)return;this.hud.sync(this.drops.state,this.terminal.state.receipt,this.movement.confirmedPickupPosition);if(this.terminal.state.fadeReady)this.hud.beginFade();}
 update(dt:number){this.sync();this.hud.update(dt);}
 async submit(operationId:string,toTick:number){if(this.disposed||this.busy||this.terminal.state.status==='closed')return;return this.run(async()=>{await this.movement.submit(operationId,toTick);if(!this.disposed&&!this.movement.hasPending){await this.drops.refresh();if(!this.disposed)await this.terminal.refresh();}this.sync();});}
 async collect(operationId:string,dropId:string){if(this.disposed||this.busy||this.movement.state.queued>0||this.terminal.state.status==='closed')throw Error('PICKUP_NOT_READY');return this.run(async()=>{await this.drops.refresh();if(this.disposed)throw Error('SCENE_CLOSED');const found=this.drops.state.view?.data.drops.find(d=>d.dropId===dropId&&!d.collected),p=this.movement.confirmedPickupPosition;if(!found||!p||(BigInt(p.x)-BigInt(found.x))**2n+(BigInt(p.y)-BigInt(found.y))**2n>32000n**2n)throw Error('PICKUP_OUT_OF_RANGE');await this.drops.collect(operationId,dropId);this.sync();});}
 async leave(operationId:string){if(this.disposed||this.busy||this.movement.state.queued>0)throw Error('LEAVE_NOT_READY');return this.run(async()=>{await this.terminal.leave(operationId,{movement:this.movement.hasPending,drop:['unknown','submitting'].includes(this.drops.state.status)});this.sync();});}
 async retry(){if(this.working||this.disposed)return;return this.run(async()=>{
  if(this.movement.state.status==='unknown')await this.movement.retry();
  else if(this.movement.state.status==='error'&&this.movement.hasPending)await this.movement.reconcileRejected();
  else if(['frozen','stale','error'].includes(this.movement.state.status))await this.movement.refreshConfirmed();
  if(this.drops.state.status==='unknown')await this.drops.retry();
  if(this.terminal.state.status==='unknown')await this.terminal.retry();
  if(!this.disposed&&!this.movement.hasPending){await this.drops.refresh();if(!this.disposed)await this.terminal.refresh();}this.sync();
 });}
 nextOperation(prefix:string){return `${prefix}-${Date.now().toString(36)}-${++this.sequence}-${Math.random().toString(36).slice(2,10)}`;}
}
