// Uses TypeScript shipped with Creator; installs no dependencies.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const editor = process.argv[2];
if (!editor) throw new Error('Pass Creator installation directory as the first argument');
const ts = require(path.join(editor, 'resources/app.asar.unpacked/node_modules/typescript'));
for (const name of ['WarriorSkillAnimation.ts', 'WarriorSkillEffects.ts', 'WarriorAttackAnimation.ts', 'WarriorSpriteSheetView.ts', 'CombatModel.ts', 'EnemyModel.ts', 'WarriorView.ts', 'WarriorSkillsModel.ts', 'Prototype.ts']) {
    const file = path.join(__dirname, '../assets/scripts', name);
    const checked = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        fileName: file,
        reportDiagnostics: true,
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    });
    const errors = (checked.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error);
    assert.equal(errors.length, 0, `${name} should transpile without syntax errors: ${errors.map(item => item.messageText).join('; ')}`);
}
const cache = new Map();
function load(name) {
    if (cache.has(name)) return cache.get(name).exports;
    const file = path.join(__dirname, '../assets/scripts', name + '.ts');
    const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    });
    const mod = { exports: {} }; cache.set(name, mod);
    new Function('module', 'exports', 'require', compiled.outputText)(mod, mod.exports,
        dependency => load(dependency.replace('./', '')));
    return mod.exports;
}
const { CombatModel, tuning } = load('CombatModel');
const { basicAttacks, attackFrame } = load('WarriorAttackAnimation');
const advance = (m, duration, x = 0, y = 0) => {
    for (let i = 0; i < Math.round(duration * 1000); i++) m.update(0.001, x, y);
};
const m = new CombatModel();
m.press(); m.release(); advance(m, tuning.durations[0] + 0.01);
assert.equal(m.stage, -1, 'one tap must not complete the combo');
advance(m, 0.2); m.press(); m.release();
assert.equal(m.stage, 1, 'tap in window must advance');
advance(m, 1); m.press(); m.release();
assert.equal(m.stage, 0, 'tap after timeout must restart');
m.reset(); m.press(); m.release(); advance(m, tuning.durations[0] + 0.29);
m.press(); m.release(); assert.equal(m.stage, 1, '290ms after action end must continue');
m.reset(); m.press(); m.release(); advance(m, tuning.durations[0] + 0.31);
m.press(); m.release(); assert.equal(m.stage, 0, '310ms after action end must restart');
m.reset(); m.press(); m.release(); advance(m, .17); m.press(); m.release(); advance(m, .12);
assert.equal(m.stage, 1, 'late tap buffers one next stage');
advance(m, .31); assert.equal(m.stage, -1, 'buffer is consumed once');
m.reset(); m.press(); m.release(); advance(m, .02); m.press(); m.release(); advance(m, .27);
assert.equal(m.stage, -1, 'early released tap does not buffer');
const cycle=basicAttacks.reduce((sum,attack)=>sum+attack.duration,0);
assert.equal(cycle,1,'new baseline is one second per combo');
m.reset(); m.press(); advance(m,.59);assert.equal(m.stage,2);
advance(m,.40);assert.equal(m.stage,2,'finisher recovery must finish');
advance(m,.02);assert.equal(m.stage,0,'hold loops after 1000ms');
m.reset(); m.press(); advance(m,.59);m.release();
advance(m,.40);assert.equal(m.windowLeft,0);
advance(m,.02);assert.ok(m.windowLeft>.28,'window begins after recovery');
const hits = new CombatModel();hits.press();
let total=0;
for(let stage=0;stage<3;stage++){
 const contact=basicAttacks.slice(0,stage).reduce((sum,a)=>sum+a.duration,0)+basicAttacks[stage].impact;
 advance(hits,contact-total-.001);total=contact-.001;
 assert.equal(hits.impactId,stage);
 advance(hits,.002);total+=.002;assert.equal(hits.impactId,stage+1);
}
advance(hits,1-total-.001);assert.equal(hits.impactId,3,'one event per stage');
assert.equal(hits.takeHit(10), true); assert.equal(hits.stage, -1); assert.equal(hits.nextStage, 0);
assert.equal(hits.held, false, 'getting hit stops automatic continuation');
for (let stage = 0; stage < basicAttacks.length; stage++) {
    const action = basicAttacks[stage];
    action.times.forEach((time, i) => assert.equal(attackFrame(stage, time), action.frames[i]));
    assert.equal(attackFrame(stage, action.duration), action.frames[7]);
    assert.equal(attackFrame(stage, action.impact), stage * 8 + 3, 'contact selects contact art');
}
const target = new (load('EnemyModel').EnemyModel)(20, 0, 0);
target.hit(0); target.hit(0); target.hit(0);
assert.equal(target.hp, 0, 'separate combo contacts can hit an already stunned enemy');
m.reset(); assert.equal(m.nextStage, 0); assert.equal(m.held, false);
const a = new CombatModel(), b = new CombatModel();
advance(a, 0.5, 0.25, 0.3); advance(b, 0.5, 0.9, 0.9);
assert.equal(a.y, b.y, 'depth speed must ignore input magnitude and horizontal speed');
assert.ok(b.x > a.x, 'horizontal input magnitude must affect speed');
const c = new CombatModel(); advance(c, 0.5, 0, 1);
assert.equal(c.y, b.y, 'diagonal input must not reduce depth speed');
advance(c, 0.1, -1, 0); const facing = c.facing;
advance(c, 0.1, 0, 1); assert.equal(c.facing, facing, 'depth movement must retain facing');
console.log('PASS: tap, timeout, buffer, hold loop, reset, axis speeds, diagonal and facing');

