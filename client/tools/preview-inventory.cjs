// One-command local service + actual Cocos backpack. Uses isolated, temporary MemoryStore data.
const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const index = path.join(__dirname, '../build/web-mobile-inventory/index.html');
if (!fs.existsSync(index) || process.argv.includes('--rebuild')) {
    const build = spawnSync(process.execPath, [path.join(__dirname, 'build-inventory.cjs'),
        '/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator'], { stdio: 'inherit' });
    if (build.status !== 0) process.exit(build.status || 1);
}
const processes = [
    spawn(process.execPath, [path.join(__dirname, 'inventory-preview-server.mjs'), '8792'], { stdio: 'inherit' }),
    spawn(process.execPath, [path.join(__dirname, 'serve.cjs'), 'web-mobile-inventory', '127.0.0.1', '8775'], { stdio: 'inherit' }),
];
let stopping = false;
const stop = code => { if (stopping) return; stopping = true; for (const child of processes) child.kill('SIGTERM'); process.exitCode = code || 0; };
for (const child of processes) { child.on('error', error => { console.error(error); stop(1); }); child.on('exit', code => stop(code)); }
process.on('SIGINT', () => stop(0)); process.on('SIGTERM', () => stop(0));
console.log('Backpack: http://127.0.0.1:8775/?inventoryPreview=1&inventoryPort=8792');
