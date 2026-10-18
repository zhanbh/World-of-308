const { existsSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const compiler = process.argv[2] || '/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript/bin/tsc';
if (!existsSync(compiler)) {
  console.error('Pass an existing TypeScript >=5.8 tsc path: npm run check -- /absolute/path/to/typescript/bin/tsc');
  process.exit(1);
}
const result = spawnSync(process.execPath, [compiler, '--project', path.resolve(__dirname, '../tsconfig.json')], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
