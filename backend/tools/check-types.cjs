const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { loadTypeScript } = require('../../tools/local-typescript.cjs');
try {
  const { compiler } = loadTypeScript(process.argv[2] || process.env.WORLD308_TYPESCRIPT);
  const result = spawnSync(process.execPath, [compiler, '--project', path.resolve(__dirname, '../tsconfig.json')], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