const { WarriorSkillsModel, warriorSkillTuning } = load('WarriorSkillsModel');
const skills = new WarriorSkillsModel();
assert.equal(skills.cast('cross', 1), true, 'ready 十字斩 must cast');
assert.equal(skills.cast('badao', 1), false, 'only one skill can be active at a time');
assert.equal(skills.mana, 92, 'skill must spend shared prototype mana');
let crossImpacts = 0;
for (let i = 0; i < Math.ceil(warriorSkillTuning.cross.duration * 1000); i++) {
    skills.update(0.001);
    if (skills.lastImpact === 'cross') crossImpacts++;
}
assert.equal(crossImpacts, 1, '十字斩 resolves one impact event per cast');
assert.ok(skills.cooldown('cross') > 0, 'cast starts an independent cooldown');
assert.equal(skills.cast('cross', 1), false, 'cooldown blocks immediate recast');

skills.cancel();
skills.reset();
assert.equal(skills.cast('bengshan', 1), true, '崩山击 must cast');
let travel = 0, peakLift = 0, bengshanImpacts = 0;
for (let i = 0; i < Math.ceil(warriorSkillTuning.bengshan.duration * 1000); i++) {
    skills.update(0.001);
    travel += skills.motionDelta;
    peakLift = Math.max(peakLift, skills.jumpLift);
    if (skills.lastImpact === 'bengshan') bengshanImpacts++;
}
assert.ok(Math.abs(travel - 34) < 0.2, '崩山击 should use its short leap movement, not a generic dash');
assert.ok(peakLift > 20, '崩山击 should show a visible hop');
assert.equal(bengshanImpacts, 1, '崩山击 resolves one landing impact');

skills.reset();
assert.equal(skills.cast('badao', -1), true, '拔刀斩 must cast');
assert.equal(skills.facing, -1, '拔刀斩 keeps the facing captured at cast start');
assert.equal(skills.cast('earth', 1), false, 'ultimate cannot overlap an active skill');
for (let i = 0; i < Math.ceil(warriorSkillTuning.badao.duration * 1000); i++) skills.update(0.001);
assert.equal(skills.cast('earth', -1), true, '崩山裂地斩 must cast after the prior action ends');
let earthImpacts = 0, earthPeakLift = 0, liftAtImpact = -1;
for (let i = 0; i < Math.ceil(warriorSkillTuning.earth.duration * 1000); i++) {
    skills.update(0.001);
    earthPeakLift = Math.max(earthPeakLift, skills.jumpLift);
    if (skills.lastImpact === 'earth') { earthImpacts++; liftAtImpact = skills.jumpLift; }
}
assert.equal(earthImpacts, 1, 'ultimate resolves one large impact');
assert.ok(earthPeakLift > 45, 'ultimate has a clearly larger leap');
assert.ok(liftAtImpact < 0.5, 'ultimate should land at the impact moment');
assert.ok(warriorSkillTuning.earth.damage > warriorSkillTuning.cross.damage, 'ultimate has a stronger temporary damage value');
assert.equal(skills.mana, 44, 'all skills use the same temporary mana pool');
skills.reset();
assert.equal(skills.mana, skills.maxMana, 'encounter reset restores skill mana and cooldowns');
assert.equal(skills.ready('earth'), true, 'encounter reset restores ultimate readiness');
console.log('PASS: four warrior skills, shared mana, independent cooldowns, one impact, lunge/jump motion and reset');

const { skillAnimations, skillFrame, skillLift } = load('WarriorSkillAnimation');
const { WarriorSkillEffects } = load('WarriorSkillEffects');
assert.ok(Math.abs(skillAnimations.badao.chargeEnd - skillAnimations.badao.chargeStart - 0.2) < 1e-9,
    'draw slash holds the waist-coiled pose for 200ms');
for (const elapsed of [0.14, 0.20, 0.30, 0.339]) {
    assert.equal(skillFrame('badao', elapsed), 2, 'charge must visibly hold one coiled pose');
}
assert.equal(skillFrame('badao', 0.34), 3, 'draw slash releases its charge hold at 340ms');
for (const id of Object.keys(skillAnimations)) {
    const anim = skillAnimations[id];
    anim.times.forEach((time, index) => assert.equal(skillFrame(id, time), index));
    assert.equal(warriorSkillTuning[id].impactAt, anim.impactAt, 'body and damage share contact time');
    assert.equal(skillFrame(id, anim.impactAt), id === 'cross' || id === 'badao' ? 6 : 7);
    skills.reset(); skills.cast(id, 1);
    advance(skills, anim.impactAt - 0.01);
    assert.equal(skills.impactId, 0, 'no damage before contact');
    skills.cancel(); advance(skills, 3);
    assert.equal(skills.impactId, 0, 'interruption cannot create ghost contact');
    assert.equal(skills.jumpLift, 0, 'cancel clears visual height');
    skills.reset(); skills.cast(id, 1);
    skills.update(anim.duration + 1);
    assert.equal(skills.impactId, 1, 'large dt traversal still produces one contact');
    skills.reset(); skills.cast(id, 1);
    advance(skills, anim.moveAt - 0.01);
    assert.equal(skills.canMove, false, 'pre-recovery movement remains locked');
    advance(skills, 0.02);
    assert.equal(skills.canMove, true, 'movement opens at the configured recovery time');
}
assert.equal(skillLift('bengshan', 0.1), 0, 'small jump waits for takeoff');
assert.equal(skillLift('earth', 0.2), 0, 'ultimate stays grounded during anticipation');
const effects = new WarriorSkillEffects();
effects.impact('earth', 10, 20, -1);
effects.update(0.45); // Body action already ended at 1320ms, 440ms after impact.
assert.equal(effects.items.length, 1, 'ultimate eruption outlives the body action');
assert.equal(effects.items[0].x, 10); assert.equal(effects.items[0].y, 20);
assert.equal(effects.items[0].facing, -1, 'effect freezes its ground anchor and facing');
assert.ok(effects.items[0].age >= 0.4, 'delayed eruption begins after contact');
effects.update(1.08); assert.equal(effects.items.length, 0, 'residual expires after 2400ms total');
effects.impact('earth', 5, 8, 1); effects.clear(); effects.update(4);
assert.equal(effects.items.length, 0, 'room reset clears delayed eruption');
console.log('PASS: skill frame/contact alignment, takeoff, pre-impact interruption and persistent effect cleanup');

