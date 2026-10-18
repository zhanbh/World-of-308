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
fs.writeFileSync(gamePath, JSON.stringify(game, null, 2) + '\n');
fs.writeFileSync(settingsPath, JSON.stringify(settings));
console.log('Finalized resources bundle as a WeChat subpackage (no texture conversion)');
