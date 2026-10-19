// Local art review only; no backend, account or production game routes.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../docs/art/characters/hunter');
const allowed = new Set(['preview.html', 'animation.json', 'run-atlas.png', 'attack-atlas.png',
  'run-preview.gif', 'run-slow.gif', 'attack-preview.gif', 'attack-slow.gif', 'parts-source.png', 'upper-source.png', 'rig.json', 'motion.json']);
http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname.startsWith('/skeleton/')) {
    const file = pathname.slice('/skeleton/'.length) || 'preview.html';
    if (!['preview.html', 'contact-sheet.svg', 'motion.json'].includes(file)) {
      res.writeHead(404).end(); return;
    }
    fs.readFile(path.join(root, 'run-skeleton-v1', file), (error, body) => {
      if (error) { res.writeHead(404).end(); return; }
      const type = file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.json')
        ? 'application/json' : 'text/html; charset=utf-8';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }).end(body);
    });
    return;
  }
  const match = pathname.match(/^\/(v[1234567])(?:\/(.*))?$/);
  const version = match ? match[1] : 'v7';
  const file = match ? (match[2] || 'preview.html') : pathname === '/' ? 'preview.html' : pathname.slice(1);
  if (!allowed.has(file)) { res.writeHead(404).end(); return; }
  fs.readFile(path.join(root, 'animation-' + version, file), (error, body) => {
    if (error) { res.writeHead(404).end(); return; }
    const type = file.endsWith('.png') ? 'image/png' : file.endsWith('.gif') ? 'image/gif'
      : file.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }).end(body);
  });
}).listen(Number(process.argv[3] || 8781), process.argv[2] || '127.0.0.1', () =>
  console.log(`Hunter animation review: http://${process.argv[2] || '127.0.0.1'}:${process.argv[3] || 8781}/`));
