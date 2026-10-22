const fs = require('node:fs');
const path = require('node:path');

function loadTypeScript(argument = process.env.WORLD308_TYPESCRIPT) {
  if (!argument) throw new Error('TOOLCHAIN_MISSING: set WORLD308_TYPESCRIPT to an existing local TypeScript package; no dependencies were downloaded.');
  const input = path.resolve(argument);
  const candidates = [input,
    path.join(input, 'resources/app.asar.unpacked/node_modules/typescript'),
    path.join(input, 'Contents/Resources/app.asar.unpacked/node_modules/typescript')];
  if (['tsc', 'tsc.js', 'typescript.js'].includes(path.basename(input))) candidates.unshift(path.dirname(path.dirname(input)));
  const directory = candidates.find(p => fs.existsSync(path.join(p, 'package.json')));
  if (!directory) throw new Error(`TOOLCHAIN_MISSING: no complete local TypeScript package at ${input}; no dependencies were downloaded.`);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  if (manifest.name !== 'typescript' || manifest.version !== '5.8.2') {
    throw new Error(`TOOLCHAIN_VERSION: pinned TypeScript 5.8.2 is required; found ${manifest.version}.`);
  }
  if (!fs.existsSync(path.join(directory, 'lib/typescript.js')) || !fs.existsSync(path.join(directory, 'bin/tsc'))) {
    throw new Error(`TOOLCHAIN_MISSING: incomplete local TypeScript package at ${directory}; no dependencies were downloaded.`);
  }
  return { directory, compiler: path.join(directory, 'bin/tsc'), ts: require(path.join(directory, 'lib/typescript.js')) };
}

function transpile(ts, code, filename) {
  const result = ts.transpileModule(code, {
    fileName: filename, reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const errors = (result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
  return result.outputText;
}

module.exports = { loadTypeScript, transpile };
