// Local browser preview; bound to loopback by default, no package installation required.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const buildDirectory = process.argv[2] || 'web-mobile-001';
const host = process.argv[3] || '127.0.0.1';
const port = Number(process.argv[4] || 8765);
const root = path.resolve(__dirname, '../build', buildDirectory);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
    '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml' };
http.createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400).end(); return; }
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404).end(); return; }
        res.writeHead(200, {
            'Content-Type': types[path.extname(file)] || 'application/octet-stream',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
        });
        res.end(data);
    });
}).listen(port, host, () => console.log(`Prototype (${buildDirectory}): http://${host}:${port}`));
