// Repeatable isolated H5 preview build; never installs tools or publishes a game.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const editor = process.argv[2];
if (!editor || !fs.existsSync(editor)) throw new Error('Usage: node client/tools/build-inventory.cjs /absolute/path/to/CocosCreator');
const project = path.resolve(__dirname, '..');
const config = path.join(project, 'build-configs/web-mobile-inventory.json');
const result = spawnSync(editor, ['--project', project, '--build', `configPath=${config}`], { stdio: 'inherit' });
if (result.error) throw result.error;
if (![0, 36].includes(result.status)) process.exit(result.status || 1);
const output = path.join(project, 'build/web-mobile-inventory');
if (!fs.existsSync(path.join(output, 'index.html'))) throw new Error('Creator did not produce the inventory H5 preview');
console.log(`PASS: Cocos H5 inventory build produced ${output}. Runtime checks are separate.`);
