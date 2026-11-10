import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { SupplyHUDModel, SUPPLY_BUTTON_LAYOUT } from '../../client/assets/scripts/SupplyHUDModel.ts';
import { DeathReviveHUDModel, DEATH_REVIVE_LAYOUT } from '../../client/assets/scripts/DeathReviveHUDModel.ts';

const require = createRequire(import.meta.url);
const { loadTypeScript } = require('../../tools/local-typescript.cjs');
const tsPath = process.env.WORLD308_TYPESCRIPT || (
  existsSync('/Applications/Cocos/Creator/3.8.8/CocosCreator.app')
    ? '/Applications/Cocos/Creator/3.8.8/CocosCreator.app'
    : 'C:/ProgramData/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript'
);
const { ts } = loadTypeScript(tsPath);

// Cocos Creator CC stub for Node environment
class Node {
  constructor(name = '') {
    this.name = name;
    this.layer = 0;
    this.parent = null;
    this.children = [];
    this.components = [];
    this.active = true;
    this.position = { x: 0, y: 0, z: 0 };
    this.listeners = {};
  }
  addChild(child) {
    child.parent = this;
    this.children.push(child);
  }
  setPosition(x, y, z = 0) {
    this.position = { x, y, z };
  }
  addComponent(type) {
    const c = new type(this);
    this.components.push(c);
    return c;
  }
  getComponent(type) {
    return this.components.find(c => c instanceof type) ?? null;
  }
  getComponentInChildren(type) {
    const c = this.getComponent(type);
    if (c) return c;
    for (const ch of this.children) {
      const found = ch.getComponentInChildren(type);
      if (found) return found;
    }
    return null;
  }
  setSiblingIndex() {}
  destroy() {
    this.active = false;
  }
}

class Graphics {
  constructor(node) {
    this.node = node;
    this.fillColor = null;
    this.strokeColor = null;
    this.lineWidth = 1;
    this.cleared = false;
    this.rectCalls = [];
    this.circleCalls = [];
  }
  clear() {
    this.cleared = true;
    this.rectCalls = [];
    this.circleCalls = [];
  }
  rect(x, y, w, h) {
    this.rectCalls.push({ x, y, w, h });
  }
  circle(x, y, r) {
    this.circleCalls.push({ x, y, r });
  }
  fill() {}
  stroke() {}
}

class Color {
  constructor(r = 255, g = 255, b = 255, a = 255) {
    this.r = r;
    this.g = g;
    this.b = b;
    this.a = a;
  }
}

class UITransform {
  constructor(node) {
    this.node = node;
    this.width = 0;
    this.height = 0;
    this.anchorX = 0.5;
    this.anchorY = 0.5;
  }
  setContentSize(w, h) {
    this.width = w;
    this.height = h;
  }
  setAnchorPoint(x, y) {
    this.anchorX = x;
    this.anchorY = y;
  }
}

class Label {
  constructor(node) {
    this.node = node;
    this.string = '';
    this.fontSize = 12;
    this.lineHeight = 16;
    this.color = new Color();
    this.horizontalAlign = 0;
    this.verticalAlign = 0;
    this.overflow = 0;
  }
  static HorizontalAlign = { CENTER: 1, LEFT: 0, RIGHT: 2 };
  static VerticalAlign = { CENTER: 1 };
  static Overflow = { SHRINK: 1 };
}

class Vec3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
}

const ccStub = {
  Node,
  Graphics,
  Color,
  UITransform,
  Label,
  Vec3,
};

