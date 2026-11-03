import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { RankingCoordinator } from '../../client/assets/scripts/net/RankingCoordinator.ts';

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

// Transpile RankingPanel.ts
const panelSource = readFileSync(new URL('../../client/assets/scripts/ui/RankingPanel.ts', import.meta.url), 'utf8');
const trans = ts.transpileModule(panelSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
});

function loadRankingPanelClass() {
  const mod = { exports: {} };
  const exp = mod.exports;
  const context = vm.createContext({
    require: (id) => {
      if (id === 'cc') return ccStub;
      if (id.includes('RankingCoordinator')) return { RankingCoordinator };
      throw new Error(`Unexpected import: ${id}`);
    },
    module: mod,
    exports: exp,
    console,
    Date,
    Math,
    JSON,
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(trans.outputText, context);
  return mod.exports.RankingPanel;
}

const RankingPanel = loadRankingPanelClass();

function createMockRankingTransport(pagesByScope = {}) {
  return async (query) => {
    const { scope, cursor } = query.payload;
    const scopeData = pagesByScope[scope] || {
      firstPage: {
        entries: [],
        ownRank: null,
        rankAsOf: 1000,
        stale: false,
        nextCursor: null,
      },
    };

    if (cursor) {
      const pageData = scopeData.subsequentPages?.[cursor] || {
        entries: [],
        ownRank: scopeData.firstPage.ownRank,
        rankAsOf: 1000,
        stale: false,
        nextCursor: null,
      };
      return {
        requestId: query.requestId,
        serverTime: 1000,
        versions: [],
        data: pageData,
      };
    }

    return {
      requestId: query.requestId,
      serverTime: 1000,
      versions: [],
      data: scopeData.firstPage,
    };
  };
}

test('ST20-04: RankingCoordinator state machine and lifecycle (closed -> loading -> ready)', async () => {
  const transport = createMockRankingTransport({
    all: {
      firstPage: {
        entries: [
          {
            character: { characterId: 'c-1', classId: 'warrior', characterName: '战神', level: 30 },
            rank: 1,
            score: { basis: 'intrinsicEquipmentValue', value: '5000', scoreConfigRef: 'score-v1', equipmentVersion: 1, scoreReachedAt: 1000 },
          },
        ],
        ownRank: 1,
        rankAsOf: 2000,
        stale: false,
        nextCursor: 'cursor-page-2',
      },
    },
  });

  const coordinator = new RankingCoordinator(transport);
  assert.equal(coordinator.state.status, 'closed');
  assert.equal(coordinator.state.entries.length, 0);

  let notifiedStates = [];
  coordinator.subscribe(s => notifiedStates.push(s.status));

  await coordinator.open({ sessionId: 'sess-1', sessionEpoch: 1, characterId: 'c-1' }, 'all');

  assert.equal(coordinator.state.status, 'ready');
  assert.equal(coordinator.state.entries.length, 1);
  assert.equal(coordinator.state.ownRank, 1);
  assert.equal(coordinator.state.hasMore, true);
  assert.equal(coordinator.state.nextCursor, 'cursor-page-2');

  // Verify transition history: closed -> loading -> ready
  assert.ok(notifiedStates.includes('loading'));
  assert.ok(notifiedStates.includes('ready'));

  coordinator.close();
  assert.equal(coordinator.state.status, 'closed');
});

test('ST20-04: RankingCoordinator pagination with deduplication by characterId', async () => {
  const transport = createMockRankingTransport({
    all: {
      firstPage: {
        entries: [
          {
            character: { characterId: 'c-1', classId: 'warrior', characterName: '甲', level: 10 },
            rank: 1,
            score: { basis: 'intrinsicEquipmentValue', value: '5000', scoreConfigRef: 'score-v1', equipmentVersion: 1, scoreReachedAt: 1000 },
          },
          {
            character: { characterId: 'c-2', classId: 'hunter', characterName: '乙', level: 10 },
            rank: 2,
            score: { basis: 'intrinsicEquipmentValue', value: '4000', scoreConfigRef: 'score-v1', equipmentVersion: 1, scoreReachedAt: 1000 },
          },
        ],
        ownRank: 2,
        rankAsOf: 1000,
        stale: false,
        nextCursor: 'cur-2',
      },
      subsequentPages: {
        'cur-2': {
          entries: [
            // Duplicate c-2 (concurrent gear swap / shift)
            {
              character: { characterId: 'c-2', classId: 'hunter', characterName: '乙', level: 10 },
              rank: 3,
              score: { basis: 'intrinsicEquipmentValue', value: '3900', scoreConfigRef: 'score-v1', equipmentVersion: 1, scoreReachedAt: 1000 },
            },
            // New character c-3
            {
              character: { characterId: 'c-3', classId: 'warrior', characterName: '丙', level: 10 },
              rank: 4,
              score: { basis: 'intrinsicEquipmentValue', value: '3000', scoreConfigRef: 'score-v1', equipmentVersion: 1, scoreReachedAt: 1000 },
            },
          ],
          ownRank: 2,
          rankAsOf: 1200,
          stale: false,
          nextCursor: null,
        },
      },
    },
  });

  const coordinator = new RankingCoordinator(transport);
  await coordinator.open({ sessionId: 'sess-1', sessionEpoch: 1, characterId: 'c-2' });

  assert.equal(coordinator.state.entries.length, 2);
  assert.equal(coordinator.state.hasMore, true);

  await coordinator.loadMore();

  assert.equal(coordinator.state.status, 'ready');
  // Must deduplicate c-2! Total entries must be 3 (c-1, c-2, c-3), NOT 4!
  assert.equal(coordinator.state.entries.length, 3);
  assert.deepEqual(coordinator.state.entries.map(e => e.characterId), ['c-1', 'c-2', 'c-3']);
  assert.equal(coordinator.state.hasMore, false);
  assert.equal(coordinator.state.nextCursor, null);
});

test('ST20-04: RankingCoordinator generation isolation discards late-arriving packets', async () => {
  let resolveSlowQuery;
  const slowPromise = new Promise(res => { resolveSlowQuery = res; });

  const transport = async (query) => {
    if (query.payload.scope === 'warrior') {
      await slowPromise;
      return {
        requestId: query.requestId,
        serverTime: 1000,
        versions: [],
        data: {
          entries: [{
            character: { characterId: 'slow-w', classId: 'warrior', characterName: '迟到战士', level: 10 },
            rank: 1,
            score: { basis: 'intrinsicEquipmentValue', value: '9999', scoreConfigRef: 'score-v1', equipmentVersion: 1, scoreReachedAt: 1000 },
          }],
          ownRank: null,
          rankAsOf: 1000,
          stale: false,
          nextCursor: null,
        },
      };
    }
    return {
      requestId: query.requestId,
      serverTime: 1000,
      versions: [],
      data: {
        entries: [{
          character: { characterId: 'fast-h', classId: 'hunter', characterName: '快步猎人', level: 10 },
          rank: 1,
          score: { basis: 'intrinsicEquipmentValue', value: '8888', scoreConfigRef: 'score-v1', equipmentVersion: 1, scoreReachedAt: 1000 },
        }],
        ownRank: null,
        rankAsOf: 1000,
        stale: false,
        nextCursor: null,
      },
    };
  };

  const coordinator = new RankingCoordinator(transport);
  // Start slow warrior query
  const slowCall = coordinator.open({ sessionId: 's1', sessionEpoch: 1, characterId: 'c1' }, 'warrior');

  // Immediately switch scope to hunter (generation increments)
  await coordinator.switchScope('hunter');
  assert.equal(coordinator.state.scope, 'hunter');
  assert.equal(coordinator.state.entries[0].characterId, 'fast-h');

  // Now slow query finally finishes
  resolveSlowQuery();
  await slowCall;

  // Stale warrior response MUST be discarded! Current state must remain hunter
  assert.equal(coordinator.state.scope, 'hunter');
  assert.equal(coordinator.state.entries.length, 1);
  assert.equal(coordinator.state.entries[0].characterId, 'fast-h');
});

test('ST20-04: RankingCoordinator error handling and retry mechanism', async () => {
  let shouldFail = true;
  const transport = async (query) => {
    if (shouldFail) {
      throw new Error('NETWORK_TIMEOUT');
    }
    return {
      requestId: query.requestId,
      serverTime: 1000,
      versions: [],
      data: {
        entries: [{
          character: { characterId: 'c-ok', classId: 'warrior', characterName: '正常角色', level: 10 },
          rank: 1,
          score: { basis: 'intrinsicEquipmentValue', value: '3000', scoreConfigRef: 'score-v1', equipmentVersion: 1, scoreReachedAt: 1000 },
        }],
        ownRank: 1,
        rankAsOf: 1000,
        stale: false,
        nextCursor: null,
      },
    };
  };

  const coordinator = new RankingCoordinator(transport);
  await coordinator.open({ sessionId: 's1', sessionEpoch: 1, characterId: 'c1' });

  assert.equal(coordinator.state.status, 'failed');
  assert.equal(coordinator.state.errorCode, 'NETWORK_ERROR');

  // Recover transport
  shouldFail = false;
  await coordinator.retry();

  assert.equal(coordinator.state.status, 'ready');
  assert.equal(coordinator.state.entries.length, 1);
  assert.equal(coordinator.state.entries[0].characterId, 'c-ok');
});

test('ST20-04: RankingPanel initialization, UI rendering, own rank banner and freshness display', async () => {
  const transport = createMockRankingTransport({
    all: {
      firstPage: {
        entries: [
          {
            character: { characterId: 'c-1', classId: 'warrior', characterName: '冠军', level: 30 },
            rank: 1,
            score: { basis: 'intrinsicEquipmentValue', value: '5000', scoreConfigRef: 'score-v1', equipmentVersion: 1, scoreReachedAt: 1000 },
          },
          {
            character: { characterId: 'c-2', classId: 'hunter', characterName: '亚军', level: 25 },
            rank: 2,
            score: { basis: 'intrinsicEquipmentValue', value: '4500', scoreConfigRef: 'score-v1', equipmentVersion: 1, scoreReachedAt: 1000 },
          },
          {
            character: { characterId: 'c-3', classId: 'warrior', characterName: '季军', level: 20 },
            rank: 3,
            score: { basis: 'intrinsicEquipmentValue', value: '4000', scoreConfigRef: 'score-v1', equipmentVersion: 1, scoreReachedAt: 1000 },
          },
        ],
        ownRank: 2,
        rankAsOf: 1000,
        stale: true,
        nextCursor: null,
      },
    },
  });

  const parent = new Node('Parent');
  const coordinator = new RankingCoordinator(transport);
  let visibilityChanges = [];
  const panel = new RankingPanel(parent, coordinator, {
    onVisibility: v => visibilityChanges.push(v),
  });

  // Initially closed
  assert.equal(panel.isOpen, false);
  const root = parent.children[0];
  assert.equal(root.active, false);

  // Open panel
  await panel.open({ sessionId: 'sess-1', sessionEpoch: 1, characterId: 'c-2' });

  assert.equal(panel.isOpen, true);
  assert.equal(root.active, true);
  assert.equal(visibilityChanges[0], true);

  // Verify own rank banner
  const ownRankBanner = root.children.find(c => c.name === 'OwnRankBanner');
  assert.ok(ownRankBanner);
  const ownText = ownRankBanner.children
    .map(c => c.getComponent(Label)?.string)
    .filter(Boolean)
    .join(' ');
  assert.ok(ownText.includes('第 2 名'));

  // Verify freshness display
  const allLabels = [];
  function collectLabels(n) {
    for (const c of n.components) if (c instanceof Label) allLabels.push(c.string);
    for (const ch of n.children) collectLabels(ch);
  }
  collectLabels(root);
  assert.ok(allLabels.some(s => s.includes('缓存快照') || s.includes('15秒TTL')));

  // Close panel
  panel.close();
  assert.equal(panel.isOpen, false);
  assert.equal(root.active, false);
  assert.equal(visibilityChanges[1], false);

  panel.dispose();
  assert.equal(root.active, false);
});

test('ST20-04: RankingPanel scope tab switching updates UI and handles empty/degraded lists', async () => {
  const transport = createMockRankingTransport({
    all: {
      firstPage: {
        entries: [{
          character: { characterId: 'c-1', classId: 'warrior', characterName: '全服第一', level: 30 },
          rank: 1,
          score: { basis: 'intrinsicEquipmentValue', value: '5000', scoreConfigRef: 'score-v1', equipmentVersion: 1, scoreReachedAt: 1000 },
        }],
        ownRank: 1,
        rankAsOf: 1000,
        stale: false,
        nextCursor: null,
      },
    },
    hunter: {
      firstPage: {
        entries: [],
        ownRank: null, // warrior player viewing hunter scope
        rankAsOf: 1000,
        stale: false,
        nextCursor: null,
      },
    },
  });

  const parent = new Node('Parent');
  const coordinator = new RankingCoordinator(transport);
  const panel = new RankingPanel(parent, coordinator);

  await panel.open({ sessionId: 'sess-1', sessionEpoch: 1, characterId: 'c-1' }, 'all');
  assert.equal(panel.currentScope, 'all');

  // Switch to hunter scope
  await panel.switchScope('hunter');
  assert.equal(panel.currentScope, 'hunter');

  const root = parent.children[0];
  const allLabels = [];
  function collectLabels(n) {
    for (const c of n.components) if (c instanceof Label) allLabels.push(c.string);
    for (const ch of n.children) collectLabels(ch);
  }
  collectLabels(root);

  // Own rank in hunter scope must reflect unavailable / not participated
  assert.ok(allLabels.some(s => s.includes('暂不可用') || s.includes('未参与')));
  // Empty list message
  assert.ok(allLabels.some(s => s.includes('暂无上榜角色')));

  panel.dispose();
});