const { EnemyModel, enemyFeedbackTuning } = load('EnemyModel');
const { applyWarriorSkillHit } = load('WarriorSkillsModel');
const { skillEffectLifetimes } = load('WarriorSkillEffects');
const reviewPlayer = new CombatModel();
const advanceEnemy = (enemy, seconds) => {
    for (let i = 0; i < Math.round(seconds * 1000); i++) enemy.update(0.001, reviewPlayer, true);
};
for (const id of ['cross', 'badao']) {
    const enemy = new EnemyModel(40, 0, 0, 30);
    enemy.state = 'telegraph'; enemy.timer = 0.01;
    assert.equal(applyWarriorSkillHit(id, enemy, 0, 0, 1), true);
    assert.equal(enemy.state, 'stunned', 'flat slashes interrupt windup with a brief stun');
    assert.equal(enemy.bleedLeft, 5);
    const hp = enemy.hp;
    advanceEnemy(enemy, 0.29);
    assert.equal(enemy.state, 'approach');
    assert.ok(enemy.x > 40 && enemy.x < 50, 'flat slash knockback stays small');
    assert.equal(reviewPlayer.hp, 100, 'interrupted telegraph cannot still attack');
    assert.equal(enemy.hp, hp, 'bleed damage awaits numeric tuning; this build keeps visual-only bleeding');
}
const smallDown = new EnemyModel(40, 0, 0, 30);
applyWarriorSkillHit('bengshan', smallDown, 0, 0, 1);
assert.equal(smallDown.state, 'knockedDown');
advanceEnemy(smallDown, 0.79); assert.equal(smallDown.state, 'knockedDown');
advanceEnemy(smallDown, 0.02); assert.equal(smallDown.state, 'gettingUp');
advanceEnemy(smallDown, 0.25); assert.equal(smallDown.state, 'approach');
assert.ok(smallDown.bleedLeft > 3.9, 'bleed keeps ticking while down and getting up');

const largeDown = new EnemyModel(40, 0, 0, 30);
applyWarriorSkillHit('earth', largeDown, 0, 0, 1);
assert.equal(largeDown.timer, skillEffectLifetimes.earth);
assert.ok(Math.abs(skillAnimations.earth.impactAt + largeDown.timer - 2.4) < 1e-9,
    'ultimate recovery waits for all 2400ms of its animation, including residual');
advanceEnemy(largeDown, 0.4);
const downTime = largeDown.timer;
applyWarriorSkillHit('cross', largeDown, 0, 0, 1);
assert.equal(largeDown.state, 'knockedDown', 'a slash cannot pull a downed enemy upright');
assert.equal(largeDown.timer, downTime, 'stun cannot shorten the ultimate knockdown');
applyWarriorSkillHit('bengshan', largeDown, 0, 0, 1);
assert.equal(largeDown.timer, downTime, 'a shorter knockdown cannot shorten an existing one');
advanceEnemy(largeDown, 1.119); assert.equal(largeDown.state, 'knockedDown');
advanceEnemy(largeDown, 0.002); assert.equal(largeDown.state, 'gettingUp');

// The actual encounter updates hit enemies after spawning effects in each step.
const sceneTarget = new EnemyModel(40, 0, 0, 30), sceneEffects = new WarriorSkillEffects();
const sceneStep = 1 / 120;
applyWarriorSkillHit('earth', sceneTarget, 0, 0, 1);
sceneEffects.impact('earth', 0, 0, 1, sceneStep);
sceneTarget.update(sceneStep, reviewPlayer, true);
assert.ok(Math.abs(sceneTarget.timer - (sceneEffects.items[0].lifetime - sceneEffects.items[0].age)) < 1e-9,
    'encounter update order keeps remaining knockdown equal to remaining effect lifetime');

