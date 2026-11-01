import type {CombatRecoveryCoordinator} from './CombatRecoveryCoordinator.ts';
import type {MovementCoordinator} from './MovementCoordinator.ts';
import type {LootSceneCoordinator} from './LootSceneCoordinator.ts';
type CommandFactory=(command:'scene.suspend'|'scene.resumePrepare'|'scene.ready',payload:Record<string,unknown>)=>unknown|Promise<unknown>;
/** Engine-independent owner. Host supplies its authenticated control sequence and existing login route. */
export class CombatLifecycleAdapter {
 private phase:'active'|'paused'|'recovering'|'terminal'|'destroyed'='active';
 private hidden=false;
 private recoveryStartedAt:number|null=null;private now:()=>number;
 private generation=0;private task:Promise<void>|null=null;
 private recovery:CombatRecoveryCoordinator;private movement:MovementCoordinator;private loot:LootSceneCoordinator;
 private command:CommandFactory;private clearInput:()=>void;private login:()=>void;
 constructor(recovery:CombatRecoveryCoordinator,movement:MovementCoordinator,loot:LootSceneCoordinator,command:CommandFactory,clearInput:()=>void,login:()=>void,now:()=>number=()=>Date.now()){this.now=now;this.recovery=recovery;this.movement=movement;this.loot=loot;this.command=command;this.clearInput=clearInput;this.login=login;}
 get state(){if((this.phase==='paused'||this.phase==='recovering')&&this.recoveryStartedAt!==null&&this.now()-this.recoveryStartedAt>=10000){++this.generation;this.phase='terminal';this.freeze();}const m=this.movement.state,active=this.phase==='active'&&m.predictionEnabled;return {phase:this.phase,message:this.phase==='terminal'?'网络中断，请重新进入游戏':this.phase==='paused'||this.phase==='recovering'?'正在恢复战斗状态':'',canMove:active&&this.loot.canMove,canAttack:active&&m.confirmed?.lifeState==='alive'&&m.confirmed?.result==='active',canAdvanceDeathTail:active&&this.loot.canAdvanceDeathTail};}
 private freeze(){this.recoveryStartedAt??=this.now();this.clearInput();this.loot.setRecoveryBlocked(true);this.recovery.freeze();}
 private run(task:(generation:number)=>Promise<void>){if(this.phase==='destroyed'||this.phase==='terminal')return Promise.resolve();if(this.task)return this.task;const generation=this.generation;const pending=task(generation).catch(error=>{if(generation===this.generation&&this.phase!=='destroyed'){this.phase=['DEADLINE_EXPIRED','SCENE_CLOSED','SESSION_REVOKED','CHALLENGE_TERMINAL'].includes(error instanceof Error?error.message:'')?'terminal':'recovering';}}).finally(()=>{if(this.task===pending)this.task=null;});this.task=pending;return pending;}
 hide(){if(this.phase==='destroyed'||this.phase==='terminal')return Promise.resolve();this.hidden=true;this.clearInput();if(this.phase!=='active')return this.task??Promise.resolve();this.freeze();this.phase='paused';return this.run(async generation=>{const s=this.movement.state.confirmed;if(!s)return;const command=await this.command('scene.suspend',{sceneEpoch:s.sceneEpoch,timelineEpoch:s.timelineEpoch});if(generation!==this.generation)return;await this.recovery.suspend(command);if(generation===this.generation)this.checkTerminal();});}
 pause(){return this.hide();}
 async show(){this.hidden=false;if(this.task)await this.task;return this.resume();}
 resume(){void this.state;this.hidden=false;if(this.phase==='active'||this.phase==='terminal'||this.phase==='destroyed')return Promise.resolve();return this.run(async generation=>{this.phase='recovering';await this.recover(generation);});}
 retry(){if(this.phase==='active'){this.phase='recovering';this.freeze();}return this.resume();}
 private async recover(generation:number){
  if(this.recovery.state.status==='unknown'||this.recovery.state.status==='recovering')await this.recovery.retry();
  if(this.recovery.state.status==='failed'){if(this.checkTerminal())return;await this.recovery.reconcileRejectedControl();}
  if(generation!==this.generation||this.checkTerminal())return;
  let s=this.recovery.state;
  if(!s.data?.readyTicket&&!s.predictionEnabled){const current=s.data?.state??this.movement.state.confirmed;if(!current||'kind' in current)throw Error('NO_ACTIVE_SCENE');const command=await this.command('scene.resumePrepare',{sceneEpoch:current.sceneEpoch,timelineEpoch:current.timelineEpoch,checkpointRevision:current.checkpointRevision});if(generation!==this.generation)return;await this.recovery.prepare(command);}
  if(generation!==this.generation||this.checkTerminal())return;
  s=this.recovery.state;if(s.status==='unknown'||s.status==='failed')return;
  if(s.data?.readyTicket&&!s.predictionEnabled){const {deadline,...ticket}=s.data.readyTicket;const command=await this.command('scene.ready',ticket);if(generation!==this.generation)return;await this.recovery.ready(command);}
  if(generation!==this.generation||this.checkTerminal())return;
  if(this.recovery.state.predictionEnabled){if(this.hidden){this.phase='paused';this.freeze();}else{this.clearInput();this.loot.setRecoveryBlocked(false);this.phase='active';this.recoveryStartedAt=null;}}
 }
 private checkTerminal(){const s=this.recovery.state,scene=s.data?.state;const closed=scene&&('kind' in scene?false:scene.roomPhase==='closed');if(closed||['DEADLINE_EXPIRED','SCENE_CLOSED','CHALLENGE_TERMINAL','RECOVERY_EXPIRED','CHALLENGE_CLOSED','SESSION_EXPIRED','SESSION_REPLACED','ROLE_PLAY_EPOCH_MISMATCH','DEATH_EXPIRED'].includes(s.code??'')){++this.generation;this.phase='terminal';this.freeze();return true;}return false;}
 reenter(){if(this.phase!=='terminal')return;this.destroy();this.login();}
 destroy(){++this.generation;this.phase='destroyed';this.clearInput();this.loot.setRecoveryBlocked(true);this.recovery.close();}
}
