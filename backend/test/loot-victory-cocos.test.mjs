import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { loadTypeScript } = require('../../tools/local-typescript.cjs');
const tsPath = process.env.WORLD308_TYPESCRIPT || 'C:/ProgramData/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript';
const { ts } = loadTypeScript(tsPath);

class Node {
  constructor(name = '') {
    this.name = name;
    this.layer = 0;
    this.parent = null;
    this.children = [];
    this.components = [];
    this.active = true;
    this.position = { x: 0, y: 0, z: 0 };
    this.scale = { x: 1, y: 1, z: 1 };
    this.listeners = {};
  }
  addChild(child) {
    child.parent = this;
    this.children.push(child);
  }
  setPosition(x, y, z = 0) {
    this.position = { x, y, z };
  }
  setScale(x, y = 1, z = 1) {
    this.scale = { x, y, z };
  }
  addComponent(type) {
    const c = new type(this);
    this.components.push(c);
    return c;
  }
  getComponent(type) {
    return this.components.find(c => c instanceof type) ?? null;
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
  }
  clear() {}
  rect() {}
  roundRect() {}
  ellipse() {}
  moveTo() {}
  lineTo() {}
  close() {}
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
  fromHEX(hex) {
    return this;
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
}
Label.HorizontalAlign = { CENTER: 1 };
Label.VerticalAlign = { CENTER: 1 };
Label.Overflow = { SHRINK: 2 };

const ccStub = {
  Node,
  Graphics,
  Color,
  UITransform,
  Label,
};

const panelSource = readFileSync(new URL('../../client/assets/scripts/ui/LootVictoryPanel.ts', import.meta.url), 'utf8');
const panelTranspiled = ts.transpileModule(panelSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

const presSource = readFileSync(new URL('../../client/assets/scripts/ui/InventoryPresentation.ts', import.meta.url), 'utf8');
const presTranspiled = ts.transpileModule(presSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const presExports = {};
vm.runInNewContext(presTranspiled, {
  exports: presExports,
  require: name => (name === 'cc' ? ccStub : {}),
});

function createPanel() {
  const exp = {};
  const skinCalls = [];
  vm.runInNewContext(panelTranspiled, {
    exports: exp,
    require: name => {
      if (name === 'cc') return ccStub;
      if (name.includes('UISkin')) {
        return {
          skinSprite: (node, path, sliced = false) => {
            node._skin = path;
            node._skinSliced = !!sliced;
            skinCalls.push({ node, path, sliced: !!sliced });
            return {};
          },
        };
      }
      if (name.includes('InventoryPresentation')) return presExports;
      return {};
    },
    Date,
    Math,
    JSON,
  });
  const rootParent = new Node('SceneRoot');
  const panel = new exp.LootVictoryPanel(rootParent);
  return { panel, rootParent, skinCalls };
}

test('LootVictoryPanel initializes with correct hierarchy and default states', () => {
  const { panel, rootParent } = createPanel();
  const root = rootParent.children[0];
  assert.equal(root.name, 'AuthoritativeLootHUD');

  const victoryCard = root.children.find(c => c.name === 'VictoryCard');
  assert.ok(victoryCard);
  assert.equal(victoryCard.active, false);

  const collectPill = root.children.find(c => c.name === 'CollectPill');
  assert.ok(collectPill);

  const retryPill = root.children.find(c => c.name === 'RetryPill');
  assert.ok(retryPill);
  assert.equal(retryPill.active, false);
});

test('LootVictoryPanel hitTest accurately resolves collect, leave and retry hotzones', () => {
  const { panel } = createPanel();
  assert.equal(panel.hitTest(-285, 95), 'collect');
  assert.equal(panel.hitTest(-300, 95), 'collect');
  assert.equal(panel.hitTest(250, -100), 'leave');
  assert.equal(panel.hitTest(200, -100), 'leave');
  assert.equal(panel.hitTest(0, 105), 'retry');
  assert.equal(panel.hitTest(100, 105), 'retry');
  assert.equal(panel.hitTest(0, 0), null);
  assert.equal(panel.hitTest(400, 200), null);
});

test('LootVictoryPanel update reflects victory card, flip progress, and route text', () => {
  const { panel, rootParent } = createPanel();
  const root = rootParent.children[0];
  const victoryCard = root.children.find(c => c.name === 'VictoryCard');

  const mockScene = {
    hud: {
      drops: [],
      victory: {
        title: '通关胜利',
        elapsed: '01:23',
        kills: 5,
        gold: '150',
        xp: 200,
        equipment: '秋叶刀',
        routeMessage: '已放入背包',
      },
      flipProgress: 0.3,
      nearest: null,
      notice: '',
      fadeAlpha: 0,
    },
    terminal: { state: { status: 'ready' } },
    movement: { state: { status: 'idle' } },
    drops: { state: { status: 'idle' } },
    busy: false,
  };

  panel.update(mockScene);
  assert.equal(victoryCard.active, true);

  const equipSlot = victoryCard.children.find(c => c.name === 'EquipSlot');
  assert.ok(equipSlot);
  assert.ok(equipSlot.scale.x > 0);

  const equipLabel = equipSlot.children[0].getComponent(Label);
  assert.equal(equipLabel.string, '通关装备 · 翻牌中');

  mockScene.hud.flipProgress = 1.0;
  panel.update(mockScene);
  assert.equal(equipLabel.string, '秋叶刀');
});

test('LootVictoryPanel update displays retry pill on failure or unknown state', () => {
  const { panel, rootParent } = createPanel();
  const root = rootParent.children[0];
  const retryPill = root.children.find(c => c.name === 'RetryPill');

  const mockScene = {
    hud: {
      drops: [],
      victory: null,
      flipProgress: 0,
      nearest: null,
      notice: '网络延迟',
      fadeAlpha: 0,
    },
    terminal: { state: { status: 'ready' } },
    movement: { state: { status: 'unknown' } },
    drops: { state: { status: 'idle' } },
    busy: false,
  };

  panel.update(mockScene);
  assert.equal(retryPill.active, true);

  mockScene.movement.state.status = 'active';
  panel.update(mockScene);
  assert.equal(retryPill.active, false);
});

test('LootVictoryPanel renders pooled 48px icon slots with tiered quality borders and hides collected drops', () => {
  const { panel, rootParent, skinCalls } = createPanel();
  const root = rootParent.children[0];
  const slotsRoot = root.children.find(c => c.name === 'GroundDropSlots');
  assert.ok(slotsRoot);

  const mockScene = {
    hud: {
      drops: [
        { dropId: 1, x: -60000, y: 10000, name: 'Minor HP Potion ×2', color: '#b0bec5', near: true, templateId: 'item_hp_potion', quality: 'white', kind: 'stack' },
        { dropId: 2, x: 40000, y: 15000, name: 'Shadow Plate ×1', color: '#ab47bc', near: false, templateId: 'armor_chest_10', quality: 'purple', kind: 'equipment' },
        { dropId: 3, x: 90000, y: 5000, name: 'Twilight Blade ×1', color: '#ff9800', near: false, templateId: 'sword_of_dawn', quality: 'orange', kind: 'equipment' },
      ],
      victory: null,
      flipProgress: 0,
      nearest: { dropId: 1 },
      notice: '',
      fadeAlpha: 0,
    },
    terminal: { state: { status: 'active' } },
    movement: { state: { status: 'active' } },
    drops: { state: { status: 'active' } },
    busy: false,
  };

  panel.update(mockScene);
  assert.equal(slotsRoot.children.length, 3);

  const s0 = slotsRoot.children[0];
  assert.equal(s0.active, true);
  assert.equal(s0.position.x, -120);
  assert.ok(s0.scale.x > 1, 'nearest drop icon slot should subtly scale up');
  assert.equal(s0.children.find(c => c.name === 'Base')._skin, 'ui/slices/slot_grid_base');
  assert.equal(s0.children.find(c => c.name === 'Icon')._skin, 'icons/consumable_hp_potion_48');
  assert.equal(s0.children.find(c => c.name === 'Border')._skin, 'ui/slices/slot_border_rough');

  const s1 = slotsRoot.children[1];
  assert.equal(s1.active, true);
  assert.equal(s1.scale.x, 1);
  assert.equal(s1.children.find(c => c.name === 'Icon')._skin, 'icons/armor_chest_48');
  assert.equal(s1.children.find(c => c.name === 'Border')._skin, 'ui/slices/slot_border_unique');

  const s2 = slotsRoot.children[2];
  assert.equal(s2.children.find(c => c.name === 'Icon')._skin, 'icons/weapon_dual_blades_48');
  assert.equal(s2.children.find(c => c.name === 'Border')._skin, 'ui/slices/slot_border_' + presExports.QUALITY_STYLE.orange.border);

  // Re-updating unchanged items must reuse cached skins instead of re-invoking skinSprite
  const callsAfterFirst = skinCalls.length;
  panel.update(mockScene);
  assert.equal(skinCalls.length, callsAfterFirst);

  // Picking up 2 drops deactivates pooled slots instead of destroying nodes
  mockScene.hud.drops = [mockScene.hud.drops[1]];
  panel.update(mockScene);
  assert.equal(slotsRoot.children[0].active, true);
  assert.equal(slotsRoot.children[1].active, false);
  assert.equal(slotsRoot.children[2].active, false);
});
