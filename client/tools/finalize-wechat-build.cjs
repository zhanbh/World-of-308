// Creator 3.8.8 keeps the built-in resources bundle in assets even when the
// custom Bundle preset requests subpackages. Emit the standard WeChat layout
// and update both manifests together; resource paths and texture bytes stay intact.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(process.argv[2] || path.join(__dirname, '../build/wechatgame'));
const source = path.join(root, 'assets/resources');
const destination = path.join(root, 'subpackages/resources');
const gamePath = path.join(root, 'game.json');
const settingsPath = path.join(root, 'src/settings.json');
const game = JSON.parse(fs.readFileSync(gamePath, 'utf8'));
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
assert.equal(settings.engine.platform, 'wechatgame', 'Only modify WeChat build artifacts');
assert.ok(settings.assets.preloadBundles.some(item => item.bundle === 'resources'));
if (fs.existsSync(source)) {
    assert.ok(!fs.existsSync(destination), 'Refuse to overwrite an existing subpackage');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.renameSync(source, destination);
}
assert.ok(fs.existsSync(path.join(destination, 'config.json')));
// wx.loadSubpackage executes game.js; the original bundle module is preserved.
const index = path.join(destination, 'index.js');
if (fs.existsSync(index)) fs.renameSync(index, path.join(destination, 'game.js'));
assert.ok(fs.existsSync(path.join(destination, 'game.js')));
game.subpackages ||= [];
if (!game.subpackages.some(item => item.name === 'resources')) {
    game.subpackages.push({ name: 'resources', root: 'subpackages/resources/' });
}
settings.assets.subpackages ||= [];
if (!settings.assets.subpackages.includes('resources')) settings.assets.subpackages.push('resources');
// Inject structuredClone polyfill into WeChat entry file if needed
const entryJsPath = path.join(root, 'game.js');
if (fs.existsSync(entryJsPath)) {
    let entryCode = fs.readFileSync(entryJsPath, 'utf8');
    if (!entryCode.includes('structuredClone')) {
        const polyfillCode = `// Polyfill structuredClone for WeChat Mini Game runtime
(function() {
  function __deepClone(v) {
    if (v === null || typeof v !== 'object') return v;
    if (v instanceof Date) return new Date(v.getTime());
    if (v instanceof Set) return new Set(Array.from(v, __deepClone));
    if (v instanceof Map) return new Map(Array.from(v.entries(), function(e) { return [__deepClone(e[0]), __deepClone(e[1])]; }));
    if (Array.isArray(v)) return v.map(__deepClone);
    var o = {};
    for (var k of Object.keys(v)) o[k] = __deepClone(v[k]);
    return o;
  }
  if (typeof globalThis !== 'undefined' && typeof globalThis.structuredClone !== 'function') {
    globalThis.structuredClone = __deepClone;
  }
  if (typeof GameGlobal !== 'undefined' && typeof GameGlobal.structuredClone !== 'function') {
    GameGlobal.structuredClone = __deepClone;
  }
  if (typeof window !== 'undefined' && typeof window.structuredClone !== 'function') {
    window.structuredClone = __deepClone;
  }
})();
`;
        fs.writeFileSync(entryJsPath, polyfillCode + entryCode);
    }
}
fs.writeFileSync(gamePath, JSON.stringify(game, null, 2) + '\n');
fs.writeFileSync(settingsPath, JSON.stringify(settings));
console.log('Finalized resources bundle and injected structuredClone polyfill for WeChat');

