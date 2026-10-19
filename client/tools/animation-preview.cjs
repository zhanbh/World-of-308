const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

let editor = process.argv[2];
let host = process.argv[3] || '127.0.0.1';
let port = Number(process.argv[4] || 8767);

if (editor && (editor === '127.0.0.1' || editor === '0.0.0.0' || /^\d+$/.test(editor))) {
    if (/^\d+$/.test(editor)) {
        port = Number(editor);
        host = process.argv[3] || '127.0.0.1';
    } else {
        host = editor;
        port = Number(process.argv[3] || 8767);
    }
    editor = null;
}

let ts = null;
if (editor) {
    try {
        ts = require(path.join(editor, 'resources/app.asar.unpacked/node_modules/typescript'));
    } catch {
        ts = null;
    }
}

const root = path.resolve(__dirname, '..');
const cache = new Map();

function transpile(name, source) {
    if (cache.has(name)) return cache.get(name);
    let output = '';
    if (ts) {
        output = ts.transpileModule(source, { compilerOptions: {
            target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020,
        } }).outputText;
    } else {
        const esbuildCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
        output = execFileSync(esbuildCmd, ['esbuild', '--loader=ts', '--target=es2020', '--format=esm'], {
            input: source,
            encoding: 'utf8',
            shell: true,
            maxBuffer: 10 * 1024 * 1024,
        });
    }
    cache.set(name, output);
    return output;
}

http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (/^\/(CombatModel|EnemyModel|WarriorAttackAnimation|WarriorSkillAnimation|WarriorSkillsModel|WarriorSkillEffects)(\.js)?$/.test(url.pathname)) {
        const name = url.pathname.slice(1).replace('.js', '');
        const source = fs.readFileSync(path.join(root, 'assets/scripts', name + '.ts'), 'utf8');
        const output = transpile(name, source);
        res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(output); return;
    }
    const file = url.pathname === '/' ? path.join(__dirname, 'animation-preview.html')
        : url.pathname === '/skills' ? path.join(__dirname, 'skill-preview.html')
        : url.pathname === '/atlas.png' ? path.join(root, 'assets/resources/warrior-basic-attack-v2.png')
        : /^\/warrior-((cross|bengshan|badao|earth|body)-v1|badao-v2|gait-v2)\.png$/.test(url.pathname)
            ? path.join(root, 'assets/resources', url.pathname.slice(1)) : null;
    if (!file) { res.writeHead(404).end(); return; }
    fs.readFile(file, (error, data) => {
        if (error) { res.writeHead(404).end(); return; }
        res.writeHead(200, { 'Content-Type': file.endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8' }).end(data);
    });
}).listen(port, host, () => console.log(`Warrior animation review: http://${host}:${port}/skills`));
