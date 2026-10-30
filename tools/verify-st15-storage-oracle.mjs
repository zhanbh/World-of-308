import {execFileSync} from 'node:child_process';
import {writeFileSync,unlinkSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {jointTerminalFixture,meteredService} from '../backend/test/fixtures/joint-terminal-fixture.mjs';
const baseline='8cbbda3';
const file=new URL('../backend/src/challenge/st15-storage-oracle.tmp.ts',import.meta.url);
const source=execFileSync('git',['show',`${baseline}:backend/src/challenge/challenge-service.ts`],{encoding:'utf8'});
// Oracle only: remove exactly the two budget guards, preserving all old computation,
// authentication, versions, old schema1 writes, transaction and public query code.
const removed=source.split('\n').filter(line=>line.includes('if(terminalFact)requireValue(resultPages.length<=33')||line.includes('const checkTerminalBudget=()=>'));
assert.equal(removed.length,2);
const patched=source.split('\n').map(line=>line===removed[0]?'':line===removed[1]?'                const checkTerminalBudget=()=>{};':line).join('\n');
console.log(JSON.stringify({baseline,sourceSHA256:createHash('sha256').update(source).digest('hex'),removedLines:removed,replacement:'const checkTerminalBudget=()=>{};'}));
async function results(h,service,operationId){
 const events=[];let total=1;
 for(let pageIndex=0;pageIndex<total;pageIndex++){
  const p=await service.query({...h.auth,query:'simulation.actionResults',requestId:'oracle',payload:{operationId,pageIndex}});
  assert.ok(Buffer.byteLength(JSON.stringify(p))<=32768);assert.ok(p.events.length<=32);total=p.totalPages;events.push(...p.events);
 }
 return {events,total};
}
try{
 writeFileSync(file,patched);
 const {ChallengeService:Oracle}=await import(file.href);
 for(const due of [true,'mixed']){
 const old=await jointTerminalFixture({due}),oldService=new Oracle({store:old.store,clock:old.clock,identity:old.identity,content:old.content}),oldCommand=await old.command();
 assert.equal((await oldService.execute(oldCommand)).outcome.status,'committed');
 const expected=await results(old,oldService,oldCommand.operationId);
 const h=await jointTerminalFixture({due}),{service,attempts}=meteredService(h),q=await h.command();h.store.injectResponseLoss();
 assert.equal((await service.execute(q)).outcome.status,'unknown');const before=h.store.snapshot();
 assert.equal((await service.execute(q)).replayed,true);assert.deepEqual(h.store.snapshot(),before);
 const actual=await results(h,service,q.operationId);assert.deepEqual(actual,expected);
 console.log(JSON.stringify({due,fixture:'jointTerminalFixture synthetic allocated CP capacity; not natural reachability',events:actual.events.length,pages:actual.total,eventSHA256:createHash('sha256').update(JSON.stringify(actual.events)).digest('hex'),attempts:attempts.filter(a=>a.W>0).map(({readKeys,writeKeys,...m})=>m),packs:[...h.store.snapshot().values()].filter(p=>p.schemaVersion===2&&p.packed).map(p=>({pages:p.totalPages,firstPage:p.pageIndex,bytes:Buffer.byteLength(JSON.stringify(p))}))}));
 }
}finally{unlinkSync(file);}
