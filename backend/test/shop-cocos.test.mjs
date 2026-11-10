import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { ShopCoordinator } from '../../client/assets/scripts/net/ShopCoordinator.ts';

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

// Transpile ShopPanel.ts
const panelSource = readFileSync(new URL('../../client/assets/scripts/ui/ShopPanel.ts', import.meta.url), 'utf8');
const panelTranspiled = ts.transpileModule(panelSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function createPanel(coordinator, options = {}) {
  const exp = {};
  vm.runInNewContext(panelTranspiled, {
    exports: exp,
    require: name => (name === 'cc' ? ccStub : name.includes('UISkin') ? { skinSprite: () => ({}) } : { ShopCoordinator }),
    Date,
    setTimeout,
    structuredClone,
    JSON,
    BigInt,
    Math,
    Number,
    Object,
    Array,
    String,
  });
  const rootParent = new Node('SceneRoot');
  const panel = new exp.ShopPanel(rootParent, coordinator, options);
  return { panel, rootParent, exp };
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

function setupMockTransport(initial = {}) {
  let gold = BigInt(initial.gold ?? '100000');
  let points = BigInt(initial.points ?? '100');
  let charVer = 1;
  let bagVer = 1;
  let walletVer = 1;

  const characterView = (ver) => ({
    character: { characterId: 'c-test', classId: 'warrior', characterName: '狂战', level: 15 },
    version: ver,
    equipped: [],
    skills: [{ skillId: 'cross', level: 1, unlocked: true }],
    attributes: [],
    location: { kind: 'town', anchorId: 'delilah' },
    stamina: 308,
    staminaAsOf: 1,
  });

  const accountView = () => ({
    characters: [{ characterId: 'c-test', classId: 'warrior', characterName: '狂战', level: 15 }],
    selectedCharacterId: 'c-test',
    wallet: { gold: gold.toString(), points: points.toString() },
    activeChallengeId: null,
    openSceneChallengeId: null,
  });

  const calls = [];
  const transport = {
    send: async (text) => {
      const r = JSON.parse(text);
      calls.push(r);

      if (r.query === 'account.get') {
        return JSON.stringify({
          requestId: r.requestId,
          serverTime: Date.now(),
          versions: [{ kind: 'account', id: 'acc-test', version: walletVer }],
          data: accountView(),
        });
      }

      if (r.query === 'character.get') {
        return JSON.stringify({
          requestId: r.requestId,
          serverTime: Date.now(),
          versions: [{ kind: 'character', id: 'c-test', version: charVer }],
          data: characterView(charVer),
        });
      }

      if (r.command === 'shop.buy') {
        const cost = BigInt(r.payload.quantity) * 250n; // Assume 250 gold per item
        gold -= cost;
        bagVer++;
        walletVer++;
        charVer++;
        return JSON.stringify({
          operationId: r.operationId,
          serverTime: Date.now(),
          replayed: false,
          outcome: {
            status: 'committed',
            resultVersions: [
              { kind: 'character', id: 'c-test', version: charVer },
              { kind: 'container', id: 'c-test', version: bagVer },
              { kind: 'wallet', id: 'w-test', version: walletVer },
            ],
            data: { deliveredQuantity: r.payload.quantity, sourceRef: r.payload.offerId },
          },
        });
      }

      if (r.command === 'shop.sell') {
        const gain = 500n;
        gold += gain;
        bagVer++;
        walletVer++;
        charVer++;
        return JSON.stringify({
          operationId: r.operationId,
          serverTime: Date.now(),
          replayed: false,
          outcome: {
            status: 'committed',
            resultVersions: [
              { kind: 'character', id: 'c-test', version: charVer },
              { kind: 'container', id: 'c-test', version: bagVer },
              { kind: 'wallet', id: 'w-test', version: walletVer },
            ],
            data: { soldQuantity: r.payload.quantity, sourceRef: 'item_junk_sword' },
          },
        });
      }

      if (r.command === 'wallet.exchange') {
        if (r.payload.fromCurrency === 'gold') {
          const goldCost = BigInt(r.payload.exchangeUnits) * 10000n;
          gold -= goldCost;
          points += BigInt(r.payload.exchangeUnits);
        } else {
          points -= BigInt(r.payload.exchangeUnits);
          gold += BigInt(r.payload.exchangeUnits) * 10000n;
        }
        walletVer++;
        return JSON.stringify({
          operationId: r.operationId,
          serverTime: Date.now(),
          replayed: false,
          outcome: {
            status: 'committed',
            resultVersions: [
              { kind: 'wallet', id: 'w-test', version: walletVer },
            ],
            data: { exchangeUnits: r.payload.exchangeUnits, fromCurrency: r.payload.fromCurrency },
          },
        });
      }

      if (r.query === 'operation.get') {
        return JSON.stringify({
          requestId: r.requestId,
          serverTime: Date.now(),
          versions: [],
          data: {
            status: 'found',
            command: 'shop.buy',
            result: {
              operationId: r.payload.operationId,
              serverTime: Date.now(),
              replayed: true,
              outcome: {
                status: 'committed',
                resultVersions: [
                  { kind: 'character', id: 'c-test', version: ++charVer },
                  { kind: 'wallet', id: 'w-test', version: ++walletVer },
                ],
                data: { deliveredQuantity: 1, sourceRef: 'offer_hp_potion_minor' },
              },
            },
          },
        });
      }

      return JSON.stringify({});
    },
  };

  const saved = new Map();
  const persistence = {
    load: (k) => saved.get(k) ?? null,
    save: (k, v) => (v === null ? saved.delete(k) : saved.set(k, v)),
  };

  return { transport, persistence, calls, getGold: () => gold, getPoints: () => points };
}

test('ShopPanel: initializes closed, opens in buy mode, and shows Delilah title and balances', async () => {
  const { transport, persistence } = setupMockTransport({ gold: '88888', points: '66' });
  const coordinator = new ShopCoordinator(transport, persistence);
  coordinator.init({ sessionId: 's-1', sessionEpoch: 1, characterId: 'c-test' });

  let visibility = false;
  const { panel, rootParent } = createPanel(coordinator, {
    onVisibility: (v) => { visibility = v; },
  });

  assert.equal(panel.isOpen, false);
  await panel.open('sandbox-shop');
  assert.equal(panel.isOpen, true);
  assert.equal(visibility, true);
  assert.equal(panel.mode, 'buy');

  const labels = collectAllLabels(rootParent);
  assert.ok(labels.some(l => l.includes('旅行商人 · 德利拉 (杂货商店)')));
  assert.ok(labels.some(l => l.includes('金币: 88,888')));
  assert.ok(labels.some(l => l.includes('点券: 66')));
});

test('ShopPanel: tab switching between buy, sell, and exchange modes', async () => {
  const { transport, persistence } = setupMockTransport();
  const coordinator = new ShopCoordinator(transport, persistence);
  coordinator.init({ sessionId: 's-1', sessionEpoch: 1, characterId: 'c-test' });

  const { panel } = createPanel(coordinator);
  await panel.open('sandbox-shop');

  assert.equal(panel.mode, 'buy');
  panel.switchMode('sell');
  assert.equal(panel.mode, 'sell');

  panel.switchMode('exchange');
  assert.equal(panel.mode, 'exchange');

  panel.switchMode('buy');
  assert.equal(panel.mode, 'buy');
});

test('ShopPanel: buy mode action updates coordinator state and displays success banner', async () => {
  const { transport, persistence } = setupMockTransport({ gold: '50000', points: '10' });
  const coordinator = new ShopCoordinator(transport, persistence);
  coordinator.init({ sessionId: 's-1', sessionEpoch: 1, characterId: 'c-test' });

  let successReported = null;
  const { panel, rootParent } = createPanel(coordinator, {
    onSuccess: (kind, msg) => { successReported = { kind, msg }; },
  });
  await panel.open('sandbox-shop');

  // Submit buy action
  await panel.submitCurrentAction();

  assert.equal(coordinator.state.status, 'ready');
  assert.ok(successReported !== null);
  assert.equal(successReported.kind, 'buy');
  assert.ok(successReported.msg.includes('购买成功'));

  const labels = collectAllLabels(rootParent);
  assert.ok(labels.some(l => l.includes('购买成功')));
});

test('ShopPanel: sell mode filters non-sellable items and executes recycling', async () => {
  const { transport, persistence } = setupMockTransport({ gold: '1000' });
  const coordinator = new ShopCoordinator(transport, persistence);
  coordinator.init({ sessionId: 's-1', sessionEpoch: 1, characterId: 'c-test' });

  let successReported = null;
  const customBackpack = [
    {
      id: 'item-junk-sword',
      name: '生锈的铁剑',
      kind: 'equipment',
      quality: 'white',
      quantity: 1,
      itemLevel: 1,
      accountBound: false,
      equipped: false,
      iconPath: 'icons/weapon_dual_blades_48',
      estimatedPrice: 200,
    },
    {
      id: 'item-equipped-ring',
      name: '传家戒指',
      kind: 'equipment',
      quality: 'purple',
      quantity: 1,
      itemLevel: 20,
      accountBound: false,
      equipped: true,
      iconPath: 'icons/ring_48',
      estimatedPrice: 9999,
    },
  ];

  const { panel, rootParent } = createPanel(coordinator, {
    backpackItemsProvider: () => customBackpack,
    onSuccess: (kind, msg) => { successReported = { kind, msg }; },
  });
  await panel.open('sandbox-shop');
  panel.switchMode('sell');

  const labelsBefore = collectAllLabels(rootParent);
  assert.ok(labelsBefore.some(l => l.includes('生锈的铁剑')));
  assert.ok(labelsBefore.some(l => l.includes('[已穿戴]')));

  // Execute sell
  await panel.submitCurrentAction();

  assert.equal(coordinator.state.status, 'ready');
  assert.ok(successReported !== null);
  assert.equal(successReported.kind, 'sell');
  assert.ok(successReported.msg.includes('出售成功'));
});

test('ShopPanel: exchange mode calculates 10,000:1 parity and switches directions', async () => {
  const { transport, persistence } = setupMockTransport({ gold: '50000', points: '20' });
  const coordinator = new ShopCoordinator(transport, persistence);
  coordinator.init({ sessionId: 's-1', sessionEpoch: 1, characterId: 'c-test' });

  let successReported = null;
  const { panel, rootParent } = createPanel(coordinator, {
    onSuccess: (kind, msg) => { successReported = { kind, msg }; },
  });
  await panel.open('sandbox-shop');
  panel.switchMode('exchange');

  const labels = collectAllLabels(rootParent);
  // Default is goldToPoints (1 unit = 10,000 gold -> 1 point)
  assert.ok(labels.some(l => l.includes('支付: 10,000 金币')));
  assert.ok(labels.some(l => l.includes('获得: 1 点券')));
  assert.ok(labels.some(l => l.includes('法定比率: 10,000 金币 ⇄ 1 点券')));

  // Execute exchange 1 unit (10,000 gold -> 1 point)
  await panel.submitCurrentAction();

  assert.equal(coordinator.state.status, 'ready');
  assert.ok(successReported !== null);
  assert.equal(successReported.kind, 'exchange');
  assert.ok(successReported.msg.includes('兑换成功'));
});

test('ShopPanel: hitTest accurately resolves interactive hotspots', async () => {
  const { transport, persistence } = setupMockTransport();
  const coordinator = new ShopCoordinator(transport, persistence);
  coordinator.init({ sessionId: 's-1', sessionEpoch: 1, characterId: 'c-test' });

  const { panel } = createPanel(coordinator);
  assert.equal(panel.hitTest(400, 226), null); // Closed returns null

  await panel.open('sandbox-shop');

  // Close buttons
  assert.equal(panel.hitTest(400, 226), 'close');
  assert.equal(panel.hitTest(-400, 226), 'close');

  // Tabs
  assert.equal(panel.hitTest(-260, 185), 'buyTab');
  assert.equal(panel.hitTest(-80, 185), 'sellTab');
  assert.equal(panel.hitTest(100, 185), 'exchangeTab');

  // Buy action button
  assert.equal(panel.hitTest(240, -110), 'buyAction');

  // Sell action button in sell mode
  panel.switchMode('sell');
  assert.equal(panel.hitTest(240, -110), 'sellAction');

  // Exchange action button in exchange mode
  panel.switchMode('exchange');
  assert.equal(panel.hitTest(0, -135), 'exchangeAction');
});

test('ShopPanel: unknown network state exposes recovery button and resolves cleanly', async () => {
  const saved = new Map();
  const persistence = {
    load: (k) => saved.get(k) ?? null,
    save: (k, v) => (v === null ? saved.delete(k) : saved.set(k, v)),
  };

  let dropped = false;
  const transport = {
    send: async (text) => {
      const r = JSON.parse(text);
      if (r.query === 'account.get') {
        return JSON.stringify({
          requestId: r.requestId,
          serverTime: Date.now(),
          versions: [{ kind: 'account', id: 'acc-test', version: 1 }],
          data: {
            characters: [{ characterId: 'c-test', classId: 'warrior', characterName: '狂战', level: 15 }],
            selectedCharacterId: 'c-test',
            wallet: { gold: '100000', points: '100' },
            activeChallengeId: null,
            openSceneChallengeId: null,
          },
        });
      }
      if (r.query === 'character.get') {
        return JSON.stringify({
          requestId: r.requestId,
          serverTime: Date.now(),
          versions: [{ kind: 'character', id: 'c-test', version: 1 }],
          data: {
            character: { characterId: 'c-test', classId: 'warrior', characterName: '狂战', level: 15 },
            version: 1,
            equipped: [],
            skills: [],
            attributes: [],
            location: { kind: 'town' },
            stamina: 308,
            staminaAsOf: 1,
          },
        });
      }
      if (r.command === 'shop.buy') {
        if (!dropped) {
          dropped = true;
          throw new Error('Network timeout');
        }
      }
      if (r.query === 'operation.get') {
        return JSON.stringify({
          requestId: r.requestId,
          serverTime: Date.now(),
          versions: [],
          data: {
            status: 'found',
            command: 'shop.buy',
            result: {
              operationId: r.payload.operationId,
              serverTime: Date.now(),
              replayed: true,
              outcome: {
                status: 'committed',
                resultVersions: [
                  { kind: 'character', id: 'c-test', version: 2 },
                  { kind: 'wallet', id: 'w-test', version: 2 },
                ],
                data: { deliveredQuantity: 1, sourceRef: 'offer_hp_potion_sm' },
              },
            },
          },
        });
      }
      return JSON.stringify({});
    },
  };

  const coordinator = new ShopCoordinator(transport, persistence);
  coordinator.init({ sessionId: 's-1', sessionEpoch: 1, characterId: 'c-test' });

  const { panel, rootParent } = createPanel(coordinator);
  await panel.open('sandbox-shop');

  // Attempt buy which drops network
  try {
    await panel.submitCurrentAction();
  } catch {}

  assert.equal(coordinator.state.status, 'unknown');
  assert.equal(panel.hitTest(260, -228), 'recover');

  const labels = collectAllLabels(rootParent);
  assert.ok(labels.some(l => l.includes('交易状态未决，请点击右侧确认结果恢复')));

  // Trigger recover
  await panel.recover();
  assert.equal(coordinator.state.status, 'ready');
});

test('ShopPanel: close and dispose cleanup safely', async () => {
  const { transport, persistence } = setupMockTransport();
  const coordinator = new ShopCoordinator(transport, persistence);
  coordinator.init({ sessionId: 's-1', sessionEpoch: 1, characterId: 'c-test' });

  let visibility = true;
  const { panel, rootParent } = createPanel(coordinator, {
    onVisibility: (v) => { visibility = v; },
  });
  await panel.open('sandbox-shop');
  assert.equal(panel.isOpen, true);

  panel.close();
  assert.equal(panel.isOpen, false);
  assert.equal(visibility, false);

  panel.destroy();
  assert.equal(rootParent.children.length, 1);
  assert.equal(rootParent.children[0].active, false);
});
