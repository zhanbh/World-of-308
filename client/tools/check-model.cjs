// Uses TypeScript shipped with Creator; installs no dependencies.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const editor = process.argv[2];
if (!editor) throw new Error('Pass Creator installation directory as the first argument');
const ts = require(path.join(editor, 'resources/app.asar.unpacked/node_modules/typescript'));
for (const name of ['CombatModel.ts', 'EnemyModel.ts', 'WarriorView.ts', 'WarriorSkillsModel.ts', 'Prototype.ts']) {
    const file = path.join(__dirname, '../assets/scripts', name);
    const checked = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        fileName: file,
        reportDiagnostics: true,
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    });
    const errors = (checked.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error);
    assert.equal(errors.length, 0, `${name} should transpile without syntax errors: ${errors.map(item => item.messageText).join('; ')}`);
}
const source = fs.readFileSync(path.join(__dirname, '../assets/scripts/CombatModel.ts'), 'utf8');
const result = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
const mod = { exports: {} };
new Function('module', 'exports', result.outputText)(mod, mod.exports);
const { CombatModel, tuning } = mod.exports;
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
m.reset(); m.press(); m.release(); advance(m, 0.25); m.press(); m.release(); advance(m, 0.08);
assert.equal(m.stage, 1, 'late action input must buffer the next stage');
m.reset(); m.press(); advance(m, 1.08);
assert.equal(m.stage, 3, 'hold must advance to finisher');
advance(m, 0.46); assert.equal(m.stage, 3, 'finisher recovery must not restart the combo early');
advance(m, 0.30); assert.equal(m.stage, 0, 'hold must loop after full finisher recovery');
m.reset(); m.press(); advance(m, 1.08); m.release();
advance(m, 0.46); assert.equal(m.windowLeft, 0, 'combo window must not start during finisher recovery');
advance(m, 0.30); assert.ok(m.windowLeft > 0.2, 'combo window starts after the finisher ends');
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

const skillSource = fs.readFileSync(path.join(__dirname, '../assets/scripts/WarriorSkillsModel.ts'), 'utf8');
const skillResult = ts.transpileModule(skillSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
const skillMod = { exports: {} };
new Function('module', 'exports', skillResult.outputText)(skillMod, skillMod.exports);
const { WarriorSkillsModel, warriorSkillTuning } = skillMod.exports;
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
