// Local fixture authoring only. Never used to load runtime configuration.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
function write(name, value) {
  const { manifestHash, ...body } = value;
  value.manifestHash = createHash('sha256').update(canonical(body), 'utf8').digest('hex');
  fs.writeFileSync(path.join(__dirname, name), JSON.stringify(value, null, 2) + '\n');
}
const base = JSON.parse(fs.readFileSync(path.join(__dirname, 'warrior-first-normal.test.json'), 'utf8'));
// Data dictionary v2: roomNo is zero-based; UI room labels add one only at display time.
const firstDungeon = base.nodes.find(n => n.id === 'first-normal');
firstDungeon.data.rooms.forEach((room, index) => { room.roomNo = index; });
firstDungeon.data.purpleNamed.eligibleRooms = [0, 1, 2, 3, 4, 5];
write('warrior-first-normal.test.json', base);
const missingPrice = structuredClone(base);
missingPrice.nodes = missingPrice.nodes.filter(n => n.kind !== 'price');
write('missing-price.invalid.json', missingPrice);
const illegalEquipment = structuredClone(base);
illegalEquipment.nodes.find(n => n.kind === 'equipment').data.itemLevel = 11;
write('illegal-equipment-level.invalid.json', illegalEquipment);
const enabledHunter = structuredClone(base);
enabledHunter.nodes.find(n => n.id === 'hunter-disabled').data.enabled = true;
write('enabled-hunter.invalid.json', enabledHunter);
