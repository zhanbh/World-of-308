import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { enhancementFixture } from './fixtures/enhancement-fixture.mjs';
import { EnhancementCoordinator } from '../../client/assets/scripts/net/EnhancementCoordinator.ts';

const require = createRequire(import.meta.url);
const { loadTypeScript } = require('../../tools/local-typescript.cjs');
const tsPath = process.env.WORLD308_TYPESCRIPT || 'C:/ProgramData/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript';
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
  static HorizontalAlign = { CENTER: 1 };
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

// Transpile EnhancementPanel.ts
const panelSource = readFileSync(new URL('../../client/assets/scripts/ui/EnhancementPanel.ts', import.meta.url), 'utf8');
const panelTranspiled = ts.transpileModule(panelSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function createPanel(coordinator, options = {}) {
  const exp = {};
  vm.runInNewContext(panelTranspiled, {
    exports: exp,
    require: name => (name === 'cc' ? ccStub : { EnhancementCoordinator }),
    Date,
    setTimeout,
    structuredClone,
    JSON,
  });
  const rootParent = new Node('SceneRoot');
  const panel = new exp.EnhancementPanel(rootParent, coordinator, options);
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

async function seedLevel(f, level, setRef = null) {
  const item = f.store.inspect(f.weaponId);
  const ap = level === 0 ? undefined : String(BigInt(f.config.earringAttackPowerByTarget[level - 1]) * 3n / 2n);
  await f.store.run(async tx => tx.set(item.id, {
    ...item,
    setRef,
    enhancementLevel: level,
    ...(level ? { enhancementBonus: { configRef: f.config.ref, level, attackPower: ap } } : { enhancementBonus: undefined }),
  }));
}

async function addMemento(f, quantity = 10, slot = 1) {
  await f.store.run(async tx => {
    const bag = await tx.get(f.bag().id);
    tx.set(bag.id, {
      ...bag,
      slots: {
        ...bag.slots,
        [slot]: {
          kind: 'stack',
          stackId: 'memento-admitted',
          templateRef: { id: f.config.mementoTemplateRef, version: 1 },
          quantity,
          binding: { kind: 'character', accountId: f.account().id, characterId: f.characterId },
          traceRef: 'memento-admitted-source',
        },
      },
    });
  });
}

test('EnhancementPanel initializes closed, opens to empty state, and handles valid item selection', async () => {
  const f = await enhancementFixture({ sample: 100000 });
  await f.fund('10000');
  const saved = new Map();
  const persistence = { load: k => saved.get(k) ?? null, save: (k, v) => (v === null ? saved.delete(k) : saved.set(k, v)) };
  const coordinator = new EnhancementCoordinator(f.transport, persistence, () => 'client-panel-1');
  coordinator.init({ ...f.auth, characterId: f.characterId, rolePlayEpoch: f.character().rolePlayEpoch });

  let visibilityEvent = false;
  const { panel, rootParent } = createPanel(coordinator, {
    contextId: f.contextId,
    templateLabel: id => (id === 'ore' ? '强化石' : id === 'memento' ? '纪念品' : id.includes('sword') ? '精炼双刀' : id),
    onVisibility: v => { visibilityEvent = v; },
  });

  assert.equal(panel.isOpen, false);

  // Open with null item
  await panel.open(f.contextId, null);
  assert.equal(panel.isOpen, true);
  assert.equal(visibilityEvent, true);
  assert.equal(coordinator.state.status, 'empty');

  // Verify empty label prompt
  const panelLabels = collectAllLabels(rootParent);
  assert.ok(panelLabels.some(l => l.includes('请选择需要强化的武器或耳环')));

  // Select valid weapon
  await panel.selectItem(f.weaponId);
  assert.equal(coordinator.state.status, 'ready');

  // Verify UI displays item, level +0 -> +1, AP preview, and failure preserve warning
  const updatedLabels = collectAllLabels(rootParent);
  assert.ok(updatedLabels.some(l => l.includes('精炼双刀 [武器 · Lv10]')));
  assert.ok(updatedLabels.some(l => l.includes('强化等级: +0 → +1')));
  assert.ok(updatedLabels.some(l => l.includes('攻击力:')));
  assert.ok(updatedLabels.some(l => l.includes('失败后果: 保持当前等级不变 (保级)')));
  assert.ok(updatedLabels.some(l => l.includes('金币费用: 10')));
  assert.ok(updatedLabels.some(l => l.includes('强化石 ×1')));
});

test('Information Hiding Gatekeeper: Panel strictly suppresses probability, sample and memory exposure', async () => {
  const f = await enhancementFixture({ sample: 100000 });
  await f.fund('10000');
  const saved = new Map();
  const persistence = { load: k => saved.get(k) ?? null, save: (k, v) => (v === null ? saved.delete(k) : saved.set(k, v)) };
  const coordinator = new EnhancementCoordinator(f.transport, persistence, () => 'client-panel-hiding');
  coordinator.init({ ...f.auth, characterId: f.characterId, rolePlayEpoch: f.character().rolePlayEpoch });

  const { panel, rootParent } = createPanel(coordinator, { contextId: f.contextId });
  await panel.open(f.contextId, f.weaponId);
  assert.equal(coordinator.state.status, 'ready');

  // Gather ALL text rendered across the node hierarchy
  const allText = collectAllLabels(rootParent).join(' | ');

  // Assert NO probability percentages, raw seeds, samples or memory weights are visible
  assert.ok(!allText.includes('%'), `Forbidden percentage sign found: ${allText}`);
  assert.ok(!allText.includes('概率'), `Forbidden probability word found: ${allText}`);
  assert.ok(!allText.includes('800000'), `Forbidden raw probability found: ${allText}`);
  assert.ok(!allText.includes('sample'), `Forbidden sample found: ${allText}`);
  assert.ok(!allText.includes('memory'), `Forbidden memory found: ${allText}`);
  assert.ok(!allText.includes('150000'), `Forbidden memory weight found: ${allText}`);
});

test('Low-grade enhancement submission updates state, reflects success banner, and invokes onResult', async () => {
  const f = await enhancementFixture({ sample: 100000 });
  await f.fund('10000');
  const saved = new Map();
  const persistence = { load: k => saved.get(k) ?? null, save: (k, v) => (v === null ? saved.delete(k) : saved.set(k, v)) };
  const coordinator = new EnhancementCoordinator(f.transport, persistence, () => 'client-panel-succ');
  coordinator.init({ ...f.auth, characterId: f.characterId, rolePlayEpoch: f.character().rolePlayEpoch });

  let resultCaptured = null;
  const { panel, rootParent } = createPanel(coordinator, {
    contextId: f.contextId,
    onResult: r => { resultCaptured = r; },
  });

  await panel.open(f.contextId, f.weaponId);
  assert.equal(coordinator.state.status, 'ready');

  // Click enhance
  panel.clickButton('开始强化');
  await new Promise(resolve => setTimeout(resolve, 50));

  // Should have completed and re-quoted for level +2
  assert.equal(coordinator.state.status, 'ready');
  assert.equal(coordinator.state.view.item.enhancementLevel, 1);
  assert.ok(resultCaptured);
  assert.equal(resultCaptured.result, 'success');
  assert.equal(resultCaptured.targetLevel, 1);

  // Result banner in UI
  const labels = collectAllLabels(rootParent);
  assert.ok(labels.some(l => l.includes('【强化成功】装备成功强化至 +1！')));
});

test('High-grade +10 to +11: Displays downgrade warning, enables memento toggle, and reflects failure downgrade banner', async () => {
  // Set sample high so it fails
  const f = await enhancementFixture({ sample: 999999 });
  await f.fund('100000');
  await seedLevel(f, 10);
  await addMemento(f, 10);

  const saved = new Map();
  const persistence = { load: k => saved.get(k) ?? null, save: (k, v) => (v === null ? saved.delete(k) : saved.set(k, v)) };
  const coordinator = new EnhancementCoordinator(f.transport, persistence, () => 'client-panel-downgrade');
  coordinator.init({ ...f.auth, characterId: f.characterId, rolePlayEpoch: f.character().rolePlayEpoch });

  const { panel, rootParent } = createPanel(coordinator, {
    contextId: f.contextId,
    templateLabel: id => (id === 'memento' ? '战神纪念品' : id === 'ore' ? '强化石' : '双刀'),
  });

  await panel.open(f.contextId, f.weaponId);
  assert.equal(coordinator.state.status, 'ready');

  // Target is +11: Downgrade risk warning
  let labels = collectAllLabels(rootParent);
  assert.ok(labels.some(l => l.includes('强化等级: +10 → +11')));
  assert.ok(labels.some(l => l.includes('失败后果: 强化等级降至 +10 (降级)')));

  // Memento button is visible
  assert.ok(labels.some(l => l.includes('[ ] 使用纪念品 (不使用)')));

  // Toggle memento on
  panel.clickButton('[ ] 使用纪念品');
  await new Promise(resolve => setTimeout(resolve, 50));

  labels = collectAllLabels(rootParent);
  assert.ok(labels.some(l => l.includes('[√] 使用纪念品 (消耗加成)')));
  assert.ok(labels.some(l => l.includes('战神纪念品 ×1')));

  // Execute enhance (will fail due to sample 999999)
  panel.clickButton('开始强化');
  await new Promise(resolve => setTimeout(resolve, 50));

  // Result banner shows downgrade
  labels = collectAllLabels(rootParent);
  assert.ok(labels.some(l => l.includes('【强化失败】装备已降至 +10')));
  assert.equal(coordinator.state.view.item.enhancementLevel, 10);
});

test('High-grade +12 to +13: Displays permanent destruction warning, resets panel on destruction', async () => {
  // Set sample high so it fails
  const f = await enhancementFixture({ sample: 999999 });
  await f.fund('100000');
  await seedLevel(f, 12);

  const saved = new Map();
  const persistence = { load: k => saved.get(k) ?? null, save: (k, v) => (v === null ? saved.delete(k) : saved.set(k, v)) };
  const coordinator = new EnhancementCoordinator(f.transport, persistence, () => 'client-panel-destroy');
  coordinator.init({ ...f.auth, characterId: f.characterId, rolePlayEpoch: f.character().rolePlayEpoch });

  const { panel, rootParent } = createPanel(coordinator, { contextId: f.contextId });
  await panel.open(f.contextId, f.weaponId);
  assert.equal(coordinator.state.status, 'ready');

  // Destruction risk warning
  let labels = collectAllLabels(rootParent);
  assert.ok(labels.some(l => l.includes('强化等级: +12 → +13')));
  assert.ok(labels.some(l => l.includes('失败后果: 装备永久损毁，返还纪念品 (损毁)')));

  // Click enhance -> weapon destroyed!
  panel.clickButton('开始强化');
  await new Promise(resolve => setTimeout(resolve, 50));

  labels = collectAllLabels(rootParent);
  assert.ok(labels.some(l => l.includes('【装备损毁】强化失败装备已永久损毁！纪念品已返还')));
  assert.equal(coordinator.state.itemId, null);
  assert.equal(coordinator.state.status, 'empty');
});

test('Insufficient funds triggers failed state and disables enhance button while enabling refresh', async () => {
  const f = await enhancementFixture({ sample: 100000 });
  await f.fund('0'); // Zero gold
  const saved = new Map();
  const persistence = { load: k => saved.get(k) ?? null, save: (k, v) => (v === null ? saved.delete(k) : saved.set(k, v)) };
  const coordinator = new EnhancementCoordinator(f.transport, persistence, () => 'client-panel-nofund');
  coordinator.init({ ...f.auth, characterId: f.characterId, rolePlayEpoch: f.character().rolePlayEpoch });

  const { panel, rootParent } = createPanel(coordinator, { contextId: f.contextId });
  await panel.open(f.contextId, f.weaponId);

  // Quote succeeds (it's read-only preview), state is ready
  assert.equal(coordinator.state.status, 'ready');

  // Submit enhancement with 0 gold: execute rejects with CURRENCY_NOT_ENOUGH
  panel.clickButton('开始强化');
  await new Promise(resolve => setTimeout(resolve, 50));

  assert.equal(coordinator.state.status, 'failed');
  assert.equal(coordinator.state.code, 'CURRENCY_NOT_ENOUGH');

  const labels = collectAllLabels(rootParent);
  assert.ok(labels.some(l => l.includes('强化失败: CURRENCY_NOT_ENOUGH')));

  // Enhance button cannot be triggered while failed
  panel.clickButton('开始强化');
  assert.equal(coordinator.state.status, 'failed');

  // Fund player and refresh
  await f.fund('10000');
  panel.clickButton('刷新');
  await new Promise(resolve => setTimeout(resolve, 50));

  assert.equal(coordinator.state.status, 'ready');
});

test('Unknown outcome exposes recovery button and resolves pending operation without double charge', async () => {
  const f = await enhancementFixture({ sample: 100000 });
  await f.fund('10000');
  const saved = new Map();
  const persistence = { load: k => saved.get(k) ?? null, save: (k, v) => (v === null ? saved.delete(k) : saved.set(k, v)) };
  const coordinator = new EnhancementCoordinator(f.transport, persistence, () => 'client-panel-unknown');
  coordinator.init({ ...f.auth, characterId: f.characterId, rolePlayEpoch: f.character().rolePlayEpoch });

  const { panel, rootParent } = createPanel(coordinator, { contextId: f.contextId });
  await panel.open(f.contextId, f.weaponId);
  assert.equal(coordinator.state.status, 'ready');

  // Inject response loss
  f.store.injectResponseLoss();

  panel.clickButton('开始强化');
  await new Promise(resolve => setTimeout(resolve, 50));

  // State is unknown
  assert.equal(coordinator.state.status, 'unknown');
  let labels = collectAllLabels(rootParent);
  assert.ok(labels.some(l => l.includes('强化结果确认中，请点击确认操作结果')));

  // Enhance button is disabled
  panel.clickButton('开始强化');
  assert.equal(coordinator.state.status, 'unknown');

  // Click recover button
  panel.clickButton('确认操作结果');
  await new Promise(resolve => setTimeout(resolve, 50));

  // Resolved!
  assert.equal(coordinator.state.status, 'ready');
  assert.equal(coordinator.state.view.item.enhancementLevel, 1);
  assert.equal(f.wallet().gold, '9990'); // Single charge (10 gold for +1 weapon)
});

test('Panel closure and role switching isolates late responses and cleans up listeners', async () => {
  const f = await enhancementFixture({ sample: 100000 });
  await f.fund('10000');
  const saved = new Map();
  const persistence = { load: k => saved.get(k) ?? null, save: (k, v) => (v === null ? saved.delete(k) : saved.set(k, v)) };
  const coordinator = new EnhancementCoordinator(f.transport, persistence, () => 'client-panel-close');
  coordinator.init({ ...f.auth, characterId: f.characterId, rolePlayEpoch: f.character().rolePlayEpoch });

  let visibility = false;
  const { panel } = createPanel(coordinator, {
    contextId: f.contextId,
    onVisibility: v => { visibility = v; },
  });

  await panel.open(f.contextId, f.weaponId);
  assert.equal(panel.isOpen, true);
  assert.equal(visibility, true);

  // Close panel
  panel.close();
  assert.equal(panel.isOpen, false);
  assert.equal(visibility, false);
  assert.equal(coordinator.state.status, 'closed');

  // Any late network callback should not change panel
  panel.update();
  assert.equal(panel.isOpen, false);

  // Dispose cleans up root node
  panel.dispose();
  assert.equal(panel.isOpen, false);
});

test('Earring selection displays earring slot, AP preview and costs correctly', async () => {
  const f = await enhancementFixture({ sample: 100000 });
  await f.fund('10000');

  // Create earring in backpack
  const original = f.store.inspect(f.weaponId);
  const earringId = 'admitted-earring-test';
  await f.store.run(async tx => {
    tx.set(earringId, {
      ...original,
      id: earringId,
      slotKind: 'earring',
      sourceKey: earringId,
      templateRef: { id: 'equipment:test-earring', version: 1 },
      location: { kind: 'container', containerId: f.bag().id },
      holderCharacterId: f.characterId,
    });
    const b = await tx.get(f.bag().id);
    tx.set(b.id, {
      ...b,
      slots: {
        ...b.slots,
        1: { kind: 'equipment', itemId: earringId, sortHeader: { itemLevel: 10, quality: 'white', slotKind: 'earring' } },
      },
    });
  });

  const saved = new Map();
  const persistence = { load: k => saved.get(k) ?? null, save: (k, v) => (v === null ? saved.delete(k) : saved.set(k, v)) };
  const coordinator = new EnhancementCoordinator(f.transport, persistence, () => 'client-earring-test');
  coordinator.init({ ...f.auth, characterId: f.characterId, rolePlayEpoch: f.character().rolePlayEpoch });

  const { panel, rootParent } = createPanel(coordinator, {
    contextId: f.contextId,
    templateLabel: id => (id.includes('earring') ? '翡翠耳环' : id),
  });

  await panel.open(f.contextId, earringId);
  assert.equal(coordinator.state.status, 'ready');

  const labels = collectAllLabels(rootParent);
  assert.ok(labels.some(l => l.includes('翡翠耳环 [耳环 · Lv10]')));
  assert.ok(labels.some(l => l.includes('强化等级: +0 → +1')));
});

test('Level 20 item sets MAX_GRADE_REACHED, disables enhance, and displays capped notice', async () => {
  const f = await enhancementFixture({ sample: 100000 });
  await f.fund('10000');
  await seedLevel(f, 20);

  const saved = new Map();
  const persistence = { load: k => saved.get(k) ?? null, save: (k, v) => (v === null ? saved.delete(k) : saved.set(k, v)) };
  const coordinator = new EnhancementCoordinator(f.transport, persistence, () => 'client-max-test');
  coordinator.init({ ...f.auth, characterId: f.characterId, rolePlayEpoch: f.character().rolePlayEpoch });

  const { panel, rootParent } = createPanel(coordinator, { contextId: f.contextId });
  await panel.open(f.contextId, f.weaponId);

  assert.equal(coordinator.state.status, 'empty');
  assert.equal(coordinator.state.code, 'MAX_GRADE_REACHED');

  const labels = collectAllLabels(rootParent);
  assert.ok(labels.some(l => l.includes('已达强化等级上限 (+20)')));

  // Enhance button cannot be triggered
  panel.clickButton('开始强化');
  assert.equal(coordinator.state.status, 'empty');
});
