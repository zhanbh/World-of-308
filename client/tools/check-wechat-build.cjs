// Local preflight: fail before preview upload if packaging regresses.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(process.argv[2] || path.join(__dirname, '../build/wechatgame'));
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const game = read('game.json'), project = read('project.config.json');
const config = require('../build-configs/wechatgame.json');
assert.equal(project.appid, config.packages.wechatgame.appid, 'build uses this project AppID');
assert.equal(game.deviceOrientation, 'landscapeRight');
const packages = game.subpackages || game.subPackages || [];
assert.ok(packages.some(item => item.name === 'resources'), 'runtime atlases must be a resource subpackage');
const roots = packages.map(item => path.resolve(root, item.root));
for (const dir of roots) {
    assert.ok(dir.startsWith(root + path.sep), 'subpackage must remain inside build');
    assert.ok(fs.statSync(dir).isDirectory(), 'subpackage directory exists');
}
let main = 0, total = 0;
function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(file);
        else {
            const bytes = fs.statSync(file).size;
            total += bytes;
            if (!roots.some(dir => file.startsWith(dir + path.sep))) main += bytes;
        }
    }
}
walk(root);
assert.ok(main < 4 * 1024 * 1024, `main package ${main} bytes exceeds the observed 4MiB preview limit`);
console.log(JSON.stringify({ appid: project.appid, orientation: game.deviceOrientation,
    mainBytes: main, totalBytes: total, subpackages: packages }, null, 2));
console.log('PASS: WeChat AppID, landscape, resource subpackage and main-package budget');
