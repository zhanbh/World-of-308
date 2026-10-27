import {verifyTestRelease, publicRelease} from '../../../shared/src/config/release-v1.ts';
import {canonicalResource, manifestDigest, resourceDigest} from '../../../shared/src/room-manifest.ts';
import {parseRoomManifest} from '../../../shared/src/protocol/scene-v2.ts';
import {buildEncounterRoomSpawns, validateSpawnGeometry} from '../../../shared/src/encounter-layout.ts';
import type {ChallengeContent, EntryChallenge} from './challenge-model.ts';
/** Immutable resolver for the explicitly authorized E01 contract fixture. No latest fallback. */
export async function contractResources(content:ChallengeContent, releaseRef:string) {
 if(content.releaseRef!==releaseRef || content.profile!=='local-test' || content.purpose!=='contract-fixture-only' || !content.release) throw new TypeError('CONFIG_NOT_READY');
 const release=await verifyTestRelease(JSON.stringify(content.release),{profileId:content.release.profileId,environmentScope:'local-test',allowTestStrategies:true});
 if(release.releaseId!==releaseRef) throw new TypeError('CONFIG_NOT_READY');
 const resources=new Map<string,Uint8Array>();
 for(const node of publicRelease(release).nodes) resources.set(`${node.id}@${node.version}`,new TextEncoder().encode(canonicalResource(node)));
 return {release,resources};
}
export async function buildPrepareManifest(content:ChallengeContent,h:EntryChallenge,roomNo:number,attemptId:string,revision:number) {
 const {release,resources}=await contractResources(content,h.releaseRef);
 const dungeon=release.nodes.find(n=>`${n.id}@${n.version}`===h.monsterStatsRef && n.kind==='dungeon');
 if(!dungeon || h.playerLevel!==1 || h.monsterLevel!==1 || h.difficultyId!=='normal') throw new TypeError('CONFIG_NOT_READY');
 const rooms=dungeon.data.rooms as {roomNo:number;mapRef:{id:string;version:number};spawns:{monsterRef:{id:string;version:number};role:'ordinary'|'elite'|'boss'}[]}[];
 const room=rooms[roomNo];if(!room || room.roomNo!==roomNo) throw new TypeError('CONFIG_NOT_READY');
 const spawns:{spawnId:string;templateRef:string;role:'ordinary'|'elite'|'boss'|'purple';x:number;y:number}[] = content.encounterLayout
  ? buildEncounterRoomSpawns(roomNo, h.purpleEncounter?.roomNo ?? null, `${room.spawns[0].monsterRef.id}@${room.spawns[0].monsterRef.version}`, h.purpleEncounter?.templateRef)
  : room.spawns.map((s,i)=>({spawnId:`spawn-${i}`,templateRef:`${s.monsterRef.id}@${s.monsterRef.version}`,role:s.role,x:2000+i*1000,y:1000}));
 if(!content.encounterLayout && h.purpleEncounter?.roomNo===roomNo) spawns.push({spawnId:h.purpleEncounter.spawnId,templateRef:h.purpleEncounter.templateRef,role:'purple',x:7000,y:1000});
 const mapNode = release.nodes.find(n=>n.kind==='map'&&`${n.id}@${n.version}`===`${room.mapRef.id}@${room.mapRef.version}`);
 if(mapNode && content.encounterLayout) {
  validateSpawnGeometry(spawns, mapNode.data.bounds as any, mapNode.data.entrance as any, mapNode.data.exit as any);
 }
 const descriptors=[];
 for(const [ref,bytes] of resources) descriptors.push({ref,sha256:await resourceDigest(bytes),byteLength:bytes.length,mediaType:'application/json',purpose:'contract-fixture-only'});
 descriptors.sort((a,b)=>a.ref.localeCompare(b.ref));
 const body={roomAttemptId:attemptId,challengeId:h.id,roomNo,releaseRef:h.releaseRef,releaseHash:release.manifestHash,mapRef:`${room.mapRef.id}@${room.mapRef.version}`,resources:descriptors,spawns,preparedRevision:revision};
 if(!resources.has(body.mapRef)||spawns.some(s=>!resources.has(s.templateRef)))throw new TypeError('CONFIG_NOT_READY');
 return parseRoomManifest({...body,manifestHash:await manifestDigest(body)});
}
