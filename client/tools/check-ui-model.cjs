// Automated validation test suite for UIStateModel.ts
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { loadTypeScript, transpile } = require('../../tools/local-typescript.cjs');
let ts;
try { ({ ts } = loadTypeScript(process.argv[2] || process.env.WORLD308_TYPESCRIPT)); }
catch (error) { console.error(error.message); process.exit(1); }
function transpileCode(code, filename) { return transpile(ts, code, filename); }

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

// --- Test 8: ST13-04 战斗补给 HUD (SupplyHUDModel) 状态机与几何热区隔离验证 ---
const supplyFile = path.join(__dirname, '../assets/scripts/SupplyHUDModel.ts');
const supplyOutput = transpileCode(fs.readFileSync(supplyFile, 'utf8'), supplyFile);
const supplyMod = { exports: {} };
new Function('module', 'exports', supplyOutput)(supplyMod, supplyMod.exports);
const { SupplyHUDModel, SUPPLY_BUTTON_LAYOUT } = supplyMod.exports;

const hud = new SupplyHUDModel();

// 1. 几何无重叠与热区互斥断言
// 补给按钮4个：slot0 (135,10), slot1 (205,10), slot2 (275,10), trinket (345,10) 各半径28
const supplyButtons = [SUPPLY_BUTTON_LAYOUT.slot0, SUPPLY_BUTTON_LAYOUT.slot1, SUPPLY_BUTTON_LAYOUT.slot2, SUPPLY_BUTTON_LAYOUT.trinket];
for (let i = 0; i < supplyButtons.length; i++) {
    for (let j = i + 1; j < supplyButtons.length; j++) {
        const dist = Math.hypot(supplyButtons[i].x - supplyButtons[j].x, supplyButtons[i].y - supplyButtons[j].y);
        assert.ok(dist >= supplyButtons[i].radius + supplyButtons[j].radius, 'Supply buttons must not overlap each other');
    }
}

// 与四技能按钮 (150/215/280/345, -65, 半径31) 距离严格大于 28 + 31 = 59
const skillButtons = [{ x: 150, y: -65 }, { x: 215, y: -65 }, { x: 280, y: -65 }, { x: 345, y: -65 }];
for (const sb of supplyButtons) {
    for (const sk of skillButtons) {
        const dist = Math.hypot(sb.x - sk.x, sb.y - sk.y);
        assert.ok(dist >= sb.radius + 31, 'Supply buttons must not overlap warrior skill buttons');
    }
    // 与普攻 (345, -150, 半径68) 隔离
    assert.ok(Math.hypot(sb.x - 345, sb.y + 150) >= sb.radius + 68, 'Supply buttons must not overlap attack button');
    // 与摇杆 (-345, -150, 半径95) 隔离
    assert.ok(Math.hypot(sb.x + 345, sb.y + 150) >= sb.radius + 95, 'Supply buttons must not overlap joystick');
}

// 2. hitTest 命中测试
assert.deepEqual(hud.hitTest(135, 10), { target: 'quickSlot', index: 0 });
assert.deepEqual(hud.hitTest(205, 10), { target: 'quickSlot', index: 1 });
assert.deepEqual(hud.hitTest(275, 10), { target: 'quickSlot', index: 2 });
assert.deepEqual(hud.hitTest(345, 10), { target: 'trinket' });
assert.equal(hud.hitTest(135, 60), null, 'Out of bounds touch must return null');
assert.equal(hud.hitTest(0, 0), null);

// 3. 快捷药位状态机推导
// 初始状态：未绑定
assert.equal(hud.quickSlots[0].status, 'unbound');
assert.equal(hud.trinket.status, 'unbound');

// 同步权威快照：slot 0 绑定小红 (无货耗尽)，slot 1 绑定小蓝 (5瓶可用)，slot 2 未绑定
hud.syncFromSnapshot({
    quickSlots: ['item:hp-potion-small-v1', 'item:mp-potion-small-v1', null],
    backpackStacks: [{ templateId: 'item:mp-potion-small-v1', quantity: 5 }],
    equippedTrinket: { itemId: 'trinket-1', templateRef: 'item:trinket-warrior-glory-v1' },
    trinketEquipWaitUntilTick: 6000,
    cooldowns: [],
    buffs: [],
    currentTick: 1000,
    lifeState: 'alive',
    isFighting: true
});

