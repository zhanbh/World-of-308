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
m.reset(); m.press(); m.release(); advance(m, 0.10); m.press(); m.release(); advance(m, 0.11);
assert.equal(m.stage, 1, 'late tap must buffer exactly one next stage, even after key-up');
advance(m, 0.23); assert.equal(m.stage, -1, 'buffer must be consumed once');
m.reset(); m.press(); m.release(); advance(m, 0.02); m.press(); m.release(); advance(m, 0.20);
assert.equal(m.stage, -1, 'early released tap must not buffer');
m.reset(); m.press(); advance(m, 0.43);
assert.equal(m.stage, 2, 'hold must advance to downward finisher');
advance(m, 0.30); assert.equal(m.stage, 2, 'finisher recovery must finish before looping');
advance(m, 0.06); assert.equal(m.stage, 0, 'hold loops after 780ms without an extra idle window');
m.reset(); m.press(); advance(m, 0.43); m.release();
advance(m, 0.30); assert.equal(m.windowLeft, 0, 'window must not start during finisher recovery');
advance(m, 0.06); assert.ok(m.windowLeft > 0.28, 'window starts after finisher ends');
const hits = new CombatModel(); hits.press();
advance(hits, 0.079); assert.equal(hits.impactId, 0);
advance(hits, 0.002); assert.equal(hits.impactId, 1, 'A contact is 80ms');
advance(hits, 0.218); assert.equal(hits.impactId, 1);
advance(hits, 0.002); assert.equal(hits.impactId, 2, 'B contact is 100ms after B start');
advance(hits, 0.258); assert.equal(hits.impactId, 2);
advance(hits, 0.002); assert.equal(hits.impactId, 3, 'C contact is 140ms after C start');
advance(hits, 0.22); assert.equal(hits.impactId, 3, 'only one damage event per beat');
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