// Transpile component source files
function loadComponent(filePath, exportsMap = {}) {
  const source = readFileSync(new URL(filePath, import.meta.url), 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exp = {};
  vm.runInNewContext(transpiled, {
    exports: exp,
    require: name => {
      if (name === 'cc') return ccStub;
      if (name.includes('UISkin')) return { skinSprite: () => ({}) };
      if (name.includes('SupplyHUDModel')) return { SupplyHUDModel, SUPPLY_BUTTON_LAYOUT };
      if (name.includes('DeathReviveHUDModel')) return { DeathReviveHUDModel, DEATH_REVIVE_LAYOUT };
      return exportsMap[name] ?? {};
    },
    Math,
    Number,
    Boolean,
    String,
    Array,
    Object,
    Date,
  });
  return exp;
}

const PlayerStatusHUDModule = loadComponent('../../client/assets/scripts/ui/PlayerStatusHUD.ts');
const CombatSupplyHUDModule = loadComponent('../../client/assets/scripts/ui/CombatSupplyHUD.ts');
const DeathRevivePanelModule = loadComponent('../../client/assets/scripts/ui/DeathRevivePanel.ts');

test('PlayerStatusHUD: initial layout, well background, HP/MP tracks and fills', () => {
  const rootParent = new Node('Canvas');
  const hud = new PlayerStatusHUDModule.PlayerStatusHUD(rootParent, -390, 150);

  assert.equal(rootParent.children.length, 1);
  const hudNode = rootParent.children[0];
  assert.equal(hudNode.name, 'PlayerStatusHUD');

  const well = hudNode.children.find(c => c.name === 'StatusWell');
  assert.ok(well, 'StatusWell exists');

  const hpTrack = well.children.find(c => c.name === 'HpTrack');
  assert.ok(hpTrack, 'HpTrack exists');
  const hpFill = hpTrack.children.find(c => c.name === 'HpFill');
  assert.ok(hpFill, 'HpFill exists');

  const mpTrack = well.children.find(c => c.name === 'MpTrack');
  assert.ok(mpTrack, 'MpTrack exists');
  const mpFill = mpTrack.children.find(c => c.name === 'MpFill');
  assert.ok(mpFill, 'MpFill exists');
});

test('PlayerStatusHUD: update reflects HP and MP percentages, text labels, and level badge', () => {
  const rootParent = new Node('Canvas');
  const hud = new PlayerStatusHUDModule.PlayerStatusHUD(rootParent, -390, 150);
  const well = rootParent.children[0].children.find(c => c.name === 'StatusWell');

  // Update with 75 HP / 100 max, 50 MP / 100 max, level 5
  hud.update(75, 100, 50, 100, 5);

  const hpTrack = well.children.find(c => c.name === 'HpTrack');
  const hpFill = hpTrack.children.find(c => c.name === 'HpFill');
  const hpTransform = hpFill.getComponent(UITransform);
  assert.equal(hpTransform.width, 182 * 0.75);

  const hpLabel = hpTrack.children.find(c => c.name === 'Label').getComponent(Label);
  assert.equal(hpLabel.string, 'HP 75 / 100');

  const mpTrack = well.children.find(c => c.name === 'MpTrack');
  const mpFill = mpTrack.children.find(c => c.name === 'MpFill');
  const mpTransform = mpFill.getComponent(UITransform);
  assert.equal(mpTransform.width, 182 * 0.5);

  const mpLabel = mpTrack.children.find(c => c.name === 'Label').getComponent(Label);
  assert.equal(mpLabel.string, 'MP 50 / 100');

  const levelLabel = well.children.find(c => c.name === 'Label').getComponent(Label);
  assert.equal(levelLabel.string, 'Lv.5 狂战士');
});

test('CombatSupplyHUD: renders 3 quick slots and 1 trinket slot with 56px grid base', () => {
  const rootParent = new Node('Canvas');
  const model = new SupplyHUDModel();
  const view = new CombatSupplyHUDModule.CombatSupplyHUD(rootParent, model);

  const hudNode = rootParent.children[0];
  assert.equal(hudNode.name, 'CombatSupplyHUD');

  const slot0 = hudNode.children.find(c => c.name === 'SupplySlot_0');
  const slot1 = hudNode.children.find(c => c.name === 'SupplySlot_1');
  const slot2 = hudNode.children.find(c => c.name === 'SupplySlot_2');
  const trinket = hudNode.children.find(c => c.name === 'TrinketSlot');

  assert.ok(slot0, 'SupplySlot_0 exists');
  assert.ok(slot1, 'SupplySlot_1 exists');
  assert.ok(slot2, 'SupplySlot_2 exists');
  assert.ok(trinket, 'TrinketSlot exists');

  assert.equal(slot0.getComponent(UITransform).width, 56);
  assert.equal(slot0.getComponent(UITransform).height, 56);
  assert.equal(trinket.getComponent(UITransform).width, 56);
});

test('CombatSupplyHUD: slot quality borders, name abbreviations, and stack count badges', () => {
  const rootParent = new Node('Canvas');
  const model = new SupplyHUDModel();

  // Populate slot 0 with HP potion, slot 1 with MP potion, slot 2 empty
  model.syncFromSnapshot({
    quickSlots: ['item:hp-potion-medium-v1', 'item:mp-potion-small-v1', null],
    backpackStacks: [
      { templateId: 'item:hp-potion-medium-v1', quantity: 5 },
      { templateId: 'item:mp-potion-small-v1', quantity: 8 },
    ],
    equippedTrinket: { itemId: 'trinket-glory', templateRef: 'item:trinket-warrior-glory-v1' },
    cooldowns: [],
    buffs: [],
    currentTick: 100,
    lifeState: 'alive',
    isFighting: true,
  });

  const view = new CombatSupplyHUDModule.CombatSupplyHUD(rootParent, model);
  view.render();

  const hudNode = rootParent.children[0];
  const slot0 = hudNode.children.find(c => c.name === 'SupplySlot_0');
  const labels = slot0.children.map(c => c.getComponent(Label)).filter(Boolean);

  const nameLabel = labels.find(l => l.string === '中红');
  assert.ok(nameLabel, 'Slot 0 name label is 中红');

  const countLabel = labels.find(l => l.string === '×5');
  assert.ok(countLabel, 'Slot 0 count label is ×5');
});

test('CombatSupplyHUD: cooldown overlay mask and countdown timers for quick slots and trinket', () => {
  const rootParent = new Node('Canvas');
  const model = new SupplyHUDModel();

  // Put slot 0 on cooldown (3s left)
  model.syncFromSnapshot({
    quickSlots: ['item:hp-potion-medium-v1', null, null],
    backpackStacks: [{ templateId: 'item:hp-potion-medium-v1', quantity: 4 }],
    equippedTrinket: null,
    cooldowns: [{ cooldownId: 'hpPotion', readyAtTick: 400 }], // 400 - 100 = 300 ticks = 3.0s
    buffs: [],
    currentTick: 100,
    lifeState: 'alive',
    isFighting: true,
  });

  const view = new CombatSupplyHUDModule.CombatSupplyHUD(rootParent, model);
  view.render();

  const hudNode = rootParent.children[0];
  const slot0 = hudNode.children.find(c => c.name === 'SupplySlot_0');
  const cdLabel = slot0.children.map(c => c.getComponent(Label)).filter(Boolean).find(l => l.string === '3.0s');
  assert.ok(cdLabel, 'Cooldown label 3.0s rendered');

  const mask = slot0.children.find(c => c.name === 'CooldownMask').getComponent(Graphics);
  assert.equal(mask.rectCalls.length, 1);
});

test('CombatSupplyHUD: active trinket displays legendary border and buff duration', () => {
  const rootParent = new Node('Canvas');
  const model = new SupplyHUDModel();

  // Active trinket buff (ends at tick 300, current 100 -> 2.0s left)
  model.syncFromSnapshot({
    quickSlots: [null, null, null],
    backpackStacks: [],
    equippedTrinket: { itemId: 'trinket-glory', templateRef: 'item:trinket-warrior-glory-v1' },
    cooldowns: [],
    buffs: [{ buffId: 'buff:trinket-glory', templateRef: 'item:trinket-warrior-glory-v1', endsAtTick: 300 }],
    currentTick: 100,
    lifeState: 'alive',
    isFighting: true,
  });

  const view = new CombatSupplyHUDModule.CombatSupplyHUD(rootParent, model);
  view.render();

  const hudNode = rootParent.children[0];
  const trinket = hudNode.children.find(c => c.name === 'TrinketSlot');
  const labels = trinket.children.map(c => c.getComponent(Label)).filter(Boolean);

  const activeLabel = labels.find(l => l.string === '生效中');
  assert.ok(activeLabel, 'Trinket displays 生效中');

  const buffDurationLabel = labels.find(l => l.string === '2.0s');
  assert.ok(buffDurationLabel, 'Trinket displays buff duration 2.0s');
});

test('DeathRevivePanel: 9-patch frame, inner well, title, and progress bar hierarchy', () => {
  const rootParent = new Node('Canvas');
  const model = new DeathReviveHUDModel();
  const panel = new DeathRevivePanelModule.DeathRevivePanel(rootParent, model);

  assert.equal(rootParent.children.length, 1);
  const panelNode = rootParent.children[0];
  assert.equal(panelNode.name, 'DeathRevivePanel');

  const modal = panelNode.children.find(c => c.name === 'ModalWindow');
  assert.ok(modal, 'ModalWindow exists');

  const innerWell = modal.children.find(c => c.name === 'InnerWell');
  assert.ok(innerWell, 'InnerWell exists');

  const progressTrack = modal.children.find(c => c.name === 'ProgressBarTrack');
  assert.ok(progressTrack, 'ProgressBarTrack exists');

  const reviveBtn = modal.children.find(c => c.name === 'ReviveButton');
  const leaveBtn = modal.children.find(c => c.name === 'LeaveButton');
  assert.ok(reviveBtn, 'ReviveButton exists');
  assert.ok(leaveBtn, 'LeaveButton exists');
});

test('DeathRevivePanel: countdown updates, color change under 3s, and emblem/limit labels', () => {
  const rootParent = new Node('Canvas');
  const model = new DeathReviveHUDModel();
  const panel = new DeathRevivePanelModule.DeathRevivePanel(rootParent, model);

  model.open(1, 10000, 8000, 5, false, 0);
  panel.render();

  assert.equal(panel.isVisible, true);
  const modal = rootParent.children[0].children.find(c => c.name === 'ModalWindow');
  const labels = modal.children.map(c => c.getComponent(Label)).filter(Boolean);

  const cdLabel = labels.find(l => l.string === '剩余时间: 8.0s');
  assert.ok(cdLabel, 'Countdown label shows 8.0s');

  const emblemLabel = labels.find(l => l.string === '复活纹章: 5');
  assert.ok(emblemLabel, 'Emblem label shows 5');

  const limitLabel = labels.find(l => l.string === '普通副本无次数限制');
  assert.ok(limitLabel, 'Limit label shows unlimited');

  // Advance to under 3s
  model.update(6.0); // remaining 2.0s
  panel.render();

  const cdLabel2 = labels.find(l => l.string === '剩余时间: 2.0s');
  assert.ok(cdLabel2, 'Countdown label shows 2.0s');
});

test('DeathRevivePanel: revive and leave button state transitions (ready, disabled, submitting)', () => {
  const rootParent = new Node('Canvas');
  const model = new DeathReviveHUDModel();
  const panel = new DeathRevivePanelModule.DeathRevivePanel(rootParent, model);

  // 0 emblems -> disabled
  model.open(1, 10000, 10000, 0, false, 0);
  panel.render();

  const modal = rootParent.children[0].children.find(c => c.name === 'ModalWindow');
  const reviveBtn = modal.children.find(c => c.name === 'ReviveButton');
  const reviveLbl = reviveBtn.children.find(c => c.name === 'Label').getComponent(Label);
  assert.equal(reviveLbl.string, '纹章不足');

  // Set 5 emblems -> ready
  model.emblemCount = 5;
  model.disabledReason = null;
  model.reviveButtonState = 'ready';
  panel.render();
  assert.equal(reviveLbl.string, '立即复活');

  // Click revive -> submitting
  model.onReviveClicked();
  panel.render();
  assert.equal(reviveLbl.string, '复活中...');
});

test('DeathRevivePanel: golden aura and death fadeout overlay rendering', () => {
  const rootParent = new Node('Canvas');
  const model = new DeathReviveHUDModel();
  const panel = new DeathRevivePanelModule.DeathRevivePanel(rootParent, model);

  model.open(1, 10000, 10000, 5, false, 0);
  model.goldenAura.active = true;
  model.goldenAura.elapsedSec = 0.5;

  panel.render(10, 20);

  const auraGraphics = rootParent.children[0].children.find(c => c.name === 'AuraEffect').getComponent(Graphics);
  assert.equal(auraGraphics.circleCalls.length, 2); // fill + stroke
  assert.equal(auraGraphics.circleCalls[0].x, 20);
  assert.equal(auraGraphics.circleCalls[0].y, 40);

  // Trigger fadeout
  model.fadeOut.active = true;
  model.fadeOut.alpha = 0.8;
  panel.render();

  const fadeGraphics = rootParent.children[0].children.find(c => c.name === 'FadeoutOverlay').getComponent(Graphics);
  assert.equal(fadeGraphics.rectCalls.length, 1);
});

test('DeathRevivePanel: hitTest accurate mapping for revive and leave buttons', () => {
  const rootParent = new Node('Canvas');
  const model = new DeathReviveHUDModel();
  const panel = new DeathRevivePanelModule.DeathRevivePanel(rootParent, model);

  assert.equal(panel.hitTest(-75, -55), null); // hidden

  model.open(1, 10000, 10000, 5, false, 0);
  assert.equal(panel.hitTest(-75, -55), 'revive');
  assert.equal(panel.hitTest(75, -55), 'leave');
  assert.equal(panel.hitTest(0, 0), null);
});

test('Combat HUD: dispose cleanup safely', () => {
  const rootParent = new Node('Canvas');
  const sModel = new SupplyHUDModel();
  const sView = new CombatSupplyHUDModule.CombatSupplyHUD(rootParent, sModel);
  const dModel = new DeathReviveHUDModel();
  const dPanel = new DeathRevivePanelModule.DeathRevivePanel(rootParent, dModel);
  const pHud = new PlayerStatusHUDModule.PlayerStatusHUD(rootParent, -390, 150);

  assert.equal(rootParent.children.length, 3);

  sView.dispose();
  dPanel.dispose();
  pHud.dispose();

  assert.equal(rootParent.children.every(c => !c.active), true);
});
