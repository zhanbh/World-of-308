import test from 'node:test';
import assert from 'node:assert/strict';
import { createChallengePreview, createPreviewServer } from '../../client/tools/challenge-preview-server.mjs';

test('challenge preview server bootstraps and handles rpc queries correctly', async () => {
  const preview = await createChallengePreview();
  assert.ok(preview.bootstrap.previewInstanceId);
  assert.equal(preview.bootstrap.context.protocolVersion, 2);
  assert.ok(preview.bootstrap.config);
  assert.ok(preview.bootstrap.basic);

  // Test direct rpc query for challenge.get
  const queryResult = await preview.rpc({
    protocolVersion: 2,
    sessionId: preview.bootstrap.context.sessionId,
    sessionEpoch: preview.bootstrap.context.sessionEpoch,
    query: 'challenge.get',
    requestId: 'test-req',
    payload: { challengeId: preview.bootstrap.context.challengeId }
  });

  assert.ok(queryResult);
  assert.equal(queryResult.requestId, 'test-req');
  assert.equal(queryResult.data.roomPhase, 'active');

  // Test server http handler over loopback
  const server = createPreviewServer(preview);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // 1. Fetch bootstrap
    const bootRes = await fetch(`${baseUrl}/bootstrap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(bootRes.status, 200);
    const bootData = await bootRes.json();
    assert.equal(bootData.context.protocolVersion, 2);
    assert.equal(bootData.context.challengeId, preview.bootstrap.context.challengeId);

    // 2. Query challenge.get via rpc endpoint
    const rpcRes = await fetch(`${baseUrl}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        protocolVersion: 2,
        sessionId: bootData.context.sessionId,
        sessionEpoch: bootData.context.sessionEpoch,
        query: 'challenge.get',
        requestId: 'http-req',
        payload: { challengeId: bootData.context.challengeId }
      })
    });
    assert.equal(rpcRes.status, 200);
    const rpcData = await rpcRes.json();
    assert.equal(rpcData.requestId, 'http-req');
    assert.equal(rpcData.data.roomPhase, 'active');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
