import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceMonsterSimulation} from '../src/monster-simulation.ts';
import {bossArgs} from '../../backend/test/fixtures/boss-kernel-fixture.mjs';
test('terminal boss death derives remaining kills and rejects later hostile damage',async()=>{
 const a=await bossArgs({bossX:1,bossHp:'1'});a.terminalBossId='boss_0';a.inputs=[{seq:1,tick:0,kind:'basic',pressed:true}];a.basicConfig=structuredClone(a.basicConfig);a.basicConfig.stages[0].impactUs=20000;
 const extra={...structuredClone(a.targets[0]),actorId:'extra',actorIndex:2,hp:'999999',maxHp:'999999',x:100000};a.targets.push(extra);a.monsters.push({...structuredClone(a.monsters[0]),actorId:'extra',actorIndex:2,identity:'ordinary'});
 const r=advanceMonsterSimulation({...a,toTick:30});assert.equal(r.terminal.bossActorId,'boss_0');assert.deepEqual(r.terminal.derivedKills,['extra']);assert.ok(r.targets.every(t=>t.hp==='0'&&t.lifeState==='dead'));assert.ok(r.monsters.every(m=>m.action===null&&m.tactics.effects.length===0));assert.equal(r.player.lifeState,'alive');assert.equal(r.events.some(e=>e.targetId===a.context.actorId&&e.tick>2),false);
});


test('same-boundary mutual kill records death before free revive without changing paid count',async()=>{
 const a=await bossArgs({bossX:1,bossHp:'1'});a.terminalBossId='boss_0';a.player.hp='1';a.player.deathIndex=4;a.monsterConfig=structuredClone(a.monsterConfig);a.monsterConfig.templates.boss_0.skillRef='slash';a.monsterConfig.templates.boss_0.skillRefs=['slash'];a.monsterConfig.skills.slash={kind:'melee',windupTicks:2,recoveryTicks:5,cooldownTicks:50,rangeX:500000,rangeY:500000,speed:1000,coefficient:{n:'1',d:'1'},staggerTicks:3};a.basicConfig=structuredClone(a.basicConfig);a.basicConfig.stages[0].impactUs=20000;a.inputs=[{seq:1,tick:0,kind:'basic',pressed:true}];const r=advanceMonsterSimulation({...a,toTick:20});assert.equal(r.terminal.playerDied,true);assert.equal(r.terminal.playerDeathAtTick,2);assert.equal(r.player.deathIndex,5);assert.equal(r.player.hp,r.player.maxHp);assert.equal(r.player.lifeState,'alive');assert.ok(r.events.some(e=>e.kind==='death'&&e.targetId===a.context.actorId));assert.equal(r.events.some(e=>e.kind==='damage'&&e.targetId===a.context.actorId&&e.tick>2),false);
});

test('already released bleed kills boss after player death and records free-revive source',async()=>{
 const a=await bossArgs({bossX:1});a.inputs=[{seq:1,tick:0,kind:'skill',skillId:'cross'}];const first=advanceMonsterSimulation({...a,toTick:12});assert.ok(first.cross.effects.some(e=>e.kind==='bleed'));first.targets[0].hp='1';const r=advanceMonsterSimulation({...a,...first,basic:first.state,inputs:[],fromTick:12,toTick:30,terminalBossId:'boss_0',player:{...first.player,hp:'0',lifeState:'dead',deathIndex:1,deathAtTick:12},stats:{...a.stats,mp:first.mp}});assert.equal(r.terminal.bossActorId,'boss_0');assert.equal(r.terminal.playerDied,true);assert.equal(r.terminal.playerDeathAtTick,12);assert.equal(r.player.lifeState,'alive');assert.equal(r.player.hp,r.player.maxHp);
});
