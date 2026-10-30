import {RecoveryCoordinator} from './RecoveryCoordinator.ts';
import type {RecoveryTransport,RecoveryState} from './RecoveryCoordinator.ts';
import type {EntryPendingStore,EntryIdentity} from './ChallengeEntryCoordinator.ts';
import type {LoadingCoordinator} from './LoadingCoordinator.ts';
import type {MovementCoordinator,BasicPrediction} from './MovementCoordinator.ts';
import type {MovementConfig} from '../../../../shared/src/movement-kernel.ts';

type Context=EntryIdentity&{protocolVersion:2;challengeId:string};
/** Owns the handoff from frozen controls to a freshly verified movement model. */
export class CombatRecoveryCoordinator {
 private recovery:RecoveryCoordinator;
 private movement:MovementCoordinator;private loading:LoadingCoordinator;
 private context:Context|null=null;private config:MovementConfig|null=null;private roomNo=0;private basic:BasicPrediction|undefined;private generation=0;
 private handoff=false;
 constructor(transport:RecoveryTransport,persistence:EntryPendingStore,movement:MovementCoordinator,loading:LoadingCoordinator){this.recovery=new RecoveryCoordinator(transport,persistence);this.movement=movement;this.loading=loading;}
 get state():RecoveryState {const s=this.recovery.state;return {...s,predictionEnabled:s.predictionEnabled&&this.handoff&&this.movement.state.predictionEnabled,status:s.status==='active'&&!this.handoff?'recovering':s.status};}
 init(context:Context,config:MovementConfig,roomNo:number,basic?:BasicPrediction){this.freeze();this.context=structuredClone(context);this.config=structuredClone(config);this.roomNo=roomNo;this.basic=basic;this.recovery.init(context);}
 freeze(){++this.generation;this.handoff=false;this.movement.close();}
 async suspend(command:unknown){this.freeze();await this.recovery.control(command);}
 async prepare(command:unknown){this.freeze();const generation=this.generation;await this.recovery.control(command);if(generation!==this.generation)return;if(this.recovery.state.status!=='recovering')return;this.recovery.useLoadedResources(this.loading);await this.recovery.fetchPages('combat-recovery');}
 async ready(command:unknown){const generation=this.generation;await this.recovery.control(command);await this.restoreMovement(generation);}
 async retry(){const generation=this.generation;if(this.recovery.pendingCommand==='scene.ready'){this.recovery.useLoadedResources(this.loading);await this.recovery.fetchPages('combat-retry');}await this.recovery.retry();if(this.recovery.state.data?.readyTicket&&this.recovery.state.status==='recovering'){this.recovery.useLoadedResources(this.loading);await this.recovery.fetchPages('combat-retry-prepared');}await this.restoreMovement(generation);}
 private async restoreMovement(generation:number){if(generation!==this.generation||!this.recovery.state.predictionEnabled)return;await this.movement.resumeActive(this.context!,this.config!,this.roomNo,this.basic);if(generation!==this.generation)return;this.handoff=this.movement.state.status==='active'&&this.movement.state.predictionEnabled;}
 close(){this.freeze();this.recovery.close();}
}
