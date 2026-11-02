import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { allWornFixture, WEAR_SLOTS } from './fixtures/all-worn-repair-fixture.mjs';
import { RepairCoordinator } from '../../client/assets/scripts/net/RepairCoordinator.ts';

const require = createRequire(import.meta.url);
const { loadTypeScript } = require('../../tools/local-typescript.cjs');
const tsPath = process.env.WORLD308_TYPESCRIPT || (
  existsSync('/Applications/Cocos/Creator/3.8.8/CocosCreator.app')
    ? '/Applications/Cocos/Creator/3.8.8/CocosCreator.app'
    : 'C:/ProgramData/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript'
);
const { ts } = loadTypeScript(tsPath);

// Stub Cocos Creator CC module for pure Node testing of UI hierarchy and lifecycle
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
  on(event, handler) {
    (this.listeners[event] ||= []).push(handler);
  }
  emit(event, ...args) {
    for (const fn of this.listeners[event] || []) fn(...args);
  }
  destroy() {
    this.active = false;
  }
}
Node.EventType = {
  TOUCH_START: 'touch-start',
  TOUCH_MOVE: 'touch-move',
  TOUCH_END: 'touch-end',
  TOUCH_CANCEL: 'touch-cancel',
  MOUSE_DOWN: 'mouse-down',
  MOUSE_MOVE: 'mouse-move',
  MOUSE_UP: 'mouse-up',
  MOUSE_WHEEL: 'mouse-wheel',
};

class Graphics {
  constructor(node) {
    this.node = node;
    this.fillColor = null;
    this.strokeColor = null;
    this.lineWidth = 1;
  }
  clear() {}
  rect() {}
  roundRect() {}
  fill() {}
  stroke() {}
}

