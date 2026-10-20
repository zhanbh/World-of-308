// Automated validation test suite for UIStateModel.ts
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

function transpileCode(code, filename) {
    const esbuildCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    return execFileSync(esbuildCmd, ['esbuild', '--loader=ts', '--target=es2020', '--format=cjs'], {
        input: code,
        encoding: 'utf8',
        shell: true,
        maxBuffer: 10 * 1024 * 1024,
    });
}

const file = path.join(__dirname, '../assets/scripts/UIStateModel.ts');
const output = transpileCode(fs.readFileSync(file, 'utf8'), file);
assert.ok(output.length > 0, 'UIStateModel.ts should transpile without syntax errors');

const mod = { exports: {} };
new Function('module', 'exports', output)(mod, mod.exports);
const { UIStateModel, ALL_EQUIPMENT_SLOTS, DURABILITY_ENABLED_SLOTS, ENHANCEMENT_ENABLED_SLOTS } = mod.exports;

// --- Test 1: 严格 13 装备槽验证 (明确无头部槽位) ---
assert.equal(ALL_EQUIPMENT_SLOTS.length, 13, 'There must be exactly 13 equipment slots');
assert.ok(!ALL_EQUIPMENT_SLOTS.includes('head'), 'Head slot must NOT exist');
assert.ok(ALL_EQUIPMENT_SLOTS.includes('weapon'), 'Weapon slot must exist');
assert.ok(ALL_EQUIPMENT_SLOTS.includes('trinket'), 'Trinket slot must exist');
assert.ok(ALL_EQUIPMENT_SLOTS.includes('shoulder'), 'Shoulder slot must exist');
assert.ok(ALL_EQUIPMENT_SLOTS.includes('chest'), 'Chest slot must exist');
assert.ok(ALL_EQUIPMENT_SLOTS.includes('belt'), 'Belt slot must exist');
assert.ok(ALL_EQUIPMENT_SLOTS.includes('pants'), 'Pants slot must exist');
assert.ok(ALL_EQUIPMENT_SLOTS.includes('boots'), 'Boots slot must exist');
assert.ok(ALL_EQUIPMENT_SLOTS.includes('necklace'), 'Necklace slot must exist');
assert.ok(ALL_EQUIPMENT_SLOTS.includes('bracelet'), 'Bracelet slot must exist');
assert.ok(ALL_EQUIPMENT_SLOTS.includes('ring'), 'Ring slot must exist');
assert.ok(ALL_EQUIPMENT_SLOTS.includes('subEquip'), 'Sub-Equip slot must exist');
assert.ok(ALL_EQUIPMENT_SLOTS.includes('magicStone'), 'MagicStone slot must exist');
assert.ok(ALL_EQUIPMENT_SLOTS.includes('earring'), 'Earring slot must exist');
console.log('PASS: 13 equipment slots verified without head slot');

// --- Test 2: 耐久度 7 槽限制与三色阶梯 ---
assert.equal(DURABILITY_ENABLED_SLOTS.size, 7, 'Exactly 7 slots must have durability enabled');
const ui = new UIStateModel();
assert.equal(ui.getDurabilityStatus('weapon', 100, 100), 'normal');
assert.equal(ui.getDurabilityStatus('weapon', 40, 100), 'warning');
assert.equal(ui.getDurabilityStatus('weapon', 0, 100), 'broken');
assert.equal(ui.getDurabilityStatus('necklace', 100, 100), 'unbreakable', 'Necklace must not have durability');
assert.equal(ui.getDurabilityStatus('trinket', 100, 100), 'unbreakable', 'Trinket must not have durability');
console.log('PASS: 7 durability slots and 3-color status ladder verified');

// --- Test 3: 进本校验拦截 (LOC04) ---
// Case A: 无武器禁止进本
ui.equipped = {};
const noWeaponCheck = ui.canEnterDungeon();
assert.equal(noWeaponCheck.allowed, false);
assert.ok(noWeaponCheck.reason.includes('请先装备武器'));

// Case B: 0 耐久武器禁止进本
const brokenWeapon = {
    id: 'w1', templateId: 't_w1', name: '破损双刀', slot: 'weapon',
    itemLevel: 10, requiredLevel: 1, quality: 'white', binding: 'none',
    durability: 0, maxDurability: 60, baseStats: { ap: 10 }, sellPrice: 10
};
ui.equipped['weapon'] = brokenWeapon;
const brokenWeaponCheck = ui.canEnterDungeon();
assert.equal(brokenWeaponCheck.allowed, false);
assert.ok(brokenWeaponCheck.reason.includes('0耐久'));

// Case C: 正常武器且有体力允许进本
brokenWeapon.durability = 50;
const goodCheck = ui.canEnterDungeon();
assert.equal(goodCheck.allowed, true);

// Case D: 0 体力拦截
ui.stamina = 0;
const noStaminaCheck = ui.canEnterDungeon();
assert.equal(noStaminaCheck.allowed, false);
assert.ok(noStaminaCheck.reason.includes('体力不足'));
ui.stamina = 10;
console.log('PASS: dungeon entrance gatekeeper verified (no weapon, 0 durability, 0 stamina)');

