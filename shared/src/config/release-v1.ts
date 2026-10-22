import { resource } from '../exact-values.ts';

type Ref = Readonly<{ id: string; version: number }>;
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Data = { [key: string]: Json };
export type ConfigNode = Readonly<{ id: string; version: number; kind: string; visibility: 'public' | 'private'; data: Data }>;
export type TestRelease = Readonly<{ schemaVersion: 1; releaseId: string; manifestHash: string; profileId: string; environmentScope: 'local-test'; purpose: 'contract-fixture-only'; codeCompatibility: string; protocolRange: { min: 2; max: 2 }; units: { positionScale: 1000; resourceScale: 1000; time: 'integer-microseconds'; logicStepMs: 10 }; provenance: string[]; entryDungeonRef: Ref; strategy: { id: 'test-fill-missing'; testOnly: true }; nodes: ConfigNode[] }>;
export type TestAuthorization = Readonly<{ profileId: string; environmentScope: string; allowTestStrategies: boolean }>;

function fail(code: string): never { throw new TypeError(`INVALID_RELEASE:${code}`); }
function obj(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return fail('OBJECT');
  if (Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) return fail('FIELDS');
  return value as Record<string, unknown>;
}
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max || Object.is(value, -0)) return fail('INTEGER');
  return value;
}
function str(value: unknown, max = 128): string { if (typeof value !== 'string' || !value.length || value.length > max) return fail('STRING'); return value; }
function list(value: unknown, min: number, max: number): unknown[] { if (!Array.isArray(value) || value.length < min || value.length > max) return fail('LIST'); return value; }
function choice<T extends string>(value: unknown, choices: readonly T[]): T { if (!choices.includes(value as T)) return fail('ENUM'); return value as T; }
function bool(value: unknown): boolean { if (typeof value !== 'boolean') return fail('BOOLEAN'); return value; }
function units(value: unknown): string { if (typeof value !== 'string') return fail('RESOURCE_WIRE'); resource(value); return value; }
function ref(value: unknown): Ref { const r = obj(value, ['id', 'version']); return { id: str(r.id, 64), version: integer(r.version, 1) }; }
function refs(value: unknown, max: number): Ref[] { return list(value, 0, max).map(ref); }
function freeze<T>(value: T): T { if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }
function point(value: unknown): { x: number; y: number } { const p = obj(value, ['x', 'y']); return { x: integer(p.x, -1000000000, 1000000000), y: integer(p.y, -1000000000, 1000000000) }; }

