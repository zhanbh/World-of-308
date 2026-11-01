import {CombatRecoveryCoordinator} from './CombatRecoveryCoordinator.ts';
import {CombatLifecycleAdapter} from './CombatLifecycleAdapter.ts';
import { MovementCoordinator } from './MovementCoordinator.ts';
import { LootSceneCoordinator } from './LootSceneCoordinator.ts';
import { LoadingCoordinator } from './LoadingCoordinator.ts';
import type { EntryPendingStore } from './ChallengeEntryCoordinator.ts';

export interface ChallengePreviewResult {
    coordinator: MovementCoordinator;
    challengeId: string;
    characterId: string;
    loot: LootSceneCoordinator;
    mode: string;
    lifecycle: (clearInput:()=>void,reenter:()=>void)=>CombatLifecycleAdapter;
}

/** Explicit browser-only opt-in; production login supplies its own coordinator/transport. */
export async function connectChallengePreview(port = 8790): Promise<ChallengePreviewResult> {
    if (typeof window === 'undefined' || !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
        throw new Error('LOCAL_PREVIEW_NOT_ENABLED');
    }
    const post = async (path: string, text: string): Promise<string> => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
            const response = await fetch(`http://127.0.0.1:${port}${path}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: text,
                signal: controller.signal
            });
            if (!response.ok) throw new Error('CHALLENGE_PREVIEW_UNAVAILABLE');
            return await response.text();
        } finally {
            clearTimeout(timeout);
        }
    };

    const bootstrapText = await post('/bootstrap', '{}');
    const bootstrap = JSON.parse(bootstrapText) as {
        previewInstanceId: string;
        mode?: string;
        authorization?: string;
        activeRoomNo?: number;
        identity: { sessionId: string; sessionEpoch: number; characterId: string };
        context: { protocolVersion: 2; sessionId: string; sessionEpoch: number; characterId: string; rolePlayEpoch: number; challengeId: string };
        config: any;
        prepareCommand: any;
        recoveryResourceCommand?: any;
        basic: any;
        controlSeq?: number;
        serverTime: number;
    };

    if (!bootstrap || typeof bootstrap.previewInstanceId !== 'string' || !bootstrap.context || !bootstrap.config) {
        throw new Error('INVALID_CHALLENGE_PREVIEW_BOOTSTRAP');
    }

    const pending: EntryPendingStore = {
        load: (key: string) => window.localStorage.getItem(`world308:challenge:${bootstrap.previewInstanceId}:${key}`),
        save: (key: string, value: string | null) => {
            if (value === null) window.localStorage.removeItem(`world308:challenge:${bootstrap.previewInstanceId}:${key}`);
            else window.localStorage.setItem(`world308:challenge:${bootstrap.previewInstanceId}:${key}`, value);
        }
    };

    let controlSeq=bootstrap.controlSeq??0;
    const transport = {
        send: async (text: string) => {
            const reply=await post('/rpc',text),q=JSON.parse(text),r=JSON.parse(reply);
            if(q.command?.startsWith('scene.')&&q.command!=='scene.status'&&r.outcome?.status==='committed')controlSeq=Math.max(controlSeq,q.controlSeq);
            return reply;
        },
        queryOriginalControl: (text:string)=>post('/original-control',text)
    };

    const loading = new LoadingCoordinator(transport, pending, {
        load: async (ref: string, releaseRef: string) => {
            const res = await post('/rpc', JSON.stringify({ query: 'resource.resolve', ref, releaseRef }));
            return Uint8Array.from(JSON.parse(res));
        }
    });

    if(bootstrap.mode!=='local-test-terminal')await loading.prepare(bootstrap.prepareCommand);
    else {
        if(bootstrap.authorization!=='isolated-local-assets-only'||bootstrap.activeRoomNo!==6)throw Error('INVALID_LOOT_PREVIEW');
        if(!bootstrap.recoveryResourceCommand)throw Error('RECOVERY_RESOURCES_REQUIRED');
        await loading.prepare(bootstrap.recoveryResourceCommand);
    }

    const receivedAt=Date.now();
    const clock = { now: () => bootstrap.serverTime+Date.now()-receivedAt };
    const coordinator = new MovementCoordinator(transport, pending, clock);
    if(bootstrap.mode==='local-test-terminal')await coordinator.resumeActive(bootstrap.context,bootstrap.config,bootstrap.activeRoomNo!,bootstrap.basic);
    else await coordinator.load(bootstrap.context, bootstrap.config, loading, bootstrap.basic);
    if(coordinator.state.status!=='active')throw Error(coordinator.state.code??'PREVIEW_NOT_ACTIVE');
    const loot=new LootSceneCoordinator(coordinator,transport,pending,bootstrap.context);
    await loot.open();

    return {
        lifecycle: (clearInput,reenter)=>{
            const recovery=new CombatRecoveryCoordinator(transport,pending,coordinator,loading,[loot.drops,loot.terminal]);
            // Initialization freezes the owner. The adapter begins in recovery and verifies current state before accepting input.
            recovery.init(bootstrap.context,bootstrap.config,bootstrap.activeRoomNo??0,bootstrap.basic);
            const command=async (command:'scene.suspend'|'scene.resumePrepare'|'scene.ready',payload:Record<string,unknown>)=>{
                const base={protocolVersion:2,sessionId:bootstrap.context.sessionId,sessionEpoch:bootstrap.context.sessionEpoch,controlSeq:controlSeq+1,leaseRevision:0,payload:{characterId:bootstrap.context.characterId,rolePlayEpoch:bootstrap.context.rolePlayEpoch,challengeId:bootstrap.context.challengeId}};
                const status=JSON.parse(await transport.send(JSON.stringify({...base,command:'scene.status',payload:{...base.payload,readyTicketId:null}})));
                if(status.outcome.status!=='committed')throw Error(status.outcome.code);
                return {...base,command,leaseRevision:status.leaseRevision,payload:{...base.payload,...payload}};
            };
            const adapter=new CombatLifecycleAdapter(recovery,coordinator,loot,command,clearInput,reenter);
            void adapter.retry();return adapter;
        },
        coordinator,
        loot,
        mode: bootstrap.mode??'no-rewards',
        challengeId: bootstrap.context.challengeId,
        characterId: bootstrap.context.characterId
    };
}
