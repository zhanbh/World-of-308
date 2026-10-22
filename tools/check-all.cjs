const { loadTypeScript } = require('./local-typescript.cjs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

try {
  let directory = process.env.WORLD308_TYPESCRIPT;
  let toolchainOnly = false;
  let typeProject;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--typescript' && args[i + 1] && !args[i + 1].startsWith('--')) directory = args[++i];
    else if (args[i] === '--toolchain-only') toolchainOnly = true;
    else if (args[i] === '--type-project' && args[i + 1] && !args[i + 1].startsWith('--')) typeProject = args[++i];
    else throw new Error(`INVALID_ARGUMENT: unknown or incomplete argument ${args[i]}`);
  }
  if (toolchainOnly && typeProject) throw new Error('INVALID_ARGUMENT: --toolchain-only and --type-project are mutually exclusive.');
  if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('TOOLCHAIN_VERSION: run this check with Node 24.x.');
  const compiler = loadTypeScript(directory);
  console.log(`Node ${process.versions.node}; TypeScript ${compiler.ts.version}; compiler ${compiler.directory}`);
  if (toolchainOnly) console.log('Toolchain preflight only; checks not run.');
  else if (typeProject) {
    const result = spawnSync(process.execPath, [compiler.compiler, '--project', typeProject], { stdio: 'inherit' });
    if (result.error) throw result.error;
    console.log(result.status === 0 ? 'PASS: selected type project only.' : 'FAIL: selected type project.');
    process.exitCode = result.status === 0 ? 0 : 1;
  } else {
    const root = path.resolve(__dirname, '..');
    const env = { ...process.env, WORLD308_TYPESCRIPT: compiler.directory, npm_config_offline: 'true' };
    const stages = [
      ['tooling contracts', ['--test', ...fs.readdirSync(path.join(__dirname, 'test')).filter(n => n.endsWith('.test.cjs')).map(n => path.join(__dirname, 'test', n))]],
      ['shared/backend types', [compiler.compiler, '--project', path.join(root, 'backend/tsconfig.json')]],
      ['shared value contracts', ['--test', ...fs.readdirSync(path.join(root, 'shared/test')).filter(n => n.endsWith('.test.mjs')).map(n => path.join(root, 'shared/test', n))]],
      ['client pure-model types', [compiler.compiler, '--project', path.join(__dirname, 'tsconfig.models.json')]],
      ['backend regression (legacy and v2)', ['--test', ...fs.readdirSync(path.join(root, 'backend/test')).filter(n => n.endsWith('.test.mjs')).map(n => path.join(root, 'backend/test', n))]],
      ['client model regression', [path.join(root, 'client/tools/check-model.cjs')]],
      ['client UI-model regression', [path.join(root, 'client/tools/check-ui-model.cjs')]],
    ];
    const results = [];
    for (const [name, command] of stages) {
      console.log(`\nCHECK: ${name}`);
      const result = spawnSync(process.execPath, command, { cwd: root, env, stdio: 'inherit' });
      const passed = !result.error && result.status === 0;
      if (result.error) console.error(result.error.message);
      console.log(`${passed ? 'PASS' : 'FAIL'}: ${name}`);
      results.push({ name, passed });
    }
    console.log(`\nSUMMARY: ${results.filter(r => r.passed).length}/${results.length} checks passed.`);
    console.log('Local checks only: v2 business behavior, cloud SDK, Cocos scene types/build and device acceptance are not covered.');
    process.exitCode = results.every(r => r.passed) ? 0 : 1;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
