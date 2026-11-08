// Extend the accepted 48px export pipeline; preserve masters, reviewed samples and all 64px files.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { PixelCanvas, decodePng } from './png-utils.mjs';

const names = ['weapon_dual_blades', 'armor_shoulders', 'armor_chest', 'armor_belt', 'armor_pants', 'armor_boots',
    'jewelry_necklace', 'jewelry_bracelet', 'jewelry_ring', 'special_book', 'special_stone', 'special_earring',
    'material_souvenir', 'consumable_hp_potion', 'consumable_mp_potion', 'material_adamantite'];
const directory = 'client/assets/resources/icons';
const reviewed = new Set(['weapon_dual_blades', 'armor_chest', 'consumable_hp_potion']);
function removeOuterDebris(icon) {
    const visited = new Uint8Array(48 * 48), bytes = icon.buffer;
    for (let start = 0; start < 48 * 48; start++) {
        if (visited[start] || !bytes[start * 4 + 3]) continue;
        const component = [start]; visited[start] = 1;
        let outside = false;
        for (let i = 0; i < component.length; i++) {
            const p = component[i], x = p % 48, y = Math.floor(p / 48);
            outside ||= x < 6 || y < 6 || x >= 42 || y >= 42;
            for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
                const next = ny * 48 + nx;
                if (nx < 0 || nx >= 48 || ny < 0 || ny >= 48 || visited[next] || !bytes[next * 4 + 3]) continue;
                visited[next] = 1; component.push(next);
            }
        }
        if (outside && component.length < 36) for (const p of component) bytes.fill(0, p * 4, p * 4 + 4);
    }
}
for (const name of names) {
    const output = path.join(directory, name + '_48.png');
    if (fs.existsSync(output) && (reviewed.has(name) || !process.argv.includes('--refresh-candidates'))) continue;
    const master = decodePng(fs.readFileSync(path.join('docs/art/icons', name + '.png')));
    assert.equal(master.width, 256); assert.equal(master.height, 256);
    const icon = new PixelCanvas(48, 48);
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
        let r = 0, g = 0, b = 0, count = 0;
        for (let sy = 32 + y * 4; sy < 36 + y * 4; sy++) for (let sx = 32 + x * 4; sx < 36 + x * 4; sx++) {
            const i = (sy * 256 + sx) * 4;
            if (master.data[i + 3] >= 128 && Math.hypot(master.data[i] - 17, master.data[i + 1] - 28, master.data[i + 2] - 34) > 28) {
                r += master.data[i]; g += master.data[i + 1]; b += master.data[i + 2]; count++;
            }
        }
        if (count >= 16 * .35) icon.setPixel(x, y, Math.round(r / count), Math.round(g / count), Math.round(b / count), 255);
    }
    removeOuterDebris(icon);
    if (name === 'material_adamantite') {
        icon.buffer.fill(0, 0, 48 * 8 * 4);
        for (let y = 8; y < 14; y++) for (let x = 0; x < 24; x++) icon.buffer.fill(0, (y * 48 + x) * 4, (y * 48 + x) * 4 + 4);
    }
    fs.writeFileSync(output, icon.toPng());
}
const unknown = new PixelCanvas(48, 48);
unknown.fillRect(8, 12, 32, 28, 52, 70, 84);
unknown.strokeRect(8, 12, 32, 28, 91, 124, 142, 255, 2);
unknown.strokeRect(16, 6, 16, 8, 91, 124, 142, 255, 2);
unknown.fillRect(21, 22, 6, 10, 143, 162, 175);
unknown.fillRect(21, 35, 6, 3, 143, 162, 175);
fs.writeFileSync(path.join(directory, 'item_unknown_48.png'), unknown.toPng());
const sheet = new PixelCanvas(512, 192); sheet.fill(16, 24, 30);
for (const [index, name] of [...names, 'item_unknown'].entries()) {
    const png = decodePng(fs.readFileSync(path.join(directory, name + '_48.png')));
    const icon = new PixelCanvas(48, 48); icon.buffer.set(png.data);
    sheet.blit(icon, index % 8 * 64 + 8, Math.floor(index / 8) * 64 + 8);
}
fs.writeFileSync('docs/reviews/inventory-48-icons-review.png', sheet.toPng());
console.log('48px icon set exported without changing source masters or reviewed variants.');