assert.equal(hud.quickSlots[0].status, 'empty', 'Slot 0 has template but zero quantity -> empty');
assert.ok(hud.quickSlots[0].label.includes('耗尽'));
assert.equal(hud.quickSlots[1].status, 'ready', 'Slot 1 has 5 potions -> ready');
assert.ok(hud.quickSlots[1].label.includes('×5'));
assert.equal(hud.quickSlots[2].status, 'unbound', 'Slot 2 no template -> unbound');

// 饰品处于 60s 换装等待中 (tick 1000 < 6000)
assert.equal(hud.trinket.status, 'waiting');
assert.equal(hud.trinket.waitLeftSec, 50); // (6000 - 1000) * 0.01 = 50s

// 时间推进至等待结束：饰品变为就绪
hud.syncFromSnapshot({
    quickSlots: ['item:hp-potion-small-v1', 'item:mp-potion-small-v1', null],
    backpackStacks: [{ templateId: 'item:mp-potion-small-v1', quantity: 5 }],
    equippedTrinket: { itemId: 'trinket-1', templateRef: 'item:trinket-warrior-glory-v1' },
    trinketEquipWaitUntilTick: 6000,
    cooldowns: [],
    buffs: [],
    currentTick: 6000,
    lifeState: 'alive',
    isFighting: true
});
assert.equal(hud.trinket.status, 'ready');

// 4. 输入触发与提交状态
const emptyTrigger = hud.triggerQuickSlot(0, 6000);
assert.equal(emptyTrigger, null, 'Empty potion slot cannot trigger');

const mpTrigger = hud.triggerQuickSlot(1, 6000);
assert.deepEqual(mpTrigger, { kind: 'item', quickSlotIndex: 1, templateId: 'item:mp-potion-small-v1', tick: 6000 });
assert.equal(hud.quickSlots[1].status, 'submitting', 'Triggered slot transitions to submitting');

const trinketTrigger = hud.triggerTrinket(6000);
assert.deepEqual(trinketTrigger, { kind: 'trinket', itemId: 'trinket-1', tick: 6000 });
assert.equal(hud.trinket.status, 'submitting', 'Triggered trinket transitions to submitting');

// 5. 冷却与 Buff 激活状态
hud.resolveSubmission('quickSlot', 1);
hud.resolveSubmission('trinket');

hud.syncFromSnapshot({
    quickSlots: ['item:hp-potion-small-v1', 'item:mp-potion-small-v1', null],
    backpackStacks: [{ templateId: 'item:mp-potion-small-v1', quantity: 4 }],
    equippedTrinket: { itemId: 'trinket-1', templateRef: 'item:trinket-warrior-glory-v1' },
    trinketEquipWaitUntilTick: 6000,
    cooldowns: [
        { cooldownId: 'mpPotion', readyAtTick: 7000 },
        { cooldownId: 'trinket', readyAtTick: 18000 }
    ],
    buffs: [
        { buffId: 'b-1', templateRef: 'item:trinket-warrior-glory-v1', endsAtTick: 7500 }
    ],
    currentTick: 6100,
    lifeState: 'alive',
    isFighting: true
});

assert.equal(hud.quickSlots[1].status, 'cooldown');
assert.equal(hud.quickSlots[1].cooldownLeftSec, 9); // (7000 - 6100) * 0.01 = 9s
assert.equal(hud.trinket.status, 'active', 'Trinket buff active overrides cooldown display for button');
assert.equal(hud.trinket.buffLeftSec, 14); // (7500 - 6100) * 0.01 = 14s

// 6. 角色死亡时全补给禁用
hud.syncFromSnapshot({
    quickSlots: ['item:hp-potion-small-v1', 'item:mp-potion-small-v1', null],
    backpackStacks: [{ templateId: 'item:mp-potion-small-v1', quantity: 4 }],
    equippedTrinket: { itemId: 'trinket-1', templateRef: 'item:trinket-warrior-glory-v1' },
    cooldowns: [],
    buffs: [],
    currentTick: 8000,
    lifeState: 'dead',
    isFighting: true
});
assert.equal(hud.quickSlots[1].status, 'disabled');
assert.equal(hud.trinket.status, 'disabled');
console.log('PASS: SupplyHUDModel hotzones, lifecycle state machine, and trigger actions verified (ST13-04)');

console.log('\nALL UI MODEL TESTS PASSED (100% SUCCESS)');
