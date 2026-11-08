// Local, isolated sample builds. No upload, install, or cloud operations.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const editor = process.argv[2] || '/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator';
const mode = process.argv[3] || 'web';
if (!fs.existsSync(editor) || !['web', 'wechat'].includes(mode))
    throw new Error('Usage: node client/tools/build-ui-slice-kit.cjs /absolute/path/to/CocosCreator [web|wechat]');
const project = path.resolve(__dirname, '..');
const name = mode === 'web' ? 'web-mobile-ui-slice-kit' : 'wechatgame-ui-slice-kit';
const result = spawnSync(editor, ['--project', project, '--build', 'configPath=' + path.join(project, 'build-configs', name + '.json')], { stdio: 'inherit' });
if (result.error) throw result.error;
if (![0, 36].includes(result.status)) process.exit(result.status || 1);
const output = path.join(project, 'build', name);
if (!fs.existsSync(path.join(output, mode === 'web' ? 'index.html' : 'game.json'))) throw new Error('Sample build output missing');
if (mode === 'wechat') for (const script of ['finalize-wechat-build.cjs', 'check-wechat-build.cjs']) {
    const check = spawnSync(process.execPath, [path.join(__dirname, script), output], { stdio: 'inherit' });
    if (check.status !== 0) process.exit(check.status || 1);
}
console.log('PASS: isolated UI sample build -> ' + output + '. Runtime/device verification is separate.');
