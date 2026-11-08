// One-command local preview. --rebuild refreshes the artifact before serving.
const { spawnSync, spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const index = path.join(__dirname, '../build/web-mobile-ui-slice-kit/index.html');
if (!fs.existsSync(index) || process.argv.includes('--rebuild')) {
    const result = spawnSync(process.execPath, [path.join(__dirname, 'build-ui-slice-kit.cjs')], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
}
console.log('UI sample: http://127.0.0.1:8774 (use --rebuild after changing source)');
const child = spawn(process.execPath, [path.join(__dirname, 'serve.cjs'), 'web-mobile-ui-slice-kit', '127.0.0.1', '8774'], { stdio: 'inherit' });
child.on('exit', code => process.exit(code || 0));
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