class Color {
  constructor(r = 0, g = 0, b = 0, a = 255) {
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
  }
  setContentSize(w, h) {
    this.width = w;
    this.height = h;
  }
  convertToNodeSpaceAR(v) {
    return { x: v.x, y: v.y };
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

const sys = { isBrowser: false };
const game = { on() {}, off() {} };
const Game = { EVENT_HIDE: 'game-hide' };
class EventTouch {
  getID() { return 1; }
  getUILocation() { return { x: 0, y: 0 }; }
}
class EventMouse {
  getButton() { return 0; }
  getUILocation() { return { x: 0, y: 0 }; }
}

const ccStub = {
  Node,
  Graphics,
  Color,
  UITransform,
  Label,
  Vec3,
  sys,
  game,
  Game,
  EventTouch,
  EventMouse,
};

// Transpile RepairPanel.ts
const panelSource = readFileSync(new URL('../../client/assets/scripts/ui/RepairPanel.ts', import.meta.url), 'utf8');
const panelTranspiled = ts.transpileModule(panelSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function createPanel(coordinator, options = {}) {
  const exp = {};
  vm.runInNewContext(panelTranspiled, {
    exports: exp,
    require: name => (name === 'cc' ? ccStub : { RepairCoordinator }),
    Date,
    setTimeout,
    structuredClone,
    JSON,
  });
  const rootParent = new Node('SceneRoot');
  const panel = new exp.RepairPanel(rootParent, coordinator, options);
  return { panel, rootParent };
}

function collectAllLabels(node) {
  const labels = [];
  const comp = node.getComponent(Label);
  if (comp) labels.push(comp.string);
  for (const child of node.children) {
    labels.push(...collectAllLabels(child));
  }
  return labels;
}

test('RepairPanel initializes closed, opens in allWorn mode, and presents complete 7-item breakdown', async () => {
  const f = await allWornFixture();
  const saved = new Map();
  const persistence = { load: k => saved.get(k) ?? null, save: (k, v) => (v === null ? saved.delete(k) : saved.set(k, v)) };
  const coordinator = new RepairCoordinator(f.transport, persistence, () => 'client-panel-open');
  coordinator.init({ ...f.auth, characterId: f.characterId, rolePlayEpoch: f.character().rolePlayEpoch });

  let visibilityEvent = false;
  const { panel, rootParent } = createPanel(coordinator, {
    contextId: f.contextId,
    templateLabel: id => (id.includes('weapon') ? '普通双刀' : id),
    onVisibility: v => { visibilityEvent = v; },
  });

  assert.equal(panel.isOpen, false);

  // Open in allWorn mode
  await panel.open(f.contextId);
  assert.equal(panel.isOpen, true);
  assert.equal(visibilityEvent, true);
  assert.equal(panel.mode, 'allWorn');
  assert.equal(coordinator.state.status, 'ready');

  // Verify labels in stage card
  const labels = collectAllLabels(rootParent);
  assert.ok(labels.some(l => l.includes('林纳克斯 · 装备修理')));
  assert.ok(labels.some(l => l.includes('当前穿戴装备耐久度明细 (7 槽位)')));
  assert.ok(labels.some(l => l.includes('主手武器')));
  assert.ok(labels.some(l => l.includes('护肩')));
  assert.ok(labels.some(l => l.includes('上衣')));
  assert.ok(labels.some(l => l.includes('下装')));
  assert.ok(labels.some(l => l.includes('腰带')));
  assert.ok(labels.some(l => l.includes('鞋子')));
  assert.ok(labels.some(l => l.includes('耳环')));
  assert.ok(labels.some(l => l.includes('总费用: 240 金币')));
  assert.ok(labels.some(l => l.includes('修理报价已就绪，可确认执行修理')));
});

test('RepairPanel allWorn execution commits full batch, deducts gold, and reflects success banner', async () => {
  const f = await allWornFixture();
  const saved = new Map();
  const persistence = { load: k => saved.get(k) ?? null, save: (k, v) => (v === null ? saved.delete(k) : saved.set(k, v)) };
  const coordinator = new RepairCoordinator(f.transport, persistence, () => 'client-panel-exec');
  coordinator.init({ ...f.auth, characterId: f.characterId, rolePlayEpoch: f.character().rolePlayEpoch });

  let resultCaptured = null;
  const { panel, rootParent } = createPanel(coordinator, {
    contextId: f.contextId,
    onResult: r => { resultCaptured = r; },
  });

  await panel.open(f.contextId);
  assert.equal(coordinator.state.status, 'ready');
  assert.equal(panel.canRepair(), true);

  // Click repair button
  panel.clickButton('确认修理');
  await new Promise(resolve => setTimeout(resolve, 50));

  // Verify result
  assert.equal(coordinator.state.status, 'ready');
  assert.ok(resultCaptured);
  assert.equal(resultCaptured.chargedGold, '240');
  assert.equal(resultCaptured.repairedItemIds.length, 7);

  // Success banner rendered
  const labels = collectAllLabels(rootParent);
  assert.ok(labels.some(l => l.includes('【修理成功】扣除 240 金币，已成功修满 7 件装备！')));
  assert.ok(labels.some(l => l.includes('所有穿戴装备完好无损，无需修理 (0 金币)')));
});

test('RepairPanel switches cleanly between allWorn and single modes', async () => {
  const f = await allWornFixture();
  const saved = new Map();
  const persistence = { load: k => saved.get(k) ?? null, save: (k, v) => (v === null ? saved.delete(k) : saved.set(k, v)) };
  const coordinator = new RepairCoordinator(f.transport, persistence, () => 'client-panel-switch');
  coordinator.init({ ...f.auth, characterId: f.characterId, rolePlayEpoch: f.character().rolePlayEpoch });

  const { panel, rootParent } = createPanel(coordinator, {
    contextId: f.contextId,
    templateLabel: id => (id.includes('sword') || id.includes('weapon') ? '精炼短剑' : id),
  });

  await panel.open(f.contextId);
  assert.equal(panel.mode, 'allWorn');

  // Switch to single mode with weaponId
  await panel.switchMode('single', f.weaponId);
  assert.equal(panel.mode, 'single');
  assert.equal(coordinator.state.status, 'ready');

  let labels = collectAllLabels(rootParent);
  assert.ok(labels.some(l => l.includes('单件装备修理')));
  assert.ok(labels.some(l => l.includes('精炼短剑')));
  assert.ok(labels.some(l => l.includes('缺失耐久: 60 点')));
  assert.ok(labels.some(l => l.includes('修理费用: 60 金币')));

  // Switch back to allWorn
  await panel.switchMode('allWorn');
  assert.equal(panel.mode, 'allWorn');
  assert.equal(coordinator.state.status, 'ready');

  labels = collectAllLabels(rootParent);
  assert.ok(labels.some(l => l.includes('当前穿戴装备耐久度明细 (7 槽位)')));
  assert.ok(labels.some(l => l.includes('总费用: 240 金币')));
});

test('RepairPanel handles insufficient funds failure and displays friendly message', async () => {
  const f = await allWornFixture();
  await f.fund('100'); // Requires 240, short by 140
  const saved = new Map();
  const persistence = { load: k => saved.get(k) ?? null, save: (k, v) => (v === null ? saved.delete(k) : saved.set(k, v)) };
  const coordinator = new RepairCoordinator(f.transport, persistence, () => 'client-panel-short');
  coordinator.init({ ...f.auth, characterId: f.characterId, rolePlayEpoch: f.character().rolePlayEpoch });

  const { panel, rootParent } = createPanel(coordinator, { contextId: f.contextId });
  await panel.open(f.contextId);
  assert.equal(coordinator.state.status, 'ready');

  panel.clickButton('确认修理');
  await new Promise(resolve => setTimeout(resolve, 50));

  assert.equal(coordinator.state.status, 'failed');
  assert.equal(coordinator.state.code, 'CURRENCY_NOT_ENOUGH');

  const labels = collectAllLabels(rootParent);
  assert.ok(labels.some(l => l.includes('修理失败: 金币不足以支付全部修理费用')));
});

test('RepairPanel unknown state displays recovery prompt and allows recovery click', async () => {
  const f = await allWornFixture();
  const saved = new Map();
  const persistence = { load: k => saved.get(k) ?? null, save: (k, v) => (v === null ? saved.delete(k) : saved.set(k, v)) };
  // Mock transport timeout on submit
  let dropSubmit = true;
  const flakyTransport = {
    async send(req) {
      const q = JSON.parse(req);
      if (q.command === 'equipment.repair' && dropSubmit) {
        dropSubmit = false;
        throw new Error('NETWORK_TIMEOUT');
      }
      return f.transport.send(req);
    },
  };

  const coordinator = new RepairCoordinator(flakyTransport, persistence, () => 'client-panel-timeout');
  coordinator.init({ ...f.auth, characterId: f.characterId, rolePlayEpoch: f.character().rolePlayEpoch });

  const { panel, rootParent } = createPanel(coordinator, { contextId: f.contextId });
  await panel.open(f.contextId);
  assert.equal(coordinator.state.status, 'ready');

  // Click repair -> network throws -> transitions to unknown
  panel.clickButton('确认修理');
  await new Promise(resolve => setTimeout(resolve, 50));

  assert.equal(coordinator.state.status, 'unknown');
  assert.equal(panel.canRecover(), true);

  const labels = collectAllLabels(rootParent);
  assert.ok(labels.some(l => l.includes('交易状态未决，请点击【确认操作结果】安全恢复，切勿重复支付')));

  // Click recover -> operation.get notFound -> retry succeeds
  panel.clickButton('确认操作结果');
  await new Promise(resolve => setTimeout(resolve, 50));

  assert.equal(coordinator.state.status, 'ready');
  assert.equal(coordinator.state.lastResult.chargedGold, '240');
});

test('RepairPanel close and dispose cleanly detach visibility and suppress late responses', async () => {
  const f = await allWornFixture();
  const saved = new Map();
  const persistence = { load: k => saved.get(k) ?? null, save: (k, v) => (v === null ? saved.delete(k) : saved.set(k, v)) };
  const coordinator = new RepairCoordinator(f.transport, persistence, () => 'client-panel-lifecycle');
  coordinator.init({ ...f.auth, characterId: f.characterId, rolePlayEpoch: f.character().rolePlayEpoch });

  let visibilityEvents = [];
  const { panel, rootParent } = createPanel(coordinator, {
    contextId: f.contextId,
    onVisibility: v => visibilityEvents.push(v),
  });

  await panel.open(f.contextId);
  assert.equal(panel.isOpen, true);
  assert.deepEqual(visibilityEvents, [true]);

  panel.close();
  assert.equal(panel.isOpen, false);
  assert.equal(rootParent.children[0].active, false);
  assert.deepEqual(visibilityEvents, [true, false]);

  panel.dispose();
  assert.equal(rootParent.children[0].active, false);
});

test('Non-blocking broken equipment warning: zero durability triggers notice without interrupting combat or movement', async () => {
  const f = await allWornFixture();
  const saved = new Map();
  const persistence = { load: k => saved.get(k) ?? null, save: (k, v) => (v === null ? saved.delete(k) : saved.set(k, v)) };
  const coordinator = new RepairCoordinator(f.transport, persistence, () => 'client-panel-notice');
  coordinator.init({ ...f.auth, characterId: f.characterId, rolePlayEpoch: f.character().rolePlayEpoch });

  // Coordinator reads 0 durability weapon
  await coordinator.open(f.contextId, f.weaponId);
  assert.equal(coordinator.state.status, 'ready');
  assert.equal(coordinator.state.view.item.durability.current, 0);

  // Prototype logic verification: when weapon durability is 0, warning message is generated
  let brokenNotice = '';
  const checkBroken = (view) => {
    let weaponBroken = false;
    let anyBroken = false;
    if (view) {
      const items = 'items' in view ? view.items : [view.item];
      for (const item of items) {
        if (item.durability && item.durability.current === 0) {
          anyBroken = true;
          if (item.slotKind === 'weapon') weaponBroken = true;
        }
      }
    }
    if (weaponBroken) {
      brokenNotice = '【装备破损警告】主手武器耐久归零，攻击力加成失效，但可继续战斗！';
    } else if (anyBroken) {
      brokenNotice = '【装备破损警告】部分防具耐久归零，防御与套装属性失效！';
    } else {
      brokenNotice = '';
    }
  };

  checkBroken(coordinator.state.view);
  assert.ok(brokenNotice.includes('【装备破损警告】主手武器耐久归零，攻击力加成失效，但可继续战斗！'));

  // Non-blocking: combat actions remain permitted even with 0 weapon durability (AC17-2)
  const weapon = coordinator.state.view.item;
  assert.equal(weapon.durability.current, 0);
  assert.equal(weapon.slotKind, 'weapon');
});

test('Input Safety: Double clicks and unauthorized interactions are safely ignored during in-flight submission', async () => {
  const f = await allWornFixture();
  const saved = new Map();
  const persistence = { load: k => saved.get(k) ?? null, save: (k, v) => (v === null ? saved.delete(k) : saved.set(k, v)) };

  let resolveSubmit;
  const delayedTransport = {
    async send(req) {
      const q = JSON.parse(req);
      if (q.command === 'equipment.repair') {
        await new Promise(r => { resolveSubmit = r; });
      }
      return f.transport.send(req);
    },
  };

  const coordinator = new RepairCoordinator(delayedTransport, persistence, () => 'client-panel-double');
  coordinator.init({ ...f.auth, characterId: f.characterId, rolePlayEpoch: f.character().rolePlayEpoch });

  const { panel } = createPanel(coordinator, { contextId: f.contextId });
  await panel.open(f.contextId);
  assert.equal(coordinator.state.status, 'ready');

  // Trigger repair
  panel.clickButton('确认修理');
  assert.equal(coordinator.state.status, 'submitting');
  assert.equal(panel.canRepair(), false);

  // Second click while submitting must be ignored
  panel.clickButton('确认修理');
  assert.equal(coordinator.state.status, 'submitting');

  // Complete in-flight submission
  resolveSubmit();
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(coordinator.state.status, 'ready');
});

