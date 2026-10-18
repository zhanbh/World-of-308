// Repeatable local build -> built-in resource packaging -> size/AppID preflight.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const editor = process.argv[2];
if (!editor) throw new Error('Usage: node client/tools/build-wechat.cjs /path/to/CocosCreator');
const project = path.resolve(__dirname, '..');
const config = path.join(project, 'build-configs/wechatgame.json');
const build = spawnSync(editor, ['--project', project, '--build', `configPath=${config}`], { stdio: 'inherit' });
if (build.error) throw build.error;
// Installed Creator 3.8.8 returns 36 for completed CLI builds.
if (![0, 36].includes(build.status)) process.exit(build.status || 1);
const root = path.join(project, 'build/wechatgame');
if (!fs.existsSync(path.join(root, 'game.json'))) throw new Error('Creator did not produce game.json');
for (const script of ['finalize-wechat-build.cjs', 'check-wechat-build.cjs']) {
    const result = spawnSync(process.execPath, [path.join(__dirname, script), root], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
}