const bleeding = new EnemyModel(40, 0, 0, 30);
applyWarriorSkillHit('cross', bleeding, 0, 0, 1);
advanceEnemy(bleeding, 1);
const pulse = bleeding.bleedPulse;
applyWarriorSkillHit('badao', bleeding, 0, 0, 1);
assert.equal(bleeding.bleedLeft, 5, 'another bleeding skill refreshes to 5s, not 9s');
assert.equal(bleeding.bleedPulse, pulse, 'refresh does not restart the heartbeat animation');
advanceEnemy(bleeding, 4.999); assert.ok(bleeding.bleedLeft > 0);
advanceEnemy(bleeding, 0.002); assert.equal(bleeding.bleedLeft, 0); assert.equal(bleeding.bleedPulse, 0);
const pulseTarget = new EnemyModel(40, 0, 0, 30);
applyWarriorSkillHit('cross', pulseTarget, 0, 0, 1);
advanceEnemy(pulseTarget, 0.12); const pulse1 = pulseTarget.bleedPulse;
advanceEnemy(pulseTarget, 0.10); const valley = pulseTarget.bleedPulse;
advanceEnemy(pulseTarget, 0.08); const pulse2 = pulseTarget.bleedPulse;
assert.ok(pulse1 > valley && pulse2 > valley, 'bleeding has two soft heartbeat peaks');
const miss = new EnemyModel(300, 0, 0, 30);
assert.equal(applyWarriorSkillHit('cross', miss, 0, 0, 1), false);
assert.equal(miss.bleedLeft, 0); assert.equal(miss.state, 'approach');
const killed = new EnemyModel(40, 0, 0);
applyWarriorSkillHit('earth', killed, 0, 0, 1);
assert.equal(killed.state, 'dead', 'death takes precedence over knockdown');
assert.equal(killed.bleedLeft, 0); assert.equal(killed.bleedPulse, 0);
assert.equal(killed.timer, 0, 'dead enemies do not stand up later');
console.log('PASS: skill-specific stun/knockdown, ultimate recovery, 5s refresh-only bleeding, heartbeat and death/miss cleanup');

const { SkillHitLedger, enemyKnockdownPolicies } = load('EnemyModel');
const normal = new EnemyModel(0, 0, 100, 100);
const ledger = new SkillHitLedger();
ledger.hit(normal, 0, 0, 10);
ledger.hit(normal, 1, 0, 10);
assert.equal(normal.state, 'stunned');
assert.equal(ledger.hit(normal, 1, 0, 10), false, 'same stage cannot damage twice');
ledger.hit(normal, 2, 0, 10);
assert.equal(normal.state, 'knockedDown', '30 percent boundary includes equality');
advanceEnemy(normal, 2);
ledger.hit(normal, 3, 0, 1);
assert.equal(normal.state, 'stunned', 'one cast does not knock down twice');
new SkillHitLedger().hit(normal, 0, 0, 29);
assert.equal(normal.state, 'stunned', 'new cast does not inherit previous damage');
const elite = new EnemyModel(0, 0, 101, 100, enemyKnockdownPolicies.elite);
new SkillHitLedger().hit(elite, 0, 0, 20);
assert.equal(elite.state, 'knockedDown');
const boss = new EnemyModel(0, 0, 102, 100, enemyKnockdownPolicies.boss);
new SkillHitLedger().hit(boss, 0, 0, 40, 60, {knockdownFor: 2});
assert.equal(boss.state, 'stunned', 'immunity also blocks forced knockdown');
const other = new EnemyModel(0, 0, 103, 100);
ledger.hit(other, 0, 0, 10);
assert.equal(other.state, 'stunned', 'each target has its own total');
const dying = new EnemyModel(0, 0, 104, 10);
dying.hit(0, 1, 0, {knockdownFor: 1});
dying.hit(0, 9);
assert.equal(dying.downPose, 1, 'death preserves the downed silhouette');
assert.equal(dying.deathOpacity, 1);
advanceEnemy(dying, .18);
assert.equal(dying.deathWhite, 1);
assert.ok(dying.deathOpacity > .99);
advanceEnemy(dying, .33);
assert.equal(dying.deathOpacity, 0);
dying.hit(0, 1); assert.equal(dying.hp, 0);
console.log('PASS: per-cast/target/stage knockdown ledger, normal/elite boundaries, boss immunity and death fade');

// Exercise the same multi-hit runner used by Cocos and Canvas, including residuals.
for (const [id, count] of [['cross',2],['bengshan',3],['badao',1],['earth',4]]) {
    const runner = new WarriorSkillsModel(), victim = new EnemyModel(40,0,200,100);
    runner.cast(id,1);
    let contacts=0;
    for(let i=0;i<300;i++) {
        runner.update(.01); contacts+=runner.resolveHits([victim],0,0);
    }
    assert.equal(contacts,count,id+' has the specified number of distinct hits');
    assert.ok(Math.abs(victim.hp-(100-warriorSkillTuning[id].damage))<1e-8,'whole-cast damage is preserved');
}
const residual = new WarriorSkillsModel(), residualTarget = new EnemyModel(40,0,201,100);
residual.cast('earth',1);
for(let i=0;i<100;i++){residual.update(.01);residual.resolveHits([residualTarget],0,0);}
residual.cancel();
for(let i=0;i<150;i++){residual.update(.01);residual.resolveHits([residualTarget],-200,100);}
assert.ok(Math.abs(residualTarget.hp-97)<1e-8,'emitted ground phases keep frozen origin after cancellation');
const interrupted = new WarriorSkillsModel(), unhurt = new EnemyModel(40,0,202,100);
interrupted.cast('earth',1);interrupted.update(.5);interrupted.resolveHits([unhurt],0,0);interrupted.cancel();
interrupted.update(2);interrupted.resolveHits([unhurt],0,0);assert.equal(unhurt.hp,100,'pre-impact interruption emits nothing');
const flying = new WarriorSkillsModel(), farA = new EnemyModel(105,0,203,100), farB = new EnemyModel(105,0,204,100);
flying.cast('cross',1);
let flightHits=0;
for(let i=0;i<100;i++){flying.update(.01);flightHits+=flying.resolveHits([farA,farB],0,0);}
assert.equal(flightHits,2,'projectile reaches distant targets, pierces, and hits each once');
assert.equal(farA.hp,99.5);
const resetRunner = new WarriorSkillsModel(), resetTarget = new EnemyModel(40,0,205,100);
resetRunner.cast('earth',1);resetRunner.update(1);resetRunner.resolveHits([resetTarget],0,0);resetRunner.reset();
const resetHp=resetTarget.hp;resetRunner.update(2);resetRunner.resolveHits([resetTarget],0,0);assert.equal(resetTarget.hp,resetHp,'reset clears residual damage');
console.log('PASS: 2/3/1/4 phases, preserved damage, independent ground origin, interruption, piercing projectile and reset');

