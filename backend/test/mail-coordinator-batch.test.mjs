import test from 'node:test';
import assert from 'node:assert/strict';
import { MailCoordinator } from '../../client/assets/scripts/net/MailCoordinator.ts';

const identity = { sessionId: 's-mail-batch', sessionEpoch: 1, characterId: 'c-mail-batch' };

function setup(override) {
  const saved = new Map();
  const calls = [];
  const state = {
    charVer: 1,
    mails: [],
    rewards: [],
    unreadCount: 2,
    pendingCount: 0,
  };

  const persistence = {
    load: key => saved.get(key) ?? null,
    save: (key, value) => (value === null ? saved.delete(key) : saved.set(key, value)),
  };

  const transport = {
    send: async text => {
      const r = JSON.parse(text);
      calls.push(r);
      const replacement = override?.(r, state);
      if (replacement !== undefined) return JSON.stringify(await replacement);

      if (r.query === 'mail.list') {
        return JSON.stringify({
          requestId: r.requestId,
          serverTime: 1000,
          versions: [],
          data: {
            entries: state.mails,
            nextCursor: null,
          },
        });
      }

      if (r.query === 'reward.list') {
        return JSON.stringify({
          requestId: r.requestId,
          serverTime: 1000,
          versions: [],
          data: {
            entries: state.rewards,
            nextCursor: null,
          },
        });
      }

      if (r.query === 'delivery.summary') {
        return JSON.stringify({
          requestId: r.requestId,
          serverTime: 1000,
          versions: [],
          data: {
            unreadMailCount: state.unreadCount,
            pendingCount: state.pendingCount,
            asOf: 1000,
          },
        });
      }

      if (r.command === 'mail.claimAvailable') {
        const isStep1 = r.payload.cursor === null;
        if (isStep1) {
          return JSON.stringify({
            operationId: r.operationId,
            serverTime: 1000,
            replayed: false,
            outcome: {
              status: 'committed',
              resultVersions: [{ kind: 'character', id: identity.characterId, version: ++state.charVer }],
              data: {
                batchIntentId: r.payload.batchIntentId,
                state: 'partial',
                items: [
                  { childOperationId: `${r.payload.batchIntentId}-c0`, mailId: 'm1', attachmentId: 'a1', status: 'committed', deliveredQuantity: 5 },
                  { childOperationId: `${r.payload.batchIntentId}-c1`, mailId: 'm1', attachmentId: 'a2', status: 'rejected', deliveredQuantity: 0 },
                  { childOperationId: `${r.payload.batchIntentId}-c2`, mailId: 'm2', attachmentId: 'a3', status: 'committed', deliveredQuantity: 1 },
                  { childOperationId: `${r.payload.batchIntentId}-c3`, mailId: 'm2', attachmentId: 'a4', status: 'committed', deliveredQuantity: 2 },
                ],
                nextCursor: '4',
              },
            },
          });
        } else {
          state.unreadCount = 0;
          return JSON.stringify({
            operationId: r.operationId,
            serverTime: 1000,
            replayed: false,
            outcome: {
              status: 'committed',
              resultVersions: [{ kind: 'character', id: identity.characterId, version: ++state.charVer }],
              data: {
                batchIntentId: r.payload.batchIntentId,
                state: 'completed',
                items: [
                  { childOperationId: `${r.payload.batchIntentId}-c4`, mailId: 'm3', attachmentId: 'a5', status: 'committed', deliveredQuantity: 3 },
                  { childOperationId: `${r.payload.batchIntentId}-c5`, mailId: 'm3', attachmentId: 'a6', status: 'rejected', deliveredQuantity: 0 },
                ],
                nextCursor: null,
              },
            },
          });
        }
      }

      if (r.query === 'operation.get') {
        return JSON.stringify({
          requestId: r.requestId,
          serverTime: 1000,
          versions: [],
          data: {
            status: 'found',
            command: 'mail.claimAvailable',
            result: {
              operationId: r.payload.operationId,
              serverTime: 1000,
              replayed: true,
              outcome: {
                status: 'committed',
                resultVersions: [{ kind: 'character', id: identity.characterId, version: ++state.charVer }],
                data: {
                  batchIntentId: 'recovered-batch',
                  state: 'completed',
                  items: [
                    { childOperationId: 'recovered-batch-c0', mailId: 'm1', attachmentId: 'a1', status: 'committed', deliveredQuantity: 10 },
                  ],
                  nextCursor: null,
                },
              },
            },
          },
        });
      }

      throw new Error(`Unexpected request: ${JSON.stringify(r)}`);
    },
  };

  const coordinator = new MailCoordinator(transport, persistence);
  return { coordinator, persistence, calls, state };
}