function node(value: unknown): ConfigNode {
  const n = obj(value, ['id', 'version', 'kind', 'visibility', 'data']);
  const base = { id: str(n.id, 64), version: integer(n.version, 1), kind: str(n.kind, 32), visibility: choice(n.visibility, ['public', 'private'] as const) };
  let data: Data;
  switch (base.kind) {
    case 'class': {
      const d = obj(n.data, ['classId', 'enabled', 'skillRefs', 'initialHp', 'initialMp', 'attackPower']);
      data = { classId: choice(d.classId, ['warrior', 'hunter']), enabled: bool(d.enabled), skillRefs: refs(d.skillRefs, 4) as Json, initialHp: units(d.initialHp), initialMp: units(d.initialMp), attackPower: units(d.attackPower) };
      break;
    }
    case 'skill': {
      const d = obj(n.data, ['owner', 'nodeOffsetsUs', 'cooldownUs', 'manaCost', 'minimumStartGapUs', 'bleed']);
      const owner = choice(d.owner, ['warrior', 'monster']);
      const offsets = list(d.nodeOffsetsUs, 1, owner === 'warrior' ? 4 : 6).map(v => integer(v, 0, 4000000));
      if (offsets.some((v, i) => i > 0 && v < offsets[i - 1])) fail('NODE_ORDER');
      let bleed: Json = null;
      if (d.bleed !== null) { const b = obj(d.bleed, ['ticks', 'durationUs']); bleed = { ticks: integer(b.ticks, 1, 5), durationUs: integer(b.durationUs, 1, 5000000) }; }
      data = { owner, nodeOffsetsUs: offsets, cooldownUs: integer(d.cooldownUs, 1, 3600000000), manaCost: units(d.manaCost), minimumStartGapUs: integer(d.minimumStartGapUs, owner === 'warrior' ? 240000 : 500000, 3600000000), bleed };
      break;
    }
    case 'map': {
      const d = obj(n.data, ['bounds', 'entrance', 'exit', 'spawnPoints', 'obstacles']);
      const b = obj(d.bounds, ['left', 'right', 'bottom', 'top']);
      const bounds = { left: integer(b.left, -1000000000, 1000000000), right: integer(b.right, -1000000000, 1000000000), bottom: integer(b.bottom, -1000000000, 1000000000), top: integer(b.top, -1000000000, 1000000000) };
      if (bounds.left >= bounds.right || bounds.bottom >= bounds.top) fail('MAP_BOUNDS');
      const entrance = point(d.entrance), exit = point(d.exit), spawnPoints = list(d.spawnPoints, 1, 8).map(point);
      for (const p of [entrance, exit, ...spawnPoints]) if (p.x < bounds.left || p.x > bounds.right || p.y < bounds.bottom || p.y > bounds.top) fail('MAP_POINT');
      list(d.obstacles, 0, 0); // This minimal fixture profile deliberately supports only the reviewed obstacle-free map.
      data = { bounds, entrance, exit, spawnPoints, obstacles: [] };
      break;
    }
    case 'monster': {
      const d = obj(n.data, ['category', 'hp', 'attackPower', 'skillRefs', 'immuneToBleed', 'immuneToControl']);
      data = { category: choice(d.category, ['beast', 'humanoid', 'undead', 'mechanical']), hp: units(d.hp), attackPower: units(d.attackPower), skillRefs: refs(d.skillRefs, 8) as Json, immuneToBleed: bool(d.immuneToBleed), immuneToControl: bool(d.immuneToControl) };
      break;
    }
    case 'equipment': {
      const d = obj(n.data, ['slot', 'quality', 'itemLevel', 'attackPower', 'bindingPolicy', 'durability']);
      const durability = obj(d.durability, ['wearEnabled', 'max', 'policyRef']);
      data = { slot: choice(d.slot, ['weapon', 'shoulder', 'chest', 'pants', 'belt', 'boots', 'bracelet', 'necklace', 'ring', 'subEquip', 'magicStone', 'earring', 'trinket']), quality: choice(d.quality, ['white', 'green', 'blue', 'purple', 'orange']), itemLevel: integer(d.itemLevel), attackPower: units(d.attackPower), bindingPolicy: choice(d.bindingPolicy, ['none', 'account', 'character', 'onEquipCharacter', 'onPickupCharacter']), durability: { wearEnabled: bool(durability.wearEnabled), max: durability.max === null ? null : integer(durability.max, 1), policyRef: str(durability.policyRef, 64) } };
      break;
    }
    case 'reward': {
      const d = obj(n.data, ['equipmentWeights', 'gold', 'xp', 'maxEquipment']);
      const weights = list(d.equipmentWeights, 1, 64).map(v => { const w = obj(v, ['equipmentRef', 'weight']); return { equipmentRef: ref(w.equipmentRef), weight: integer(w.weight, 1, 1000000) }; });
      data = { equipmentWeights: weights as Json, gold: units(d.gold), xp: units(d.xp), maxEquipment: integer(d.maxEquipment, 0, 1) };
      break;
    }
    case 'price': {
      const d = obj(n.data, ['equipmentRef', 'currency', 'amount', 'serviceKind']);
      data = { equipmentRef: ref(d.equipmentRef) as Json, currency: choice(d.currency, ['gold', 'points']), amount: units(d.amount), serviceKind: choice(d.serviceKind, ['repair', 'enhance', 'buy', 'sell']) };
      break;
    }
    case 'dungeon': {
      const d = obj(n.data, ['difficulty', 'playerLevel', 'rewardRef', 'priceRefs', 'rooms', 'purpleNamed']);
      const rooms = list(d.rooms, 7, 7).map((value, i) => {
        const r = obj(value, ['roomNo', 'mapRef', 'spawns']);
        if (r.roomNo !== i) fail('ROOM_ORDER');
        return { roomNo: i, mapRef: ref(r.mapRef), spawns: list(r.spawns, 1, 8).map(v => { const s = obj(v, ['monsterRef', 'role']); return { monsterRef: ref(s.monsterRef), role: choice(s.role, ['ordinary', 'elite', 'boss']) }; }) };
      });
      const p = obj(d.purpleNamed, ['count', 'experienceMultiplier', 'eligibleRooms']);
      if (p.count !== 1 || p.experienceMultiplier !== 2) fail('PURPLE_NAMED');
      data = { difficulty: choice(d.difficulty, ['normal']), playerLevel: integer(d.playerLevel, 1, 1), rewardRef: ref(d.rewardRef) as Json, priceRefs: refs(d.priceRefs, 32) as Json, rooms: rooms as Json, purpleNamed: { count: 1, experienceMultiplier: 2, eligibleRooms: list(p.eligibleRooms, 1, 6).map(v => integer(v, 0, 5)) } };
      break;
    }
    default: return fail('NODE_KIND');
  }
  return { ...base, data };
}

