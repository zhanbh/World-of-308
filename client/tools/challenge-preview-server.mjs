/**
 * Explicit loopback-only, ephemeral ST12 challenge/combat preview fixture.
 * Never imported by the game or a production service.
 */
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { monsterFixture } from '../../backend/test/fixtures/monster-fixture.mjs';
import { localTacticsConfig } from '../../shared/src/monster-tactics.ts';

export async function createChallengePreview(tacticsPatch = localTacticsConfig({ 'humanoid@1': 'boss' }, 'normal')) {
  const h = await monsterFixture(tacticsPatch);
  await h.grow(20);

  const context = {
    protocolVersion: 2,
    sessionId: h.auth.sessionId,
    sessionEpoch: h.auth.sessionEpoch,
    characterId: h.characterId,
    rolePlayEpoch: h.character().rolePlayEpoch,
    challengeId: h.challengeId
  };

  const initialProof = await h.service.query({
    ...h.auth,
    query: 'simulation.confirmed',
    requestId: 'proof-init',
    payload: {
      characterId: h.characterId,
      rolePlayEpoch: h.character().rolePlayEpoch,
      challengeId: h.challengeId,
      sceneEpoch: 1,
      timelineEpoch: 1,
      checkpointRevision: h.ready.outcome.data.state.checkpointRevision,
      pageIndex: 0
    }
  });

  const targetRules = Object.fromEntries(
    initialProof.records
      .filter(r => r.kind === 'actor' && r.actorId !== h.characterId)
      .map(r => [r.actorId, { mitigation: { n: '0', d: '1' }, evasion: { n: '0', d: '1' }, damageImmune: false, controlImmune: false }])
  );

  const { attackPowerByLevel, ...rates } = h.profile.attributes;
  const basic = {
    profile: h.profile,
    cross: { level: 20, controlled: false },
    stats: { attackPower: attackPowerByLevel[0], ...rates, x: 0, y: 0, facing: 1 },
    targetRules
  };

  return {
    bootstrap: {
      previewInstanceId: globalThis.crypto.randomUUID(),
      identity: { sessionId: h.auth.sessionId, sessionEpoch: h.auth.sessionEpoch, characterId: h.characterId },
      context,
      config: h.config,
      prepareCommand: h.prepareCommand,
      basic
    },
    async rpc(value) {
      if (value && Object.hasOwn(value, 'query')) return h.service.query(value);
      return h.service.execute(value);
    }
  };
}

export function createPreviewServer(preview) {
  return http.createServer(async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    const origin = req.headers.origin;
    if (origin) {
      let url;
      try { url = new URL(origin); } catch { send(403, { error: 'LOCAL_ONLY' }); return; }
      if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
        send(403, { error: 'LOCAL_ONLY' }); return;
      }
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    if (!/^(?:127\.0\.0\.1|localhost):\d+$/.test(req.headers.host ?? '')) {
      send(403, { error: 'LOCAL_ONLY' }); return;
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.writeHead(204); res.end(); return;
    }
    if (req.method !== 'POST' || !['/bootstrap', '/rpc'].includes(req.url) || req.headers['content-type']?.split(';')[0] !== 'application/json') {
      send(404, { error: 'NOT_FOUND' }); return;
    }
    let raw = '', bytes = 0;
    try {
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 65536) { send(413, { error: 'PAYLOAD_TOO_LARGE' }); return; }
        raw += chunk.toString('utf8');
      }
      const value = JSON.parse(raw);
      send(200, req.url === '/bootstrap' ? preview.bootstrap : await preview.rpc(value));
    } catch {
      if (!res.headersSent) send(400, { error: 'INVALID_REQUEST' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.argv[2] ?? 8790);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('INVALID_PORT');
  const server = createPreviewServer(await createChallengePreview());
  server.listen(port, '127.0.0.1', () => console.log(`ST12 challenge preview: http://127.0.0.1:${port}; temporary local data.`));
}