for(const dt of [1/120,1/60,1/30]) {
 for(const [id,count] of [['cross',2],['bengshan',3],['badao',1],['earth',4]]) {
    const runner=new WarriorSkillsModel(), moving=new EnemyModel(40,0,300,100);
    runner.cast(id,1);let x=0,contacts=0;
    for(let t=0;t<3;t+=dt){runner.update(dt);x+=runner.motionDelta;contacts+=runner.resolveHits([moving],x,0);moving.update(dt,reviewPlayer,true);}
    assert.equal(contacts,count,id+' retains all hits with knockback at dt='+dt);
 }
}
const fractionDeath = new EnemyModel(40,0,301,2), fractionalCast = new WarriorSkillsModel();
fractionalCast.cast('bengshan',1);
for(let i=0;i<100;i++){fractionalCast.update(.01);fractionalCast.resolveHits([fractionDeath],0,0);}
assert.equal(fractionDeath.hp,0,'fractional damage cannot leave a floating-point ghost alive');
assert.equal(fractionDeath.state,'dead');
console.log('PASS: moving/knockback targets at 30/60/120Hz and fractional lethal damage');

const { CombatFeedback, hitFeedbackTuning, hitSparkPixels } = load('EnemyModel');
const feedback = new CombatFeedback(), crowd = [0,1,2].map(id=>new EnemyModel(40,0,400+id,100));
feedback.observe(crowd);assert.equal(feedback.stopLeft,0,'misses/idle never freeze');
for(const target of crowd)target.hit(0);
feedback.observe(crowd);
assert.equal(feedback.stopLeft,hitFeedbackTuning.lightStop,'crowd hits coalesce instead of adding freeze');
assert.equal(feedback.sparks.length,3);
feedback.update(.01);const remaining=feedback.stopLeft;
feedback.observe(crowd);assert.equal(feedback.stopLeft,remaining,'same hit cannot retrigger every frame');
crowd[0].hit(0,1,0,{knockdownFor:.8});feedback.observe(crowd);
assert.equal(feedback.stopLeft,hitFeedbackTuning.heavyStop);
for(let i=0;i<30;i++)feedback.update(1/120);
assert.equal(feedback.stopLeft,0);assert.equal(feedback.sparks.length,0);
for(const block of hitSparkPixels(.05,true))assert.ok(Number.isInteger(block.x)&&Number.isInteger(block.y)&&Number.isInteger(block.size));
feedback.clear();feedback.observe(crowd.map((_,id)=>new EnemyModel(0,0,id,100)));assert.equal(feedback.stopLeft,0);
// Advance the encounter only when the presentation clock permits it.
const runnerFeedback=new CombatFeedback(), runnerSkill=new WarriorSkillsModel(), runnerEnemy=new EnemyModel(40,0,500,100);
runnerSkill.cast('earth',1);let realTime=0,contactCount=0;
while(realTime<3){const dt=1/120;realTime+=dt;if(runnerFeedback.update(dt))continue;
 runnerSkill.update(dt);contactCount+=runnerSkill.resolveHits([runnerEnemy],0,0);runnerEnemy.update(dt,reviewPlayer,true);runnerFeedback.observe([runnerEnemy]);}
assert.equal(contactCount,4,'hit-stop must not skip/duplicate ground damage stages');
assert.equal(runnerEnemy.state,'approach','ultimate get-up and effect clock resume together');
console.log('PASS: hit-stop coalescing, no idle retriggers, heavy/light timing, pixel sparks, cleanup and multi-hit integration');

const comparison = new CombatFeedback(), comparisonEnemy = new EnemyModel(40,0,600,100);
comparison.configure({hitStop:false,sparks:false});comparisonEnemy.hit(0);comparison.observe([comparisonEnemy]);
assert.equal(comparison.stopLeft,0);assert.equal(comparison.sparks.length,0);
comparison.configure({hitStop:true,sparks:true});comparison.observe([comparisonEnemy]);
assert.equal(comparison.stopLeft,0,'re-enabling cannot replay old damage');
comparisonEnemy.hit(0);comparison.observe([comparisonEnemy]);assert.ok(comparison.stopLeft>0);
comparison.configure({hitStop:false});assert.equal(comparison.stopLeft,0,'disabling releases an active freeze immediately');
assert.ok(comparison.sparks.length>0,'stop and sparks have independent switches');
comparison.configure({sparks:false});assert.equal(comparison.sparks.length,0);
comparison.clear();assert.equal(comparison.hitStopEnabled,false,'encounter reset preserves comparison settings');
console.log('PASS: independent feedback A/B controls, immediate release, no retroactive hits and reset retention');

