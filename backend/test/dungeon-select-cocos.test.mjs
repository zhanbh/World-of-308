import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { ChallengeEntryCoordinator } from '../../client/assets/scripts/net/ChallengeEntryCoordinator.ts';

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

// Transpile DungeonSelectPanel.ts
const panelSource = readFileSync(new URL('../../client/assets/scripts/ui/DungeonSelectPanel.ts', import.meta.url), 'utf8');
const panelTranspiled = ts.transpileModule(panelSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function createMockEnvironment(customOptions = {}) {
  const characterId = 'warrior-player-1';
  let charVersion = 1;
  const storage = new Map();
  const persistence = {
    load: k => storage.get(k) ?? null,
    save: (k, v) => (v === null ? storage.delete(k) : storage.set(k, v)),
  };

  let stamina = customOptions.stamina ?? 308;
  let hasWeapon = customOptions.hasWeapon ?? true;
  let isWeaponBroken = customOptions.isWeaponBroken ?? false;
  let serverUnknownOnce = customOptions.serverUnknownOnce ?? false;

  const sentMessages = [];

  const transport = {
    send: async (text) => {
      const msg = JSON.parse(text);
      sentMessages.push(msg);

      if ('query' in msg && msg.query === 'dungeon.entry') {
        let canEnter = true;
        let reason = null;
        if (!hasWeapon) {
          canEnter = false;
          reason = 'WEAPON_REQUIRED';
        } else if (isWeaponBroken) {
          canEnter = false;
          reason = 'WEAPON_BROKEN';
        } else if (stamina < 1) {
          canEnter = false;
          reason = 'STAMINA_NOT_ENOUGH';
        }

        const dungeonId = msg.payload.dungeonId;
        const entryContext = `ctx-${dungeonId}-${Date.now()}`;

        return JSON.stringify({
          requestId: msg.requestId,
          serverTime: Date.now(),
          versions: [{ kind: 'container', id: characterId, version: charVersion }],
          data: {
            dungeonId,
            entryContext,
            locationRevision: 1,
            options: [
              { difficultyId: 'normal', unlocked: true, canEnter, reason },
              { difficultyId: 'adventure', unlocked: true, canEnter, reason },
              { difficultyId: 'warrior', unlocked: true, canEnter, reason },
            ],
          },
        });
      }

      if ('command' in msg && msg.command === 'challenge.start') {
        if (serverUnknownOnce) {
          serverUnknownOnce = false;
          return JSON.stringify({
            protocolVersion: 2,
            operationId: msg.operationId,
            serverTime: Date.now(),
            replayed: false,
            command: 'challenge.start',
            outcome: {
              status: 'unknown',
              code: 'RESULT_UNKNOWN',
            },
          });
        }

        const dungeonId = msg.payload.dungeonId;
        const difficultyId = msg.payload.difficultyId;
        const monsterLevel = difficultyId === 'warrior' ? 15 : (difficultyId === 'adventure' ? 10 : 5);

        return JSON.stringify({
          protocolVersion: 2,
          operationId: msg.operationId,
          serverTime: Date.now(),
          replayed: false,
          command: 'challenge.start',
          outcome: {
            status: 'committed',
            resultVersions: [{ kind: 'container', id: characterId, version: ++charVersion }],
            data: {
              challengeId: `ch-${dungeonId}-${Date.now()}`,
              configRef: `cfg-${dungeonId}`,
              playerLevel: 1,
              staminaSnapshot: stamina > 0 ? stamina : 1,
              monsterLevel,
              monsterStatsRef: `stats-${dungeonId}-${difficultyId}`,
              equipmentSourceRef: `drops-${dungeonId}-${difficultyId}`,
              equipmentVersion: 1,
              equipmentAttributes: [],
              acceptedSeq: 1,
              acceptedTick: 0,
            },
          },
        });
      }

      return JSON.stringify({ status: 'ok' });
    },
  };

  const coordinator = new ChallengeEntryCoordinator(transport, persistence);
  coordinator.init({
    sessionId: 'sandbox-challenge-session',
    sessionEpoch: 1,
    characterId,
    rolePlayEpoch: 1,
  });

  return {
    coordinator,
    sentMessages,
    getStamina: () => stamina,
    setStamina: v => { stamina = v; },
    getHasWeapon: () => hasWeapon,
    setHasWeapon: v => { hasWeapon = v; },
    getIsWeaponBroken: () => isWeaponBroken,
    setIsWeaponBroken: v => { isWeaponBroken = v; },
  };
}

function instantiatePanel(coordinator, options = {}) {
  const rootParent = new Node('Canvas');
  const exp = {};
  vm.runInNewContext(panelTranspiled, {
    exports: exp,
    require: name => (name === 'cc' ? ccStub : name.includes('UISkin') ? { skinSprite: () => ({}) } : { ChallengeEntryCoordinator }),
    Date,
    setTimeout,
    structuredClone,
    JSON,
    BigInt,
    Math,
    Number,
    Boolean,
    String,
    Map,
    Array,
    Object,
    Error,
    console,
  });

  const panel = new exp.DungeonSelectPanel(rootParent, coordinator, options);
  return { panel, rootParent };
}

test('DungeonSelectPanel: basic layout, 9-patch frame, title, stamina pill, and cards hierarchy', async () => {
  const env = createMockEnvironment();
  const { panel, rootParent } = instantiatePanel(env.coordinator, {
    getStamina: env.getStamina,
    hasWeapon: env.getHasWeapon,
    isWeaponBroken: env.getIsWeaponBroken,
  });

  assert.equal(rootParent.children.length, 1);
  const panelNode = rootParent.children[0];
  assert.equal(panelNode.name, 'DungeonSelectPanel');
  assert.equal(panel.isOpen, false);

  // Check key children nodes
  const frame = panelNode.children.find(c => c.name === 'WindowFrame');
  assert.ok(frame, 'WindowFrame node exists');

  const leftWell = panelNode.children.find(c => c.name === 'LeftDungeonListWell');
  assert.ok(leftWell, 'LeftDungeonListWell node exists');

  const rightWell = panelNode.children.find(c => c.name === 'RightDetailWell');
  assert.ok(rightWell, 'RightDetailWell node exists');

  const cardFirst = panelNode.children.find(c => c.name === 'DungeonCard_first');
  const cardWorkshop = panelNode.children.find(c => c.name === 'DungeonCard_workshop');
  const cardRift = panelNode.children.find(c => c.name === 'DungeonCard_rift');
  assert.ok(cardFirst, 'Card first exists');
  assert.ok(cardWorkshop, 'Card workshop exists');
  assert.ok(cardRift, 'Card rift exists');

  const tabNormal = panelNode.children.find(c => c.name === 'DiffTab_normal');
  const tabAdv = panelNode.children.find(c => c.name === 'DiffTab_adventure');
  const tabWarrior = panelNode.children.find(c => c.name === 'DiffTab_warrior');
  assert.ok(tabNormal, 'DiffTab normal exists');
  assert.ok(tabAdv, 'DiffTab adventure exists');
  assert.ok(tabWarrior, 'DiffTab warrior exists');
});

test('DungeonSelectPanel: open queries dungeon.entry and updates options', async () => {
  const env = createMockEnvironment({ stamina: 250 });
  let visibilityNotified = null;
  const { panel } = instantiatePanel(env.coordinator, {
    getStamina: env.getStamina,
    hasWeapon: env.getHasWeapon,
    isWeaponBroken: env.getIsWeaponBroken,
    onVisibility: v => { visibilityNotified = v; },
  });

  await panel.open('first');
  assert.equal(panel.isOpen, true);
  assert.equal(visibilityNotified, true);

  // Check query sent
  assert.equal(env.sentMessages.length, 1);
  assert.equal(env.sentMessages[0].query, 'dungeon.entry');
  assert.equal(env.sentMessages[0].payload.dungeonId, 'first');

  // Coordinator state updated
  assert.equal(env.coordinator.state.status, 'choosing');
  assert.equal(env.coordinator.state.selection.dungeonId, 'first');
  assert.equal(env.coordinator.state.selection.options[0].canEnter, true);
});

test('DungeonSelectPanel: switching dungeon queries new dungeon entry', async () => {
  const env = createMockEnvironment();
  const { panel, rootParent } = instantiatePanel(env.coordinator, {
    getStamina: env.getStamina,
    hasWeapon: env.getHasWeapon,
    isWeaponBroken: env.getIsWeaponBroken,
  });

  await panel.open('first');
  assert.equal(env.sentMessages.length, 1);
  assert.equal(env.sentMessages[0].payload.dungeonId, 'first');

  // Click card workshop
  const panelNode = rootParent.children[0];
  const cardWorkshop = panelNode.children.find(c => c.name === 'DungeonCard_workshop');
  cardWorkshop.emit('touch-start');
  cardWorkshop.emit('touch-end');

  // Give microtask tick
  await new Promise(r => setTimeout(r, 10));

  assert.equal(env.sentMessages.length, 2);
  assert.equal(env.sentMessages[1].payload.dungeonId, 'workshop');
  assert.equal(env.coordinator.state.selection.dungeonId, 'workshop');
});

test('DungeonSelectPanel: difficulty selection updates state', async () => {
  const env = createMockEnvironment();
  const { panel, rootParent } = instantiatePanel(env.coordinator, {
    getStamina: env.getStamina,
    hasWeapon: env.getHasWeapon,
    isWeaponBroken: env.getIsWeaponBroken,
  });

  await panel.open('first');
  const panelNode = rootParent.children[0];
  const tabWarrior = panelNode.children.find(c => c.name === 'DiffTab_warrior');

  tabWarrior.emit('touch-start');
  tabWarrior.emit('touch-end');

  assert.equal(panel.hitTest(330, -6), 'diff_warrior');
});

test('DungeonSelectPanel: gatekeeper checks - 0 stamina blocks entry and displays human-readable warning', async () => {
  const env = createMockEnvironment({ stamina: 0 });
  const { panel, rootParent } = instantiatePanel(env.coordinator, {
    getStamina: env.getStamina,
    hasWeapon: env.getHasWeapon,
    isWeaponBroken: env.getIsWeaponBroken,
  });

  await panel.open('first');
  assert.equal(env.coordinator.state.selection.options[0].canEnter, false);
  assert.equal(env.coordinator.state.selection.options[0].reason, 'STAMINA_NOT_ENOUGH');

  // Verify labels contain warning
  const panelNode = rootParent.children[0];
  const labels = panelNode.children.map(c => c.getComponent(Label)).filter(Boolean);
  const staminaLabel = labels.find(l => l.string.includes('疲劳需求') && l.string.includes('疲劳不足'));
  assert.ok(staminaLabel, 'Found stamina deficiency warning label');

  const gateLabel = labels.find(l => l.string.includes('拦截进入') && l.string.includes('疲劳值不足'));
  assert.ok(gateLabel, 'Found gatekeeper rejection label for stamina');
});

test('DungeonSelectPanel: gatekeeper checks - missing weapon blocks entry', async () => {
  const env = createMockEnvironment({ hasWeapon: false });
  const { panel, rootParent } = instantiatePanel(env.coordinator, {
    getStamina: env.getStamina,
    hasWeapon: env.getHasWeapon,
    isWeaponBroken: env.getIsWeaponBroken,
  });

  await panel.open('first');
  assert.equal(env.coordinator.state.selection.options[0].canEnter, false);
  assert.equal(env.coordinator.state.selection.options[0].reason, 'WEAPON_REQUIRED');

  const panelNode = rootParent.children[0];
  const labels = panelNode.children.map(c => c.getComponent(Label)).filter(Boolean);
  const weaponLabel = labels.find(l => l.string.includes('未装备武器'));
  assert.ok(weaponLabel, 'Found missing weapon warning label');
});

test('DungeonSelectPanel: gatekeeper checks - broken weapon (0 durability) blocks entry', async () => {
  const env = createMockEnvironment({ isWeaponBroken: true });
  const { panel, rootParent } = instantiatePanel(env.coordinator, {
    getStamina: env.getStamina,
    hasWeapon: env.getHasWeapon,
    isWeaponBroken: env.getIsWeaponBroken,
  });

  await panel.open('first');
  assert.equal(env.coordinator.state.selection.options[0].canEnter, false);
  assert.equal(env.coordinator.state.selection.options[0].reason, 'WEAPON_BROKEN');

  const panelNode = rootParent.children[0];
  const labels = panelNode.children.map(c => c.getComponent(Label)).filter(Boolean);
  const brokenLabel = labels.find(l => l.string.includes('武器已损坏') || l.string.includes('0耐久'));
  assert.ok(brokenLabel, 'Found broken weapon warning label');
});

test('DungeonSelectPanel: confirming start sends challenge.start and triggers onStart callback', async () => {
  const env = createMockEnvironment({ stamina: 308 });
  let startedInfo = null;

  const { panel, rootParent } = instantiatePanel(env.coordinator, {
    getStamina: env.getStamina,
    hasWeapon: env.getHasWeapon,
    isWeaponBroken: env.getIsWeaponBroken,
    onStart: (dungeonId, difficultyId, startData) => {
      startedInfo = { dungeonId, difficultyId, startData };
    },
  });

  await panel.open('first');
  assert.equal(panel.isOpen, true);

  // Trigger start button click
  const panelNode = rootParent.children[0];
  const startBtn = panelNode.children.find(c => c.name.startsWith('Btn_开启挑战'));
  assert.ok(startBtn, 'Start button found');

  startBtn.emit('touch-start');
  startBtn.emit('touch-end');

  await new Promise(r => setTimeout(r, 20));

  assert.equal(env.sentMessages.length, 2);
  assert.equal(env.sentMessages[1].command, 'challenge.start');
  assert.equal(env.sentMessages[1].payload.dungeonId, 'first');
  assert.equal(env.sentMessages[1].payload.difficultyId, 'normal');

  assert.ok(startedInfo, 'onStart callback fired');
  assert.equal(startedInfo.dungeonId, 'first');
  assert.equal(startedInfo.difficultyId, 'normal');
  assert.equal(startedInfo.startData.staminaSnapshot, 308);
  assert.equal(panel.isOpen, false); // closed on success
});

test('DungeonSelectPanel: unknown state presents retry button and recovers on retry', async () => {
  const env = createMockEnvironment({ serverUnknownOnce: true });
  let startedInfo = null;

  const { panel, rootParent } = instantiatePanel(env.coordinator, {
    getStamina: env.getStamina,
    hasWeapon: env.getHasWeapon,
    isWeaponBroken: env.getIsWeaponBroken,
    onStart: (dungeonId, difficultyId, startData) => {
      startedInfo = { dungeonId, difficultyId, startData };
    },
  });

  await panel.open('first');

  const panelNode = rootParent.children[0];
  const startBtn = panelNode.children.find(c => c.name.startsWith('Btn_开启挑战'));
  startBtn.emit('touch-start');
  startBtn.emit('touch-end');

  await new Promise(r => setTimeout(r, 20));

  // Coordinator entered 'unknown'
  assert.equal(env.coordinator.state.status, 'unknown');
  assert.equal(panel.isOpen, true);

  // Recover button should now be active
  const recoverBtn = panelNode.children.find(c => c.name.startsWith('Btn_状态恢复'));
  assert.ok(recoverBtn.active, 'Recover button is visible and active');

  // Trigger recover click
  recoverBtn.emit('touch-start');
  recoverBtn.emit('touch-end');

  await new Promise(r => setTimeout(r, 20));

  assert.ok(startedInfo, 'onStart triggered upon recovery');
  assert.equal(startedInfo.dungeonId, 'first');
  assert.equal(startedInfo.difficultyId, 'normal');
  assert.equal(panel.isOpen, false);
});

test('DungeonSelectPanel: hitTest accurate mapping for touch and click coordinates', async () => {
  const env = createMockEnvironment();
  const { panel } = instantiatePanel(env.coordinator, {
    getStamina: env.getStamina,
    hasWeapon: env.getHasWeapon,
    isWeaponBroken: env.getIsWeaponBroken,
  });

  // Closed panel returns null
  assert.equal(panel.hitTest(0, 0), null);

  await panel.open('first');

  // Close buttons
  assert.equal(panel.hitTest(390, 226), 'close');
  assert.equal(panel.hitTest(-390, 226), 'close');

  // Dungeon cards
  assert.equal(panel.hitTest(-245, 95), 'dungeon_first');
  assert.equal(panel.hitTest(-245, -5), 'dungeon_workshop');
  assert.equal(panel.hitTest(-245, -105), 'dungeon_rift');

  // Difficulty tabs
  assert.equal(panel.hitTest(70, -6), 'diff_normal');
  assert.equal(panel.hitTest(200, -6), 'diff_adventure');
  assert.equal(panel.hitTest(330, -6), 'diff_warrior');

  // Start button
  assert.equal(panel.hitTest(200, -145), 'start');

  // Empty space
  assert.equal(panel.hitTest(0, 200), null);
});

test('DungeonSelectPanel: close and dispose cleanup safely', async () => {
  const env = createMockEnvironment();
  let visibility = null;
  const { panel, rootParent } = instantiatePanel(env.coordinator, {
    getStamina: env.getStamina,
    hasWeapon: env.getHasWeapon,
    isWeaponBroken: env.getIsWeaponBroken,
    onVisibility: v => { visibility = v; },
  });

  await panel.open('first');
  assert.equal(panel.isOpen, true);
  assert.equal(visibility, true);

  panel.close();
  assert.equal(panel.isOpen, false);
  assert.equal(visibility, false);

  panel.dispose();
  assert.equal(rootParent.children.length, 1);
  assert.equal(rootParent.children[0].active, false);
});