function validateReferences(nodes: ConfigNode[], entry: Ref): void {
  const byId = new Map<string, ConfigNode>();
  for (const n of nodes) { if (byId.has(n.id)) fail('DUPLICATE_NODE'); byId.set(n.id, n); }
  const edges = new Map<string, string[]>();
  function resolve(value: unknown, kind: string): ConfigNode {
    const r = ref(value), target = byId.get(r.id);
    if (!target || target.version !== r.version || target.kind !== kind) return fail('REFERENCE');
    return target;
  }
  resolve(entry, 'dungeon');
  for (const n of nodes) {
    const linked: ConfigNode[] = [];
    switch (n.kind) {
      case 'class': case 'monster': for (const r of n.data.skillRefs as Json[]) linked.push(resolve(r, 'skill')); break;
      case 'reward': for (const w of n.data.equipmentWeights as Data[]) linked.push(resolve(w.equipmentRef, 'equipment')); break;
      case 'price': linked.push(resolve(n.data.equipmentRef, 'equipment')); break;
      case 'dungeon':
        linked.push(resolve(n.data.rewardRef, 'reward'));
        for (const r of n.data.priceRefs as Json[]) linked.push(resolve(r, 'price'));
        for (const room of n.data.rooms as Data[]) {
          const map = resolve(room.mapRef, 'map'); linked.push(map);
          const spawns = room.spawns as Data[];
          if (spawns.length > (map.data.spawnPoints as Json[]).length) fail('SPAWN_CAPACITY');
          for (const spawn of spawns) linked.push(resolve(spawn.monsterRef, 'monster'));
        }
        break;
    }
    edges.set(n.id, linked.map(target => target.id));
    if (n.visibility === 'public' && linked.some(target => target.visibility !== 'public')) fail('PUBLIC_PRIVATE_REFERENCE');
  }
  const visiting = new Set<string>(), done = new Set<string>();
  function visit(id: string): void {
    if (visiting.has(id)) fail('REFERENCE_CYCLE');
    if (done.has(id)) return;
    visiting.add(id); for (const child of edges.get(id) ?? []) visit(child); visiting.delete(id); done.add(id);
  }
  for (const n of nodes) visit(n.id);
}

function validateProfile(nodes: ConfigNode[]): void {
  const classes = nodes.filter(n => n.kind === 'class');
  if (classes.length !== 2 || classes.filter(n => n.data.classId === 'warrior' && n.data.enabled === true).length !== 1 || classes.filter(n => n.data.classId === 'hunter' && n.data.enabled === false && (n.data.skillRefs as Json[]).length === 0).length !== 1) fail('CLASS_PROFILE');
  const warrior = classes.find(n => n.data.classId === 'warrior')!;
  if ((warrior.data.skillRefs as Json[]).length !== 4 || warrior.data.initialHp === '0' || warrior.data.initialMp === '0') fail('WARRIOR_PROFILE');
  const warriorSkills = (warrior.data.skillRefs as Data[]).map(r => nodes.find(n => n.id === r.id)!);
  if (new Set(warriorSkills.map(n => n.id)).size !== 4 || warriorSkills.some(n => n.data.owner !== 'warrior')) fail('SKILL_OWNER');
  const stageCounts: Record<string, number> = { cross: 2, bengshan: 3, badao: 1, earth: 4 };
  for (const skill of warriorSkills) if (!Object.hasOwn(stageCounts, skill.id) || (skill.data.nodeOffsetsUs as Json[]).length !== stageCounts[skill.id]) fail('WARRIOR_STAGES');
  for (const n of nodes) {
    if (n.visibility !== (n.kind === 'reward' || n.kind === 'dungeon' ? 'private' : 'public')) fail('VISIBILITY');
    if (n.kind === 'monster') {
      const skills = (n.data.skillRefs as Data[]).map(r => nodes.find(node => node.id === r.id)!);
      if (!skills.length || skills.some(skill => skill.data.owner !== 'monster' || skill.data.bleed !== null)) fail('MONSTER_SKILL');
    }
    if (n.kind === 'equipment') {
      if (![10, 15, 20, 25, 30].includes(n.data.itemLevel as number)) fail('ITEM_LEVEL');
      const wearEnabled = ['weapon', 'shoulder', 'chest', 'pants', 'belt', 'boots', 'earring'].includes(n.data.slot as string);
      const durability = n.data.durability as Data;
      if (durability.wearEnabled !== wearEnabled || (wearEnabled ? durability.max === null : durability.max !== null)) fail('DURABILITY_POLICY');
      if (durability.policyRef !== (wearEnabled ? 'test-weapon-wear-v1' : 'not-applicable-v1')) fail('DURABILITY_POLICY_REF');
      if (n.data.quality === 'purple' && n.data.bindingPolicy !== 'onEquipCharacter') fail('PURPLE_BINDING');
      if (n.data.quality === 'orange' && n.data.bindingPolicy !== 'onPickupCharacter') fail('ORANGE_BINDING');
    }
    if (n.kind === 'dungeon') {
      const rooms = n.data.rooms as Data[];
      const spawns = rooms.flatMap(r => r.spawns as Data[]);
      if (spawns.length !== 28 || spawns.filter(s => s.role === 'boss').length !== 1 || spawns.filter(s => s.role === 'elite').length !== 1 || !(rooms[6].spawns as Data[]).some(s => s.role === 'boss')) fail('FIRST_DUNGEON_ENCOUNTER');
      if (!(n.data.priceRefs as Json[]).length) fail('PRICE_REQUIRED');
      const eligibleRooms = (n.data.purpleNamed as Data).eligibleRooms as number[];
      if (new Set(eligibleRooms).size !== eligibleRooms.length) fail('PURPLE_ROOMS');
    }
  }
}

