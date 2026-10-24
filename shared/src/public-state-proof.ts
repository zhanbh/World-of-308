import {assembleRecoveryPages} from './protocol/scene-v2.ts';
import type {RecoveryPage} from './protocol/scene-v2.ts';
import {canonicalResource,resourceDigest} from './room-manifest.ts';
/** SHA-256 of the complete ordered public record array; keys are recursively sorted.
 * Page boundaries and transport metadata do not change the baseline proof. */
export async function publicStateDigest(records:RecoveryPage['records']):Promise<string>{
 return resourceDigest(new TextEncoder().encode(canonicalResource(records)));
}
export async function verifyRecoveryPages(values:unknown[]):Promise<ReturnType<typeof assembleRecoveryPages>>{
 const baseline=assembleRecoveryPages(values);
 if(await publicStateDigest(baseline.records)!==baseline.publicStateHash)throw new TypeError('PUBLIC_STATE_HASH_MISMATCH');
 return baseline;
}