const { damageText } = load('EnemyModel');
const eventTarget=new EnemyModel(0,0,700,10), numberFeedback=new CombatFeedback();
eventTarget.hit(0,1/3);eventTarget.hit(0,2/3);numberFeedback.observe([eventTarget]);
assert.equal(numberFeedback.numbers.length,2,'two hits in one simulation step remain separate popups');
assert.equal(numberFeedback.sparks.length,2,'same-step impacts keep both sparks');
assert.ok(Math.abs(numberFeedback.numbers.reduce((sum,n)=>sum+n.damage,0)-1)<1e-10);
numberFeedback.observe([eventTarget]);assert.equal(numberFeedback.numbers.length,2,'no duplicate popups');
assert.equal(damageText(2/3),'0.67');assert.equal(damageText(.001),'<0.01');
const overkill=new EnemyModel(0,0,701,1);overkill.hit(0,10);numberFeedback.observe([overkill]);
assert.equal(numberFeedback.numbers.at(-1).damage,1,'display actual HP removed, not nominal overkill');
for(let i=0;i<100;i++)numberFeedback.update(.01);
assert.equal(numberFeedback.numbers.length,0,'all numbers expire');
numberFeedback.configure({numbers:false});eventTarget.hit(0);numberFeedback.observe([eventTarget]);
assert.equal(numberFeedback.numbers.length,0);assert.ok(numberFeedback.sparks.length>0,'numbers can be disabled without hiding sparks');
for(let i=0;i<40;i++){eventTarget.hp=100;eventTarget.state='approach';eventTarget.hit(0);numberFeedback.observe([eventTarget]);}
assert.ok(numberFeedback.sparks.length<=24,'presentation has a bounded pool');assert.ok(eventTarget.hitEvents.length<=32);
numberFeedback.clear();assert.equal(numberFeedback.numbers.length,0);
console.log('PASS: per-hit damage popups, simultaneous events, overkill amount, formatting, bounded pools, independent toggle and cleanup');

const retained=new EnemyModel(0,0,800,100), retainedFeedback=new CombatFeedback();
retained.hit(0);retainedFeedback.observe([retained]);retainedFeedback.clear([retained]);retainedFeedback.observe([retained]);
assert.equal(retainedFeedback.numbers.length,0,'replaying with the same target must not replay its historical damage');
assert.equal(retainedFeedback.stopLeft,0);
retained.hit(0);retainedFeedback.observe([retained]);assert.equal(retainedFeedback.numbers.length,1);
console.log('PASS: retained preview targets do not replay old hit feedback after cast/reset');

const shakeFeedback=new CombatFeedback();
shakeFeedback.groundImpact('cross');assert.deepEqual(shakeFeedback.shakeOffset,{x:0,y:0},'ordinary slashes do not shake');
shakeFeedback.groundImpact('bengshan');assert.deepEqual(shakeFeedback.shakeOffset,{x:2,y:0});
shakeFeedback.groundImpact('earth');shakeFeedback.groundImpact('earth');
assert.equal(shakeFeedback.shakeOffset.x,3,'repeated impacts do not add unbounded amplitude');
for(let i=0;i<30;i++){
 const offset=shakeFeedback.shakeOffset;
 assert.ok(Number.isInteger(offset.x)&&Number.isInteger(offset.y));
 assert.ok(Math.abs(offset.x)<=3&&Math.abs(offset.y)<=2);
 shakeFeedback.update(1/120);
}
assert.deepEqual(shakeFeedback.shakeOffset,{x:0,y:0},'shake settles to exact origin');
shakeFeedback.groundImpact('earth');shakeFeedback.configure({shake:false});
assert.deepEqual(shakeFeedback.shakeOffset,{x:0,y:0});shakeFeedback.groundImpact('earth');
assert.deepEqual(shakeFeedback.shakeOffset,{x:0,y:0},'disabled shake ignores new ground impacts');
shakeFeedback.configure({shake:true});shakeFeedback.groundImpact('earth');shakeFeedback.clear();
assert.deepEqual(shakeFeedback.shakeOffset,{x:0,y:0},'reset clears all residual camera movement');
const shakeVictim=new EnemyModel(20,5,900,100), beforeGround={x:shakeVictim.x,y:shakeVictim.y,hp:shakeVictim.hp};
shakeFeedback.groundImpact('earth');shakeFeedback.update(.01);
assert.deepEqual({x:shakeVictim.x,y:shakeVictim.y,hp:shakeVictim.hp},beforeGround,'shake is presentation only');
console.log('PASS: ground-impact-only shake, bounded integer offsets, independent disable/reset and unchanged ground coordinates');

const { attackVisibleRect }=load('WarriorAttackAnimation');
for(let frame=0;frame<24;frame++){
 const crop=attackVisibleRect(frame);assert.equal(crop.left+crop.width,320);assert.equal(crop.height,320);
 const anchor=(160-crop.left)/crop.width;
 // Source foot at x=160 maps to local zero for both facings, without resizing the body.
 for(const facing of [-1,1])assert.ok(Math.abs(((160-crop.left)/320*58-anchor*(crop.width/320*58))*facing)<1e-10);
 assert.equal(attackVisibleRect(frame,false).width,320);
}
assert.deepEqual([4,5,9,11].map(i=>attackVisibleRect(i).left),[70,64,48,40]);
console.log('PASS: versioned fragment crop preserves source scale and shared foot anchor for both facings');