export function loadTestRelease(text: string, authorization: TestAuthorization): TestRelease {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > 262144) fail('SIZE');
  const r = obj(JSON.parse(text), ['schemaVersion', 'releaseId', 'manifestHash', 'profileId', 'environmentScope', 'purpose', 'codeCompatibility', 'protocolRange', 'units', 'provenance', 'entryDungeonRef', 'strategy', 'nodes']);
  if (r.schemaVersion !== 1 || r.environmentScope !== 'local-test' || r.purpose !== 'contract-fixture-only') fail('TEST_PROFILE');
  if (!authorization.allowTestStrategies || authorization.environmentScope !== r.environmentScope || authorization.profileId !== r.profileId) fail('TEST_AUTHORIZATION');
  if (typeof r.manifestHash !== 'string' || !/^[0-9a-f]{64}$/.test(r.manifestHash)) fail('HASH');
  if (r.codeCompatibility !== 'e01-contract-v1') fail('CODE_COMPATIBILITY');
  const protocol = obj(r.protocolRange, ['min', 'max']); if (protocol.min !== 2 || protocol.max !== 2) fail('PROTOCOL');
  const u = obj(r.units, ['positionScale', 'resourceScale', 'time', 'logicStepMs']);
  if (u.positionScale !== 1000 || u.resourceScale !== 1000 || u.time !== 'integer-microseconds' || u.logicStepMs !== 10) fail('UNITS');
  const strategy = obj(r.strategy, ['id', 'testOnly']); if (strategy.id !== 'test-fill-missing' || strategy.testOnly !== true) fail('STRATEGY');
  const nodes = list(r.nodes, 1, 256).map(node);
  const result: TestRelease = { schemaVersion: 1, releaseId: str(r.releaseId, 64), manifestHash: r.manifestHash, profileId: str(r.profileId, 64), environmentScope: 'local-test', purpose: 'contract-fixture-only', codeCompatibility: str(r.codeCompatibility, 64), protocolRange: { min: 2, max: 2 }, units: { positionScale: 1000, resourceScale: 1000, time: 'integer-microseconds', logicStepMs: 10 }, provenance: list(r.provenance, 1, 8).map(v => str(v, 256)), entryDungeonRef: ref(r.entryDungeonRef), strategy: { id: 'test-fill-missing', testOnly: true }, nodes };
  validateReferences(nodes, result.entryDungeonRef);
  validateProfile(nodes);
  return freeze(result);
}
export function publicRelease(release: TestRelease) {
  return freeze({ schemaVersion: release.schemaVersion, releaseId: release.releaseId, manifestHash: release.manifestHash, codeCompatibility: release.codeCompatibility, protocolRange: release.protocolRange, units: release.units, nodes: release.nodes.filter(n => n.visibility === 'public') });
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(k => `${JSON.stringify(k)}:${canonical(record[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
/** Verify an already schema-valid release's exact canonical content. Hash excludes only manifestHash. */
export async function verifyTestRelease(text: string, authorization: TestAuthorization): Promise<TestRelease> {
  const release = loadTestRelease(text, authorization);
  const { manifestHash, ...body } = release;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(body)));
  const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  if (actual !== manifestHash) fail('MANIFEST_HASH');
  return release;
}
