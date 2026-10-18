// Uses the same TypeScript model and frame schedule as Creator, without a build.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const editor = process.argv[2];
const host = process.argv[3] || '127.0.0.1';
const port = Number(process.argv[4] || 8767);
if (!editor) throw new Error('Pass Creator installation directory (Contents on macOS)');
const ts = require(path.join(editor, 'resources/app.asar.unpacked/node_modules/typescript'));
const root = path.resolve(__dirname, '..');
http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (/^\/(CombatModel|EnemyModel|WarriorAttackAnimation|WarriorSkillAnimation|WarriorSkillsModel|WarriorSkillEffects)(\.js)?$/.test(url.pathname)) {
        const name = url.pathname.slice(1).replace('.js', '');
        const source = fs.readFileSync(path.join(root, 'assets/scripts', name + '.ts'), 'utf8');
        const result = ts.transpileModule(source, { compilerOptions: {
            target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020,
        } });
        res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(result.outputText); return;
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
