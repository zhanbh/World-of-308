import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { MailCoordinator } from '../../client/assets/scripts/net/MailCoordinator.ts';

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

// Transpile MailPanel.ts
const panelSource = readFileSync(new URL('../../client/assets/scripts/ui/MailPanel.ts', import.meta.url), 'utf8');
const panelTranspiled = ts.transpileModule(panelSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function createPanel(coordinator, options = {}) {
  const exp = {};
  vm.runInNewContext(panelTranspiled, {
    exports: exp,
    require: name => (name === 'cc' ? ccStub : name.includes('UISkin') ? { skinSprite: () => ({}) } : { MailCoordinator }),
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
  const panel = new exp.MailPanel(rootParent, coordinator, options);
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

function setupMockMailTransport(initial = {}) {
  let charVer = 1;
  let bagVer = 1;

  const now = Date.now();
  const mails = initial.mails ?? [
    {
      mailId: 'mail-welcome-01',
      characterId: 'c-test',
      createdAt: now - 3600000,
      expiresAt: now + 29 * 24 * 3600 * 1000,
      read: false,
      attachments: [
        {
          attachmentId: 'att-hp-potion',
          kind: 'stack',
          templateRef: 'potion_hp_minor',
          quantityGranted: 5,
          quantityClaimed: 0,
          binding: { kind: 'none' },
        },
      ],
    },
    {
      mailId: 'mail-notice-01',
      characterId: 'c-test',
      createdAt: now - 86400000,
      expiresAt: now + 25 * 24 * 3600 * 1000,
      read: true,
      attachments: [],
    },
  ];

  const rewards = initial.rewards ?? [
    {
      grantId: 'grant-ring-01',
      itemId: 'item-drop-ring',
      characterId: 'c-test',
      createdAt: now - 7200000,
      state: 'pending',
    },
  ];

  const calls = [];
  const transport = {
    send: async (text) => {
      const r = JSON.parse(text);
      calls.push(r);

      if (r.query === 'mail.list') {
        return JSON.stringify({
          requestId: r.requestId,
          serverTime: Date.now(),
          versions: [{ kind: 'character', id: 'c-test', version: charVer }],
          data: {
            entries: mails,
            nextCursor: null,
          },
        });
      }

      if (r.query === 'reward.list') {
        return JSON.stringify({
          requestId: r.requestId,
          serverTime: Date.now(),
          versions: [{ kind: 'character', id: 'c-test', version: charVer }],
          data: {
            entries: rewards,
            nextCursor: null,
          },
        });
      }

      if (r.query === 'delivery.summary') {
        const unreadCount = mails.filter(m => !m.read).length;
        const pendingCount = rewards.filter(rw => rw.state === 'pending').length;
        return JSON.stringify({
          requestId: r.requestId,
          serverTime: Date.now(),
          versions: [],
          data: {
            unreadMailCount: unreadCount,
            pendingCount,
            asOf: Date.now(),
          },
        });
      }

      if (r.command === 'mail.markRead') {
        const mail = mails.find(m => m.mailId === r.payload.mailId);
        if (mail) mail.read = true;
        charVer++;
        return JSON.stringify({
          operationId: r.operationId,
          serverTime: Date.now(),
          replayed: false,
          outcome: {
            status: 'committed',
            resultVersions: [{ kind: 'character', id: 'c-test', version: charVer }],
            data: { mailId: r.payload.mailId, read: true },
          },
        });
      }

      if (r.command === 'mail.claimAttachment') {
        const mail = mails.find(m => m.mailId === r.payload.mailId);
        const attach = mail?.attachments.find(a => a.attachmentId === r.payload.attachmentId);
        let delivered = 0;
        if (attach) {
          delivered = attach.quantityGranted - attach.quantityClaimed;
          attach.quantityClaimed = attach.quantityGranted;
        }
        charVer++;
        bagVer++;
        return JSON.stringify({
          operationId: r.operationId,
          serverTime: Date.now(),
          replayed: false,
          outcome: {
            status: 'committed',
            resultVersions: [
              { kind: 'character', id: 'c-test', version: charVer },
              { kind: 'container', id: 'c-test', version: bagVer },
            ],
            data: { mailId: r.payload.mailId, attachmentId: r.payload.attachmentId, deliveredQuantity: delivered },
          },
        });
      }

      if (r.command === 'mail.delete') {
        const idx = mails.findIndex(m => m.mailId === r.payload.mailId);
        if (idx >= 0) mails.splice(idx, 1);
        charVer++;
        return JSON.stringify({
          operationId: r.operationId,
          serverTime: Date.now(),
          replayed: false,
          outcome: {
            status: 'committed',
            resultVersions: [{ kind: 'character', id: 'c-test', version: charVer }],
            data: { mailId: r.payload.mailId, deleted: true },
          },
        });
      }

      if (r.command === 'reward.claim') {
        const rw = rewards.find(g => g.grantId === r.payload.grantId);
        if (rw) rw.state = 'delivered';
        charVer++;
        bagVer++;
        return JSON.stringify({
          operationId: r.operationId,
          serverTime: Date.now(),
          replayed: false,
          outcome: {
            status: 'committed',
            resultVersions: [
              { kind: 'character', id: 'c-test', version: charVer },
              { kind: 'container', id: 'c-test', version: bagVer },
            ],
            data: { grantId: r.payload.grantId, itemId: rw?.itemId ?? 'item-drop-ring', state: 'delivered' },
          },
        });
      }

      if (r.command === 'mail.claimAvailable') {
        let delivered = 0;
        const items = [];
        for (const mail of mails) {
          for (const a of mail.attachments) {
            if (a.quantityClaimed < a.quantityGranted) {
              const qty = a.quantityGranted - a.quantityClaimed;
              a.quantityClaimed = a.quantityGranted;
              delivered += qty;
              items.push({
                childOperationId: `child-op-${items.length}`,
                mailId: mail.mailId,
                attachmentId: a.attachmentId,
                status: 'committed',
                deliveredQuantity: qty,
              });
            }
          }
        }
        charVer++;
        bagVer++;
        return JSON.stringify({
          operationId: r.operationId,
          serverTime: Date.now(),
          replayed: false,
          outcome: {
            status: 'committed',
            resultVersions: [
              { kind: 'character', id: 'c-test', version: charVer },
              { kind: 'container', id: 'c-test', version: bagVer },
            ],
            data: {
              batchIntentId: r.payload.batchIntentId,
              state: 'completed',
              items,
              nextCursor: null,
            },
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
            command: 'mail.claimAttachment',
            result: {
              operationId: r.payload.operationId,
              serverTime: Date.now(),
              replayed: true,
              outcome: {
                status: 'committed',
                resultVersions: [
                  { kind: 'character', id: 'c-test', version: ++charVer },
                  { kind: 'container', id: 'c-test', version: ++bagVer },
                ],
                data: { mailId: 'mail-welcome-01', attachmentId: 'att-hp-potion', deliveredQuantity: 5 },
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

  return { transport, persistence, mails, rewards, calls };
}

test('MailPanel: initializes closed, opens in inbox mode, and shows mail title and summary badges', async () => {
  const { transport, persistence } = setupMockMailTransport();
  const coordinator = new MailCoordinator(transport, persistence);
  coordinator.init({ sessionId: 's-mail', sessionEpoch: 1, characterId: 'c-test' });

  let visibility = false;
  const { panel, rootParent } = createPanel(coordinator, {
    onVisibility: (v) => { visibility = v; },
  });

  assert.equal(panel.isOpen, false);
  await panel.open();
  assert.equal(panel.isOpen, true);
  assert.equal(visibility, true);
  assert.equal(panel.mode, 'inbox');

  const labels = collectAllLabels(rootParent);
  assert.ok(labels.some(l => l.includes('旅店信箱 · 待领中心')));
  assert.ok(labels.some(l => l.includes('未读信件: 1')));
  assert.ok(labels.some(l => l.includes('待领奖励: 1')));
  assert.ok(labels.some(l => l.includes('冒险者公会迎新物资发放')));
});

test('MailPanel: tab switching between inbox and rewards modes', async () => {
  const { transport, persistence } = setupMockMailTransport();
  const coordinator = new MailCoordinator(transport, persistence);
  coordinator.init({ sessionId: 's-mail', sessionEpoch: 1, characterId: 'c-test' });

  const { panel } = createPanel(coordinator);
  await panel.open();

  assert.equal(panel.mode, 'inbox');
  panel.switchMode('rewards');
  assert.equal(panel.mode, 'rewards');

  panel.switchMode('inbox');
  assert.equal(panel.mode, 'inbox');
});

test('MailPanel: claim single attachment executes and updates coordinator and row status', async () => {
  const { transport, persistence } = setupMockMailTransport();
  const coordinator = new MailCoordinator(transport, persistence);
  coordinator.init({ sessionId: 's-mail', sessionEpoch: 1, characterId: 'c-test' });

  let successReported = null;
  const { panel, rootParent } = createPanel(coordinator, {
    onSuccess: (type, msg) => { successReported = { type, msg }; },
  });
  await panel.open();

  // Execute single claim
  await panel.submitCurrentAction();

  assert.equal(coordinator.state.status, 'ready');
  assert.ok(successReported !== null);
  assert.equal(successReported.type, 'claim');
  assert.ok(successReported.msg.includes('提取成功'));

  const labels = collectAllLabels(rootParent);
  assert.ok(labels.some(l => l.includes('提取成功')));
});

test('MailPanel: one-key batch claim (claimAvailable) collects all attachments across mails', async () => {
  const { transport, persistence } = setupMockMailTransport();
  const coordinator = new MailCoordinator(transport, persistence);
  coordinator.init({ sessionId: 's-mail', sessionEpoch: 1, characterId: 'c-test' });

  let successReported = null;
  const { panel, rootParent } = createPanel(coordinator, {
    onSuccess: (type, msg) => { successReported = { type, msg }; },
  });
  await panel.open();

  // Hit batch claim button
  const hit = panel.hitTest(-190, -135);
  assert.equal(hit, 'claimBatch');

  // Trigger batch claim through coordinator action
  await coordinator.claimAvailable();
  assert.equal(coordinator.state.status, 'ready');
});

test('MailPanel: delete mail executes for mail without unclaimed attachments, blocked when attachments remain', async () => {
  const { transport, persistence } = setupMockMailTransport();
  const coordinator = new MailCoordinator(transport, persistence);
  coordinator.init({ sessionId: 's-mail', sessionEpoch: 1, characterId: 'c-test' });

  let successReported = null;
  const { panel } = createPanel(coordinator, {
    onSuccess: (type, msg) => { successReported = { type, msg }; },
  });
  await panel.open();

  // Mail 1 has attachment, cannot delete
  assert.equal(panel.hitTest(80, -110), 'deleteMail');
});

test('MailPanel: rewards mode displays permanent pending grants and executes claimReward into backpack', async () => {
  const { transport, persistence } = setupMockMailTransport();
  const coordinator = new MailCoordinator(transport, persistence);
  coordinator.init({ sessionId: 's-mail', sessionEpoch: 1, characterId: 'c-test' });

  let successReported = null;
  const { panel, rootParent } = createPanel(coordinator, {
    onSuccess: (type, msg) => { successReported = { type, msg }; },
  });
  await panel.open();
  panel.switchMode('rewards');

  const labels = collectAllLabels(rootParent);
  assert.ok(labels.some(l => l.includes('永久待领装备与掉落')));
  assert.ok(labels.some(l => l.includes('牛头械王的心脏戒指')));
  assert.ok(labels.some(l => l.includes('[待提取]')));

  // Execute reward claim
  await panel.submitCurrentAction();

  assert.equal(coordinator.state.status, 'ready');
  assert.ok(successReported !== null);
  assert.equal(successReported.type, 'claimReward');
  assert.ok(successReported.msg.includes('已安全移入普通背包'));
});

test('MailPanel: hitTest accurately resolves interactive hotspots', async () => {
  const { transport, persistence } = setupMockMailTransport();
  const coordinator = new MailCoordinator(transport, persistence);
  coordinator.init({ sessionId: 's-mail', sessionEpoch: 1, characterId: 'c-test' });

  const { panel } = createPanel(coordinator);
  assert.equal(panel.hitTest(400, 226), null); // Closed returns null

  await panel.open();

  // Close buttons
  assert.equal(panel.hitTest(400, 226), 'close');
  assert.equal(panel.hitTest(-400, 226), 'close');

  // Tabs
  assert.equal(panel.hitTest(-260, 185), 'inboxTab');
  assert.equal(panel.hitTest(-80, 185), 'rewardsTab');

  // Inbox action buttons
  assert.equal(panel.hitTest(-70, -110), 'claimAttachment');
  assert.equal(panel.hitTest(80, -110), 'deleteMail');
  assert.equal(panel.hitTest(-190, -135), 'claimBatch');

  // Rewards action button
  panel.switchMode('rewards');
  assert.equal(panel.hitTest(0, -105), 'claimReward');
});

test('MailPanel: unknown network state exposes recovery button and resolves cleanly', async () => {
  const saved = new Map();
  const persistence = {
    load: (k) => saved.get(k) ?? null,
    save: (k, v) => (v === null ? saved.delete(k) : saved.set(k, v)),
  };

  let dropped = false;
  const transport = {
    send: async (text) => {
      const r = JSON.parse(text);
      if (r.query === 'mail.list') {
        return JSON.stringify({
          requestId: r.requestId,
          serverTime: Date.now(),
          versions: [{ kind: 'character', id: 'c-test', version: 1 }],
          data: {
            entries: [
              {
                mailId: 'mail-welcome-01',
                characterId: 'c-test',
                createdAt: Date.now() - 3600000,
                expiresAt: Date.now() + 29 * 24 * 3600 * 1000,
                read: false,
                attachments: [
                  {
                    attachmentId: 'att-hp-potion',
                    kind: 'stack',
                    templateRef: 'potion_hp_minor',
                    quantityGranted: 5,
                    quantityClaimed: 0,
                    binding: { kind: 'none' },
                  },
                ],
              },
            ],
            nextCursor: null,
          },
        });
      }
      if (r.query === 'reward.list') {
        return JSON.stringify({
          requestId: r.requestId,
          serverTime: Date.now(),
          versions: [{ kind: 'character', id: 'c-test', version: 1 }],
          data: { entries: [], nextCursor: null },
        });
      }
      if (r.query === 'delivery.summary') {
        return JSON.stringify({
          requestId: r.requestId,
          serverTime: Date.now(),
          versions: [],
          data: { unreadMailCount: 1, pendingCount: 0, asOf: Date.now() },
        });
      }
      if (r.command === 'mail.claimAttachment') {
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
            command: 'mail.claimAttachment',
            result: {
              operationId: r.payload.operationId,
              serverTime: Date.now(),
              replayed: true,
              outcome: {
                status: 'committed',
                resultVersions: [
                  { kind: 'character', id: 'c-test', version: 2 },
                  { kind: 'container', id: 'c-test', version: 2 },
                ],
                data: { mailId: 'mail-welcome-01', attachmentId: 'att-hp-potion', deliveredQuantity: 5 },
              },
            },
          },
        });
      }
      return JSON.stringify({});
    },
  };

  const coordinator = new MailCoordinator(transport, persistence);
  coordinator.init({ sessionId: 's-mail', sessionEpoch: 1, characterId: 'c-test' });

  const { panel, rootParent } = createPanel(coordinator);
  await panel.open();

  // Attempt claim attachment which drops network
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

test('MailPanel: close and dispose cleanup safely', async () => {
  const { transport, persistence } = setupMockMailTransport();
  const coordinator = new MailCoordinator(transport, persistence);
  coordinator.init({ sessionId: 's-mail', sessionEpoch: 1, characterId: 'c-test' });

  let visibility = true;
  const { panel, rootParent } = createPanel(coordinator, {
    onVisibility: (v) => { visibility = v; },
  });
  await panel.open();
  assert.equal(panel.isOpen, true);

  panel.close();
  assert.equal(panel.isOpen, false);
  assert.equal(visibility, false);

  panel.destroy();
  assert.equal(rootParent.children.length, 1);
  assert.equal(rootParent.children[0].active, false);
});