const { skillCuePixels }=load('WarriorSkillAnimation');
assert.equal(skillCuePixels('badao',.13).length,0);assert.equal(skillCuePixels('badao',.34).length,0);
assert.ok(skillCuePixels('badao',.24).length>0);assert.equal(skillCuePixels('cross',.34).length,0);
assert.ok(skillCuePixels('cross',.30).length>0);assert.equal(skillCuePixels(null,0).length,0);
assert.equal(skillAnimations.badao.chargeEnd-skillAnimations.badao.chargeStart,.2);
console.log('PASS: bounded charge/emission cues with unchanged 200ms charge and hit schedules');

const { WarriorBodyAnimation, bodyVisibleRect, bodyAtlas }=load('WarriorSkillAnimation');
const bodyMotion=new WarriorBodyAnimation();const gaitFrames=new Set();
for(let i=0;i<60;i++){bodyMotion.update(.01,true,true,0,false);gaitFrames.add(bodyMotion.frame);}
assert.deepEqual([...gaitFrames].sort(),[0,1,2,3],'run has four real poses');
bodyMotion.update(.01,false,false,0,false);assert.equal(bodyMotion.frame,4,'release enters dedicated brake pose');
for(let i=0;i<12;i++)bodyMotion.update(.01,false,false,0,false);
assert.equal(bodyMotion.frame,null,'brake finishes at shared guard');
bodyMotion.update(.01,true,true,.24,false);assert.equal(bodyMotion.frame,5,'hurt wins over locomotion');
bodyMotion.update(.01,false,false,.1,false);assert.equal(bodyMotion.frame,6,'hurt recovers with second pose');
bodyMotion.update(.01,true,true,0,true);assert.equal(bodyMotion.frame,null,'attack/skill does not play run underneath');
bodyMotion.update(.01,false,false,0,false);assert.equal(bodyMotion.frame,null,'action exit does not invent braking');
bodyMotion.update(.01,false,false,0,false,true);assert.equal(bodyMotion.frame,6,'dead player stays hurt instead of standing');
bodyMotion.reset();assert.equal(bodyMotion.frame,null);
assert.equal(bodyAtlas.cellSize,416);assert.equal(bodyVisibleRect(8).left+bodyVisibleRect(8).width,416);
console.log('PASS: four-pose gait, brake release, two-stage hurt priority, action locks, death/reset and body atlas geometry');

const {tryCastWarriorSkill}=load('WarriorSkillsModel');
for(const rate of [1,1.25,1.5]){
 const actor=new CombatModel();actor.setAttackSpeedBonuses({attributes:.1,equipment:.1,passive:.05,buff:rate-1-.25});
 assert.ok(Math.abs(actor.attackSpeedMultiplier-rate)<1e-10,'normal bonuses add before speed conversion');
 actor.press();const observed=[];
 for(let time=0;time<1/rate+.005;time+=.001){const before=actor.impactId;actor.update(.001,0,0);if(actor.impactId!==before)observed.push(time+.001);}
 assert.equal(actor.impactId,3,'all three attacks land exactly once at '+rate);
 for(let i=0;i<3;i++){
  const expected=(basicAttacks.slice(0,i).reduce((sum,a)=>sum+a.duration,0)+basicAttacks[i].impact)/rate;
  assert.ok(Math.abs(observed[i]-expected)<.003,'contact follows animation clock');
 }
 const tap=new CombatModel();tap.setAttackSpeedBonuses({buff:rate-1});tap.press();tap.release();
 advance(tap,.28/rate+.29);tap.press();tap.release();assert.equal(tap.stage,1,'300ms continuation independent of speed');
 const timeout=new CombatModel();timeout.setAttackSpeedBonuses({buff:rate-1});timeout.press();timeout.release();
 advance(timeout,.28/rate+.31);timeout.press();assert.equal(timeout.stage,0);
 const moving=new CombatModel();moving.setAttackSpeedBonuses({buff:rate-1});moving.press();moving.release();
 advance(moving,.238/rate-.003,1,0);assert.equal(moving.x,0,'movement remains locked until scaled moveAt');
 advance(moving,.006,1,0);assert.ok(moving.x>0);
}
const changed=new CombatModel();changed.press();advance(changed,.10);changed.setAttackSpeedBonuses({buff:.5});
assert.equal(changed.stageAttackSpeed,1);advance(changed,.181);assert.equal(changed.stage,1);assert.equal(changed.stageAttackSpeed,1.5);
const realBuffer=new CombatModel();realBuffer.setAttackSpeedBonuses({buff:.5});realBuffer.press();realBuffer.release();advance(realBuffer,.08);realBuffer.press();realBuffer.release();advance(realBuffer,.11);assert.equal(realBuffer.stage,1,'input buffer is 120ms of real combat time');
for(const stage of [0,1,2])for(const id of ['cross','bengshan','badao','earth'])for(const afterContact of [false,true]){
 const player=new CombatModel(),skillSet=new WarriorSkillsModel();player.nextStage=stage;player.press();
 advance(player,afterContact?basicAttacks[stage].impact+.002:.01);
 const damageBefore=player.impactId;
 assert.equal(tryCastWarriorSkill(player,skillSet,id),true);
 assert.equal(player.stage,-1);assert.equal(player.held,false);assert.equal(player.buffered,false);assert.equal(player.nextStage,0);
 advance(player,1.5);assert.equal(player.impactId,damageBefore,'cancel preserves resolved hit and discards future contacts');assert.equal(player.stage,-1,'no automatic basic after skill');
}
for(const reason of ['mana','cooldown','hurt','dead','casting']){
 const player=new CombatModel(),skillSet=new WarriorSkillsModel();player.press();advance(player,.02);
 if(reason==='mana')skillSet.mana=0;
 if(reason==='cooldown'){skillSet.cast('cross',1);skillSet.cancel();}
 if(reason==='hurt')player.hitStun=.1;
 if(reason==='dead')player.hp=0;
 if(reason==='casting')skillSet.cast('badao',1);
 const snapshot=JSON.stringify([player.stage,player.elapsed,player.nextStage,player.held,player.buffered,skillSet.mana]);
 assert.equal(tryCastWarriorSkill(player,skillSet,'cross'),false,reason+' blocks cancellation');
 assert.equal(JSON.stringify([player.stage,player.elapsed,player.nextStage,player.held,player.buffered,skillSet.mana]),snapshot,'failed cast is atomic');
}
console.log('PASS: additive attack-speed sources, 1/1.25/1.5 timings, stage snapshot, scaled movement, fixed combo/buffer and atomic basic-to-skill cancellation');

