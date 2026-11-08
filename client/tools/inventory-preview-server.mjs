/** Explicit loopback-only, ephemeral ST04 fixture. Never imported by the game or a production service. */
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { MemoryStore } from '../../backend/src/adapters/memory-store.ts';
import { createContextIdentityPort, loginKey } from '../../backend/src/identity/identity-v2.ts';
import { LoginService } from '../../backend/src/identity/login-service.ts';
import { CharacterService } from '../../backend/src/character/character-service.ts';
import { InventoryService } from '../../backend/src/inventory/inventory-service.ts';
import { BankService } from '../../backend/src/bank/bank-service.ts';
import { TownService } from '../../backend/src/town/town-service.ts';
import { EquipmentService } from '../../backend/src/equipment/equipment-service.ts';
import { BANK_TEST_CONFIG } from '../../backend/test/fixtures/bank-fixture.mjs';

export async function createInventoryPreview() {
  const store = new MemoryStore(), clock = { now: () => Date.now() };
  const identity = createContextIdentityPort({ appId: 'local-preview', environment: 'isolated-test', sources: ['local-fixture'] }, () => ({ APPID: 'local-preview', ENV: 'isolated-test', SOURCE: 'local-fixture', OPENID: 'preview-player' }));
  const login = new LoginService({ store, clock, identity, ticketTtlMs: 60000, initialUnlocks: { first: ['normal'] }, holdingsDomainRef: 'test-domain' });
  const characters = new CharacterService({ store, clock, initialProgressionRef: { id: 'progression-warrior-v1', version: 1 }, initialWeaponTemplateRef: { id: 'equipment:warrior-sword-white-v1', version: 1 } });
  const prepared = await login.execute({ protocolVersion: 2, command: 'session.prepare', payload: { launchId: 'preview-launch', prepareOperationId: 'prepare-preview' } });
  if (prepared.outcome.status !== 'committed') throw new Error('PREVIEW_LOGIN_FAILED');
  const opened = await login.execute({ protocolVersion: 2, command: 'session.commit', payload: { launchId: 'preview-launch', ticketId: prepared.outcome.data.ticketId, openOperationId: 'open-preview' } });
  if (opened.outcome.status !== 'committed') throw new Error('PREVIEW_LOGIN_FAILED');
  const session = opened.outcome.data;
  const auth = { protocolVersion: 2, sessionId: session.sessionId, sessionEpoch: session.sessionEpoch };
  const created = await characters.execute({ ...auth, command: 'character.create', operationId: 'create-preview', expected: [], payload: { classId: 'warrior', characterName: '背包试玩' } });
  if (created.outcome.status !== 'committed' || !('characterId' in created.outcome.data)) throw new Error('PREVIEW_CHARACTER_FAILED');
  const characterId = created.outcome.data.characterId;
  const selected = await characters.execute({ ...auth, command: 'character.select', operationId: 'select-preview', expected: [], payload: { characterId } });
  if (selected.outcome.status !== 'committed') throw new Error('PREVIEW_SELECT_FAILED');
  const town = new TownService({ store, clock });
  const exited = await town.exitInn({ ...auth, command: 'scene.exitInn', operationId: 'exit-preview', expected: [], payload: { characterId, exitAnchorId: 'inn-door' } });
  if (exited.outcome.status !== 'committed') throw new Error('PREVIEW_TOWN_FAILED');
  const catalog = {
    'item:hp-potion-small-v1': { version: 1, kind: 'consumable', quickAssignable: true },
    'item:mp-potion-small-v1': { version: 1, kind: 'consumable', quickAssignable: true },
    'preview:ore': { version: 1, kind: 'material', quickAssignable: false },
  };
  const journalId = await loginKey('previewJournal', [characterId]);
  // One isolated, admitted fixture source and its complete stack outputs. No claim to be live reward delivery.
  await store.run(async tx => {
    const character = await tx.get(characterId), bag = await tx.get(character.backpackId);
    const binding = { kind: 'character', accountId: character.accountId, characterId };
    const stack = (stackId, template, quantity, ordinal) => ({ kind: 'stack', stackId, templateRef: { id: template, version: 1 }, quantity, binding, traceRef: `${journalId}:${ordinal}` });
    const slots = { 1: stack('preview-hp-a', 'item:hp-potion-small-v1', 3, 0), 6: stack('preview-mp-a', 'item:mp-potion-small-v1', 2, 1), 9: stack('preview-hp-b', 'item:hp-potion-small-v1', 5, 2), 13: stack('preview-mp-b', 'item:mp-potion-small-v1', 6, 3), 18: stack('preview-ore', 'preview:ore', 7, 4) };
    const starter = await tx.get(character.equipped.weapon);
    if (!starter) throw new Error('PREVIEW_STARTER_MISSING');
    const equipment = [
      { ...starter, id: 'preview:plain-blades', templateRef: { id: 'preview:plain-blades-v1', version: 1 }, slotKind: 'weapon', quality: 'white', itemLevel: 10, enhancementLevel: 0, enhancementBonus: undefined, rolledAffixes: [{ stat: 'strength', value: 8 }], durability: { ...starter.durability, current: 120, max: 120 } },
      { ...starter, id: 'preview:rift-blades', templateRef: { id: 'preview:rift-blades-v1', version: 1 }, slotKind: 'weapon', quality: 'purple', itemLevel: 30, enhancementLevel: 10, enhancementBonus: { configRef: 'preview:enhancement-v1', level: 10, attackPower: '60' }, rolledAffixes: ['attackPower', 'strength', 'agility', 'intelligence', 'maxHp', 'maxMp', 'armor', 'crit', 'physicalCrit', 'magicalCrit', 'haste', 'mastery', 'hit', 'armorPenetration', 'attackSpeed', 'resistance'].map((stat, i) => ({ stat, value: i + 1 })), durability: { ...starter.durability, current: 0, max: 120 }, setRef: { id: 'preview:rift-set-v1', version: 1 } },
      { ...starter, id: 'preview:ring', templateRef: { id: 'preview:ring-v1', version: 1 }, slotKind: 'ring', quality: 'blue', itemLevel: 30, enhancementLevel: 0, enhancementBonus: undefined, rolledAffixes: [{ stat: 'strength', value: 12 }], durability: { wearEnabled: false, current: null, max: null, policyRef: 'no-wear-v1' } },
    ].map((item, index) => ({ ...item, version: 1, sourceKey: journalId, sourceOrdinal: index + 5,
      sourceLocator: { kind: 'grant', grantId: 'isolated-preview-ui-equipment' }, holderCharacterId: characterId,
      location: { kind: 'container', containerId: bag.id }, binding, lifecycle: 'active' }));
    equipment.forEach((item, index) => {
      tx.set(item.id, item);
      slots[[0, 4, 7][index]] = { kind: 'equipment', itemId: item.id, sortHeader: { itemLevel: item.itemLevel, quality: item.quality, slotKind: item.slotKind } };
    });
    tx.set(journalId, { schemaVersion: 2, id: journalId, accountId: character.accountId, characterId, command: 'isolated-preview.seed', changes: { outputs: [...Object.values(slots).filter(s => s.kind === 'stack').map((s, ordinal) => ({ ...s, ordinal })), ...equipment.map(item => ({ ...item, ordinal: item.sourceOrdinal }))] } });
    tx.set(bag.id, { ...bag, slots, version: bag.version + 1 });
    const account = await tx.get(character.accountId), wallet = await tx.get(account.walletId);
    tx.set(wallet.id, { ...wallet, gold: '10000', points: '0' });
  });
  const service = new InventoryService({ store, clock, identity, catalog });
  const equipment = new EquipmentService({ store, clock, identity });
  const bank = new BankService({ store, clock, identity, catalog, expansionConfig: BANK_TEST_CONFIG });
  return {
    bootstrap: { previewInstanceId: globalThis.crypto.randomUUID(), identity: { sessionId: session.sessionId, sessionEpoch: session.sessionEpoch, characterId }, templateLabels: { 'item:hp-potion-small-v1': '生命药水', 'item:mp-potion-small-v1': '法力药水', 'preview:ore': '矿石', 'preview:plain-blades-v1': '新兵冷钢双刀', 'preview:rift-blades-v1': '被遗忘的远古守望者·裂隙余烬冷钢双刀', 'preview:ring-v1': '秘银指环', 'preview:rift-set-v1': '裂隙守望者' }, assignableTemplates: ['item:hp-potion-small-v1', 'item:mp-potion-small-v1'] },
    async rpc(value) {
      if (value?.query === 'equipment.get') return equipment.query(value);
      if (value?.query === 'inventory.expansionQuote') return bank.query(value);
      if (value?.command === 'inventory.expand') return bank.execute(value);
      return value && Object.hasOwn(value, 'query') ? service.query(value) : service.execute(value);
    },
  };
}

