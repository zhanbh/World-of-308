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
    tx.set(journalId, { schemaVersion: 2, id: journalId, accountId: character.accountId, characterId, command: 'isolated-preview.seed', changes: { outputs: Object.values(slots).map((s, ordinal) => ({ ...s, ordinal })) } });
    tx.set(bag.id, { ...bag, slots, version: bag.version + 1 });
    const account = await tx.get(character.accountId), wallet = await tx.get(account.walletId);
    tx.set(wallet.id, { ...wallet, gold: '10000', points: '0' });
  });
  const service = new InventoryService({ store, clock, identity, catalog });
  const bank = new BankService({ store, clock, identity, catalog, expansionConfig: BANK_TEST_CONFIG });
  return {
    bootstrap: { previewInstanceId: globalThis.crypto.randomUUID(), identity: { sessionId: session.sessionId, sessionEpoch: session.sessionEpoch, characterId }, templateLabels: { 'item:hp-potion-small-v1': '生命药水', 'item:mp-potion-small-v1': '法力药水', 'preview:ore': '矿石' }, assignableTemplates: ['item:hp-potion-small-v1', 'item:mp-potion-small-v1'] },
    async rpc(value) {
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