// --- Test 4: 满包对调换装与满包卸装拒绝 (UI01) ---
// 填满背包 (20/20)
for (let i = 0; i < 20; i++) {
    ui.bag[i] = {
        id: `junk_${i}`, templateId: 't_junk', name: `杂物${i}`,
        itemLevel: 1, requiredLevel: 1, quality: 'white', binding: 'none',
        baseStats: {}, sellPrice: 5
    };
}
// 背包第 0 格放一把新武器
const newWeapon = {
    id: 'w2', templateId: 't_w2', name: '精炼双刀', slot: 'weapon',
    itemLevel: 15, requiredLevel: 10, quality: 'green', binding: 'none',
    durability: 80, maxDurability: 80, baseStats: { ap: 30 }, sellPrice: 25
};
ui.bag[0] = newWeapon;

// 满包状态下穿戴新武器：旧武器应与新武器原格对调！
const equipResult = ui.equipFromBag(0);
assert.equal(equipResult.success, true);
assert.equal(ui.equipped['weapon'].id, 'w2');
assert.equal(ui.bag[0].id, 'w1', 'Old weapon must take the slot of the new weapon in-place');

// 满包状态下尝试直接脱下武器：应被安全拒绝！
const unequipResult = ui.unequipToBag('weapon');
assert.equal(unequipResult.success, false);
assert.ok(unequipResult.message.includes('背包已满'));
assert.equal(ui.equipped['weapon'].id, 'w2', 'Weapon must stay equipped');

// 空出 1 格后卸下：成功
ui.bag[0] = null;
const unequipSuccess = ui.unequipToBag('weapon');
assert.equal(unequipSuccess.success, true);
assert.equal(ui.equipped['weapon'], undefined);
assert.equal(ui.bag[0].id, 'w2', 'Weapon should unequip into the empty slot');
console.log('PASS: full bag in-place swap and full bag unequip prevention verified (UI01)');

// --- Test 5: 账号金库角色绑定道具存入拦截 (UI04) ---
const soulboundItem = {
    id: 'sb1', templateId: 't_sb1', name: '专属勋章',
    itemLevel: 15, requiredLevel: 10, quality: 'purple', binding: 'character',
    baseStats: {}, sellPrice: 100
};
const accountItem = {
    id: 'acc1', templateId: 't_acc1', name: '全家桶金币箱',
    itemLevel: 15, requiredLevel: 1, quality: 'blue', binding: 'account',
    baseStats: {}, sellPrice: 100
};
assert.equal(ui.canDepositToAccountVault(soulboundItem).allowed, false);
assert.ok(ui.canDepositToAccountVault(soulboundItem).reason.includes('角色绑定物品无法存入账号金库'));
assert.equal(ui.canDepositToAccountVault(accountItem).allowed, true);
console.log('PASS: account vault soulbound rejection verified (UI04)');

// --- Test 6: 铁匠林纳克斯一键全修与金币不足整批拒绝 (UI08) ---
ui.equipped = {};
const wornChest = {
    id: 'c1', templateId: 't_c1', name: '轻甲', slot: 'chest',
    itemLevel: 15, requiredLevel: 10, quality: 'blue', binding: 'none',
    durability: 35, maxDurability: 100, baseStats: { armor: 40 }, sellPrice: 30
};
ui.equipped['chest'] = wornChest; // 缺失 65 耐久, 单点 2 金币 => 130 金币
ui.gold = 50; // 金币不足
const failRepair = ui.repairAllEquipped(2);
assert.equal(failRepair.success, false);
assert.ok(failRepair.message.includes('金币不足'));
assert.equal(ui.gold, 50, 'Gold must not be deducted on failure');
assert.equal(wornChest.durability, 35, 'Durability must not change on failure');

ui.gold = 200; // 金币充足
const okRepair = ui.repairAllEquipped(2);
assert.equal(okRepair.success, true);
assert.equal(ui.gold, 70, 'Must deduct exactly 130 gold');
assert.equal(wornChest.durability, 100, 'Chest durability must be fully restored');
console.log('PASS: repair batch failure and full deduction verified (UI08)');

// --- Test 7: 角色攻防数值展开计算与 0 耐久失效 ---
ui.equipped = {
    weapon: {
        id: 'w3', templateId: 't_w3', name: '强化双刀', slot: 'weapon',
        itemLevel: 15, requiredLevel: 15, quality: 'purple', binding: 'character',
        durability: 80, maxDurability: 100, enhancementLevel: 10,
        baseStats: { ap: 80, str: 15 },
        affixes: [{ type: 'ap', value: 12 }, { type: 'crit', value: 2.5 }],
        sellPrice: 50
    },
    chest: {
        id: 'c2', templateId: 't_c2', name: '护胸', slot: 'chest',
        itemLevel: 15, requiredLevel: 15, quality: 'purple', binding: 'character',
        durability: 80, maxDurability: 100,
        baseStats: { armor: 150, sta: 20 },
        sellPrice: 40
    }
};
const stats = ui.computeCharacterStats();
assert.ok(stats.totalAp > 100, 'AP must be calculated');
assert.equal(stats.enhancementAp, 24, 'Enhancement +10 on weapon should yield 24 AP');
assert.equal(stats.affixAp, 12, 'Legal AP affix on weapon should yield 12 AP');
assert.ok(stats.damageReductionPercent > 10, 'Armor DR% must be computed');

// 模拟防具耐久归零：护甲和耐力应立即失效！
ui.equipped['chest'].durability = 0;
const brokenStats = ui.computeCharacterStats();
assert.equal(brokenStats.armor, 50, 'Broken chest armor must be excluded from total stats');
console.log('PASS: stats computation and 0-durability attribute expiry verified');

console.log('\nALL UI MODEL TESTS PASSED (100% SUCCESS)');
