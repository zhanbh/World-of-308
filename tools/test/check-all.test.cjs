const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const root = path.resolve(__dirname, '../..');
const entry = path.join(root, 'tools/check-all.cjs');

test('an explicit installed toolchain reports its versions without claiming checks ran', () => {
  assert.ok(process.env.WORLD308_TYPESCRIPT, 'Set WORLD308_TYPESCRIPT to the installed TypeScript package for this contract test.');
  const result = spawnSync(process.execPath, [entry, '--typescript', process.env.WORLD308_TYPESCRIPT, '--toolchain-only'], {
    cwd: root, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /TypeScript 5\.8\.2/);
  assert.match(result.stdout, /checks not run/i);
});

test('the check command reports a missing explicit compiler instead of downloading one', () => {
  const result = spawnSync(process.execPath, [entry, '--typescript', path.join(root, 'missing compiler')], {
    cwd: root, encoding: 'utf8', env: { ...process.env, npm_config_offline: 'true' },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /TOOLCHAIN_MISSING/);
  assert.match(result.stderr, /no dependencies were downloaded/i);
});

test('toolchain preflight cannot silently suppress a requested type check', () => {
  const result = spawnSync(process.execPath, [entry, '--toolchain-only', '--type-project', 'project.json'], {
    cwd: root, encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /INVALID_ARGUMENT/);
});

test('the existing UI check fails locally when the compiler is missing', () => {
  const result = spawnSync(process.execPath, [path.join(root, 'client/tools/check-ui-model.cjs')], {
    cwd: root, encoding: 'utf8', timeout: 10000,
    env: { ...process.env, WORLD308_TYPESCRIPT: path.join(root, 'missing compiler'),
      npm_config_offline: 'true', npm_config_cache: path.join(os.tmpdir(), 'world308-offline-empty-cache') },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /TOOLCHAIN_MISSING/);
});

test('an unsupported compiler in a path containing spaces fails before running checks', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'world308 compiler '));
  const manifest = path.join(directory, 'package.json');
  fs.writeFileSync(manifest, JSON.stringify({ name: 'typescript', version: '5.7.3' }));
  t.after(() => { fs.unlinkSync(manifest); fs.rmdirSync(directory); });
  const result = spawnSync(process.execPath, [entry, '--typescript', directory], {
    cwd: root, encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /TOOLCHAIN_VERSION/);
  assert.match(result.stderr, /5\.7\.3/);
});

test('the existing model check never falls back to a package-manager download', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'world308 offline '));
  const command = path.join(directory, process.platform === 'win32' ? 'npx.cmd' : 'npx');
  fs.writeFileSync(command, process.platform === 'win32'
    ? '@echo unexpected-package-manager >&2\r\n@exit /b 91\r\n'
    : '#!/bin/sh\necho unexpected-package-manager >&2\nexit 91\n', { mode: 0o755 });
  t.after(() => { fs.unlinkSync(command); fs.rmdirSync(directory); });
  const env = { ...process.env, WORLD308_TYPESCRIPT: path.join(directory, 'missing'), npm_config_offline: 'true' };
  const pathKey = Object.keys(env).find(k => k.toUpperCase() === 'PATH') || 'PATH';
  env[pathKey] = directory + path.delimiter + env[pathKey];
  const result = spawnSync(process.execPath, [path.join(root, 'client/tools/check-model.cjs')], {
    cwd: root, encoding: 'utf8', env, timeout: 10000,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /TOOLCHAIN_MISSING/);
  assert.doesNotMatch(result.stderr, /unexpected-package-manager/);
});

test('a project with a semantic type error fails the type gate instead of passing transpilation', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'world308 type error '));
  const source = path.join(directory, 'example.ts');
  const config = path.join(directory, 'tsconfig.json');
  fs.writeFileSync(source, 'const value: number = "wrong type";\n');
  fs.writeFileSync(config, JSON.stringify({ compilerOptions: { strict: true, noEmit: true, types: [] }, files: ['example.ts'] }));
  t.after(() => { fs.unlinkSync(source); fs.unlinkSync(config); fs.rmdirSync(directory); });
  const result = spawnSync(process.execPath, [entry, '--type-project', config], { cwd: root, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /TS2322/);
  assert.match(result.stdout + result.stderr, /FAIL/);
});