export function createPreviewServer(preview) {
  return http.createServer(async (req, res) => {
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
    // Reject browser requests from non-local origins, including DNS-rebinding host names.
    const origin = req.headers.origin;
    if (origin) {
      let url; try { url = new URL(origin); } catch { send(403, { error: 'LOCAL_ONLY' }); return; }
      if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) { send(403, { error: 'LOCAL_ONLY' }); return; }
      res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
    }
    if (!/^(?:127\.0\.0\.1|localhost):\d+$/.test(req.headers.host ?? '')) { send(403, { error: 'LOCAL_ONLY' }); return; }
    if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS'); res.writeHead(204); res.end(); return; }
    if (req.method !== 'POST' || !['/bootstrap', '/rpc'].includes(req.url) || req.headers['content-type']?.split(';')[0] !== 'application/json') { send(404, { error: 'NOT_FOUND' }); return; }
    let raw = '', bytes = 0;
    try {
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 16384) { send(413, { error: 'PAYLOAD_TOO_LARGE' }); return; } raw += chunk.toString('utf8'); }
      const value = JSON.parse(raw);
      send(200, req.url === '/bootstrap' ? preview.bootstrap : await preview.rpc(value));
    } catch { if (!res.headersSent) send(400, { error: 'INVALID_REQUEST' }); }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.argv[2] ?? 8788);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('INVALID_PORT');
  const server = createPreviewServer(await createInventoryPreview());
  server.listen(port, '127.0.0.1', () => console.log(`ST04 isolated local preview: http://127.0.0.1:${port}; all data is temporary, no live assets.`));
}
