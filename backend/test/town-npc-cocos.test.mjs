import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { loadTypeScript } = require('../../tools/local-typescript.cjs');
const tsPath = process.env.WORLD308_TYPESCRIPT || 'C:/ProgramData/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript';
const { ts } = loadTypeScript(tsPath);

class UITransform {
  constructor() {
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
    this.horizontalAlign = 0;
    this.verticalAlign = 0;
    this.overflow = 0;
    this.color = null;
  }
}
Label.HorizontalAlign = { CENTER: 1 };
Label.VerticalAlign = { CENTER: 1 };
Label.Overflow = { SHRINK: 2 };

class Graphics {
  constructor(node) {
    this.node = node;
    this.fillColor = null;
    this.strokeColor = null;
    this.lineWidth = 1;
    this.rects = [];
    this.ellipses = [];
    this.circles = [];
    this.moves = [];
  }
  clear() {
    this.rects.length = 0;
    this.ellipses.length = 0;
    this.circles.length = 0;
    this.moves.length = 0;
  }
  rect(x, y, w, h) { this.rects.push({ x, y, w, h }); }
  ellipse(x, y, rx, ry) { this.ellipses.push({ x, y, rx, ry }); }
  circle(x, y, r) { this.circles.push({ x, y, r }); }
  moveTo(x, y) { this.moves.push({ x, y }); }
  lineTo() {}
  close() {}
  fill() {}
  stroke() {}
}

class Node {
  constructor(name = '') {
    this.name = name;
    this.layer = 0;
    this.active = true;
    this.destroyed = false;
    this.children = [];
    this.components = new Map();
    this.x = 0;
    this.y = 0;
    this.scale = { x: 1, y: 1, z: 1 };
  }
  addChild(n) { this.children.push(n); }
  setPosition(x, y) { this.x = x; this.y = y; }
  setScale(x, y, z) { this.scale = { x, y, z }; }
  addComponent(ctor) {
    const inst = new ctor(this);
    this.components.set(ctor, inst);
    return inst;
  }
  getComponent(ctor) { return this.components.get(ctor) ?? null; }
  destroy() {
    this.active = false;
    this.destroyed = true;
  }
}

class Color {
  constructor(r = 255, g = 255, b = 255, a = 255) {
    this.r = r;
    this.g = g;
    this.b = b;
    this.a = a;
  }
  fromHEX(hex) {
    const clean = hex.replace('#', '');
    this.r = parseInt(clean.slice(0, 2), 16) || 0;
    this.g = parseInt(clean.slice(2, 4), 16) || 0;
    this.b = parseInt(clean.slice(4, 6), 16) || 0;
    return this;
  }
}

const ccStub = { Node, Graphics, Color, Label, UITransform };

const source = readFileSync(new URL('../../client/assets/scripts/ui/TownNPCHUD.ts', import.meta.url), 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function createHud() {
  const exp = {};
  const skinCalls = [];
  vm.runInNewContext(transpiled, {
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
      return {};
    },
    Math,
  });
  const canvas = new Node('Canvas');
  const hud = new exp.TownNPCHUD(canvas);
  return { hud, canvas, exp, skinCalls };
}

test('TownNPCHUD aligns containers to 2x world coordinates and skins 48px service badges', () => {
  const { canvas, exp } = createHud();
  const root = canvas.children[0];
  assert.equal(root.name, 'TownNPCHUD');
  assert.equal(root.children.length, exp.TOWN_NPCS.length);

  const expectedX = {
    repair: -300,
    shop: -160,
    enhancement: -20,
    mail: 100,
    bank: 240,
    portal: 396,
  };
  for (const spec of exp.TOWN_NPCS) {
    const npcNode = root.children.find(c => c.name === `NPC_${spec.id}`);
    assert.ok(npcNode, `missing container for ${spec.id}`);
    assert.equal(npcNode.x, expectedX[spec.id]);

    const badge = npcNode.children.find(c => c.name === 'ServiceBadge');
    assert.ok(badge);
    assert.equal(badge.children.find(c => c.name === 'Base')._skin, 'ui/slices/slot_grid_base');
    assert.equal(badge.children.find(c => c.name === 'Icon')._skin, `icons/${spec.iconStem}_48`);
    assert.equal(badge.children.find(c => c.name === 'Border')._skin, `ui/slices/slot_border_${spec.border}`);

    const pill = npcNode.children.find(c => c.name === 'PromptPill');
    assert.ok(pill);
    assert.equal(pill._skin, 'ui/slices/button_normal');
    assert.equal(pill.active, false);
  }
});

test('TownNPCHUD reveals only the nearest NPC prompt pill and boosts badge scale', () => {
  const { hud, canvas } = createHud();
  const root = canvas.children[0];

  hud.update(1.0, -148, 10);
  const repairNode = root.children.find(c => c.name === 'NPC_repair');
  const shopNode = root.children.find(c => c.name === 'NPC_shop');
  assert.equal(repairNode.children.find(c => c.name === 'PromptPill').active, true);
  assert.equal(repairNode.children.find(c => c.name === 'ServiceBadge').scale.x, 1.15);
  assert.equal(shopNode.children.find(c => c.name === 'PromptPill').active, false);
  assert.equal(shopNode.children.find(c => c.name === 'ServiceBadge').scale.x, 1);

  hud.update(1.5, -78, 10);
  assert.equal(repairNode.children.find(c => c.name === 'PromptPill').active, false);
  assert.equal(shopNode.children.find(c => c.name === 'PromptPill').active, true);

  hud.update(2.0, 180, 10);
  assert.equal(root.children.find(c => c.name === 'NPC_portal').children.find(c => c.name === 'PromptPill').active, true);
});

test('TownNPCHUD hitTest dispatches 2x Canvas taps and respects visibility', () => {
  const { hud } = createHud();
  assert.equal(hud.hitTest(-300, 10), 'repair');
  assert.equal(hud.hitTest(-160, 78), 'shop');
  assert.equal(hud.hitTest(-20, -48), 'enhancement');
  assert.equal(hud.hitTest(100, 46), 'mail');
  assert.equal(hud.hitTest(240, 0), 'bank');
  assert.equal(hud.hitTest(396, 15), 'portal');
  assert.equal(hud.hitTest(0, -120), null);
  assert.equal(hud.hitTest(0, 130), null);

  hud.setVisible(false);
  assert.equal(hud.hitTest(-300, 10), null);
});

test('TownNPCHUD drawTownAvatars draws animated pixel avatars and proximity indicators', () => {
  const { hud, canvas } = createHud();
  const root = canvas.children[0];
  const g = new Graphics(new Node('World'));

  hud.drawTownAvatars(g, 1.25, 0, -90);
  assert.ok(g.rects.length > 40);
  assert.ok(g.ellipses.length >= 8);
  const baseMoves = g.moves.length;

  g.clear();
  hud.drawTownAvatars(g, 1.25, 52, 8);
  assert.equal(g.moves.length, baseMoves + 1, 'proximity arrow appears when standing by mailbox');

  hud.dispose();
  assert.equal(root.destroyed, true);
});