test('MailCoordinator.claimAvailable auto-loops across steps until completed and aggregates delivered & skipped', async () => {
  const { coordinator, calls, state } = setup();
  await coordinator.init(identity);
  await coordinator.open('ctx-mailbox-1');

  assert.equal(coordinator.state.status, 'ready');

  const summary = await coordinator.claimAvailable();

  assert.equal(summary.completed, true);
  // Step 1 delivered: 5 + 1 + 2 = 8, skipped: 1
  // Step 2 delivered: 3, skipped: 1
  // Total delivered: 11, total skipped: 2
  assert.equal(summary.totalDelivered, 11);
  assert.equal(summary.skippedCount, 2);

  // Check calls: 2 steps were dispatched
  const batchSteps = calls.filter(c => c.command === 'mail.claimAvailable');
  assert.equal(batchSteps.length, 2);
  assert.equal(batchSteps[0].payload.cursor, null);
  assert.equal(batchSteps[1].payload.cursor, '4');
  assert.equal(batchSteps[0].payload.batchIntentId, batchSteps[1].payload.batchIntentId);

  // Status returned to ready
  assert.equal(coordinator.state.status, 'ready');
  assert.equal(coordinator.state.summary.unreadMailCount, 0);
});

test('MailCoordinator.claimAvailable halts immediately if panel is closed mid-loop', async () => {
  let stepCount = 0;
  const env = setup((r) => {
    if (r.command === 'mail.claimAvailable') {
      stepCount++;
      if (stepCount === 1) {
        // User closes panel before step 2 can proceed
        env.coordinator.close();
        return {
          operationId: r.operationId,
          serverTime: 1000,
          replayed: false,
          outcome: {
            status: 'committed',
            resultVersions: [{ kind: 'character', id: identity.characterId, version: 2 }],
            data: {
              batchIntentId: r.payload.batchIntentId,
              state: 'partial',
              items: [
                { childOperationId: `${r.payload.batchIntentId}-c0`, mailId: 'm1', attachmentId: 'a1', status: 'committed', deliveredQuantity: 2 },
              ],
              nextCursor: '4',
            },
          },
        };
      }
    }
    return undefined;
  });

  await env.coordinator.init(identity);
  await env.coordinator.open('ctx-mailbox-1');

  const result = await env.coordinator.claimAvailable();

  assert.equal(result.completed, false);
  // Step 2 was never sent because generation isolation stopped the loop
  const batchSteps = env.calls.filter(c => c.command === 'mail.claimAvailable');
  assert.equal(batchSteps.length, 1);
  assert.equal(env.coordinator.state.status, 'closed');
});

test('MailCoordinator.claimAvailable enters unknown on network drop and recovers via operation.get', async () => {
  let dropNetwork = true;
  const env = setup((r) => {
    if (r.command === 'mail.claimAvailable' && dropNetwork) {
      dropNetwork = false;
      throw new Error('NETWORK_TIMEOUT');
    }
    return undefined;
  });

  await env.coordinator.init(identity);
  await env.coordinator.open('ctx-mailbox-1');

  const result = await env.coordinator.claimAvailable();
  assert.equal(result.completed, false);
  assert.equal(env.coordinator.state.status, 'unknown');
  assert.ok(env.coordinator.state.pendingOperationId);

  // Recover
  await env.coordinator.recover();
  assert.equal(env.coordinator.state.status, 'ready');
  assert.equal(env.coordinator.state.pendingOperationId, null);
});
