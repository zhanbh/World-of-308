// One-time bootstrap using the installed editor's own 2D scene schema.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const scenePath = path.join(root, 'assets/scenes/Prototype.scene');
const scene = JSON.parse(fs.readFileSync(scenePath, 'utf8'));
if (scene[0]._name === 'Prototype') throw new Error('Scene already initialized');
const scriptUuid = '30a7fd45-689b-494e-a774-2fbbab055605';
// Cocos compressed UUID: first 5 hexadecimal characters plus base64 triplets.
const hex = scriptUuid.replaceAll('-', '');
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
let compressed = hex.slice(0, 5);
for (let i = 5; i < 32; i += 3) {
    const n = parseInt(hex.slice(i, i + 3), 16);
    compressed += alphabet[n >> 6] + alphabet[n & 63];
}
scene[0]._name = scene[1]._name = 'Prototype';
scene[1]._id = '8627f424-97ac-47b3-82fa-cd7a692188a3';
scene[2]._lpos.y = 270;
scene[5]._contentSize.height = 540;
scene[2]._components.push({ __id__: scene.length });
scene.push({ __type__: compressed, _name: '', _objFlags: 0, node: { __id__: 2 },
    _enabled: true, __prefab: null, _id: crypto.randomUUID() });
fs.writeFileSync(scenePath, JSON.stringify(scene, null, 2) + '\n');
const meta = (file, importer, uuid, ver) => fs.writeFileSync(file + '.meta', JSON.stringify({
    ver, importer, imported: true, uuid, files: importer === 'scene' ? ['.json'] : [], subMetas: {}, userData: {},
}, null, 2) + '\n');
meta(scenePath, 'scene', scene[1]._id, '1.1.50');
meta(path.join(root, 'assets/scripts/Prototype.ts'), 'typescript', scriptUuid, '4.0.24');
meta(path.join(root, 'assets/scripts/CombatModel.ts'), 'typescript', crypto.randomUUID(), '4.0.24');
console.log('Prototype scene initialized using the Creator 3.8.8 2D template.');