const cancellingPlayer=new CombatModel(), cancellingSkills=new WarriorSkillsModel(), cancellingFeedback=new CombatFeedback();
cancellingPlayer.press();cancellingFeedback.stopLeft=.05;
assert.equal(tryCastWarriorSkill(cancellingPlayer,cancellingSkills,'cross',cancellingFeedback),true);
assert.equal(cancellingFeedback.stopLeft,0,'successful cancel releases old basic hit-stop immediately');
cancellingFeedback.stopLeft=.03;
assert.equal(tryCastWarriorSkill(cancellingPlayer,cancellingSkills,'badao',cancellingFeedback),false);
assert.equal(cancellingFeedback.stopLeft,.03,'rejected input does not clear combat feedback');
console.log('PASS: immediate skill cancellation releases previous hit-stop only on success');

const {earthLeapTuning}=load('WarriorSkillsModel');
for(const dt of [1/120,1/60,1/30])for(const facing of [-1,1])for(const axis of [0,facing,-facing,.1*facing]){
 const leap=new WarriorSkillsModel();leap.cast('earth',facing,axis);let moved=0;
 for(let t=0;t<1.5;t+=dt){leap.update(dt);moved+=leap.motionDelta;if(t+dt<.28-1e-8)assert.equal(moved,0,'no movement before takeoff');}
 const expected=axis===facing?earthLeapTuning.forwardDistance:earthLeapTuning.defaultDistance;
 assert.ok(Math.abs(moved-expected*facing)<1e-8,'default/forward/reverse/deadzone jump distance is stable');
 assert.equal(leap.jumpLift,0);
}
const cancelLeap=new WarriorSkillsModel();cancelLeap.cast('earth',1,1);cancelLeap.update(.4);const initialMotion=cancelLeap.motionDelta;assert.ok(initialMotion>0);cancelLeap.cancel();cancelLeap.update(.5);assert.equal(cancelLeap.motionDelta,0);
const boundedLeap=new WarriorSkillsModel();boundedLeap.cast('earth',1,1);let roomX=200;
for(let i=0;i<120;i++){boundedLeap.update(1/120);roomX=Math.min(218,Math.max(-218,roomX+boundedLeap.motionDelta));}
assert.equal(roomX,218,'wall bounds constrain the actual landing center');
const landingHits=new WarriorSkillsModel(),oldPositionTarget=new EnemyModel(-100,0,1000,100),landingTarget=new EnemyModel(100,0,1001,100);
landingHits.cast('earth',1,1);let leapX=0;
for(let i=0;i<300;i++){landingHits.update(.01);leapX+=landingHits.motionDelta;landingHits.resolveHits([oldPositionTarget,landingTarget],leapX,0);}
assert.equal(oldPositionTarget.hp,100,'ground effect uses landing origin rather than launch origin');assert.equal(landingTarget.hp,97);
for(const facing of [-1,1])for(const rate of [1,1.25,1.5]){
 const stationary=new CombatModel();stationary.facing=facing;stationary.setAttackSpeedBonuses({buff:rate-1});stationary.press();advance(stationary,1/rate+.005);
 assert.ok(Math.abs(stationary.x-3*tuning.basicForwardStep*facing)<1e-8,'one held cycle nudges equally at each attack speed');assert.equal(stationary.y,0);
 stationary.release();const stoppedX=stationary.x;advance(stationary,1);assert.equal(stationary.x,stoppedX,'release stops forward nudge');
}
const tapped=new CombatModel();tapped.press();tapped.release();advance(tapped,.5);assert.equal(tapped.x,0,'single released tap does not auto walk');
const depthAttack=new CombatModel();depthAttack.press();advance(depthAttack,.2,0,1);assert.equal(depthAttack.attackMotionDelta,0,'directional input suppresses automatic nudge');assert.equal(depthAttack.x,0);
const interruptedWalk=new CombatModel();interruptedWalk.press();advance(interruptedWalk,.1);const interruptedX=interruptedWalk.x;assert.equal(tryCastWarriorSkill(interruptedWalk,new WarriorSkillsModel(),'cross'),true);advance(interruptedWalk,.5);assert.equal(interruptedWalk.x,interruptedX,'skill cancellation removes remaining basic nudge');
console.log('PASS: default/forward earth leaps, facing/deadzone/FPS/bounds, landing-origin damage, cancellation and held-basic microstep');
