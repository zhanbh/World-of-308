import test from 'node:test';
import assert from 'node:assert/strict';
import { MailCoordinator } from '../../client/assets/scripts/net/MailCoordinator.ts';

const identity = { sessionId: 's-mail', sessionEpoch: 1, characterId: 'c-mail' };

const initialMail = {
  mailId: 'mail-1',
  characterId: 'c-mail',
  createdAt: 1000,
  expiresAt: 5000,
  read: false,
  attachments: [
    {
      attachmentId: 'att-hp',
      kind: 'stack',
      templateRef: 'item:hp-potion-small-v1',
      quantityGranted: 8,
      quantityClaimed: 0,
      binding: { kind: 'character', characterId: 'c-mail' },
    },
  ],
};

const initialReward = {
  grantId: 'grant-1',
  itemId: 'eq-sword-1',
  characterId: 'c-mail',
  createdAt: 1000,
  state: 'pending',
};

function setup(override) {
  const saved = new Map();
  const calls = [];
  const state = {
    charVer: 1,
    mails: [structuredClone(initialMail)],
    rewards: [structuredClone(initialReward)],
    unreadCount: 1,
    pendingCount: 1,
  };

  const persistence = {
    load: (key) => saved.get(key) ?? null,
    save: (key, value) => (value === null ? saved.delete(key) : saved.set(key, value)),
  };

  const transport = {
    send: async (text) => {
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
            entries: state.mails.map(m => ({
              mailId: m.mailId,
              characterId: m.characterId,
              createdAt: m.createdAt,
              expiresAt: m.expiresAt,
              read: m.read,
              attachments: m.attachments,
            })),
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
            entries: state.rewards.map(rw => ({
              grantId: rw.grantId,
              itemId: rw.itemId,
              characterId: rw.characterId,
              createdAt: rw.createdAt,
              state: rw.state,
            })),
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

      if (r.command === 'mail.markRead') {
        state.charVer++;
        const target = state.mails.find(m => m.mailId === r.payload.mailId);
        if (target) target.read = true;
        return JSON.stringify({
          operationId: r.operationId,
          serverTime: 1000,
          replayed: false,
          outcome: {
            status: 'committed',
            resultVersions: [
              { kind: 'character', id: 'c-mail', version: state.charVer },
              { kind: 'mail', id: r.payload.mailId, version: 1 },
            ],
            data: { mailId: r.payload.mailId, read: true },
          },
        });
      }

      if (r.command === 'mail.claimAttachment') {
        state.charVer++;
        const target = state.mails.find(m => m.mailId === r.payload.mailId);
        if (target) {
          const att = target.attachments.find(a => a.attachmentId === r.payload.attachmentId);
          if (att) att.quantityClaimed = att.quantityGranted;
        }
        state.unreadCount = 0;
        return JSON.stringify({
          operationId: r.operationId,
          serverTime: 1000,
          replayed: false,
          outcome: {
            status: 'committed',
            resultVersions: [
              { kind: 'character', id: 'c-mail', version: state.charVer },
              { kind: 'mail', id: r.payload.mailId, version: 2 },
              { kind: 'container', id: 'bag-1', version: 2 },
            ],
            data: {
              mailId: r.payload.mailId,
              attachmentId: r.payload.attachmentId,
              deliveredQuantity: 8,
            },
          },
        });
      }

      if (r.command === 'reward.claim') {
        state.charVer++;
        const target = state.rewards.find(rw => rw.grantId === r.payload.grantId);
        if (target) target.state = 'delivered';
        state.pendingCount = 0;
        return JSON.stringify({
          operationId: r.operationId,
          serverTime: 1000,
          replayed: false,
          outcome: {
            status: 'committed',
            resultVersions: [
              { kind: 'character', id: 'c-mail', version: state.charVer },
              { kind: 'grant', id: r.payload.grantId, version: 1 },
              { kind: 'container', id: 'bag-1', version: 3 },
            ],
            data: {
              grantId: r.payload.grantId,
              itemId: 'eq-sword-1',
              state: 'delivered',
            },
          },
        });
      }

      if (r.command === 'mail.delete') {
        state.charVer++;
        state.mails = state.mails.filter(m => m.mailId !== r.payload.mailId);
        return JSON.stringify({
          operationId: r.operationId,
          serverTime: 1000,
          replayed: false,
          outcome: {
            status: 'committed',
            resultVersions: [
              { kind: 'character', id: 'c-mail', version: state.charVer },
              { kind: 'mail', id: r.payload.mailId, version: 3 },
            ],
            data: { mailId: r.payload.mailId, deleted: true },
          },
        });
      }

      if (r.query === 'operation.get') {
        return JSON.stringify({
          requestId: r.requestId,
          serverTime: 1000,
          versions: [],
          data: {
            status: 'found',
            command: 'mail.markRead',
            result: {
              operationId: r.payload.operationId,
              serverTime: 1000,
              replayed: true,
              outcome: {
                status: 'committed',
                resultVersions: [{ kind: 'character', id: 'c-mail', version: state.charVer + 1 }],
                data: { mailId: 'mail-1', read: true },
              },
            },
          },
        });
      }

      throw new Error(`Unexpected request: ${JSON.stringify(r)}`);
    },
  };

  const coordinator = new MailCoordinator(transport, persistence);
  coordinator.init(identity);
  return { coordinator, calls, state, persistence };
}

test('mail coordinator initializes and transitions from loading to ready', async () => {
  const { coordinator, calls } = setup();
  assert.equal(coordinator.state.status, 'closed');

  await coordinator.open('ctx-mailbox-1');

  assert.equal(coordinator.state.status, 'ready');
  assert.equal(coordinator.state.contextId, 'ctx-mailbox-1');
  assert.equal(coordinator.state.mails.length, 1);
  assert.equal(coordinator.state.mails[0].mailId, 'mail-1');
  assert.equal(coordinator.state.rewards.length, 1);
  assert.equal(coordinator.state.rewards[0].grantId, 'grant-1');
  assert.equal(coordinator.state.summary.unreadMailCount, 1);
  assert.equal(coordinator.state.summary.pendingCount, 1);

  // Queries sent: mail.list, reward.list, delivery.summary
  const queries = calls.filter(c => c.query).map(c => c.query);
  assert.deepEqual(queries, ['mail.list', 'reward.list', 'delivery.summary']);
});

test('mail coordinator schedules markRead and updates mail state', async () => {
  const { coordinator } = setup();
  await coordinator.open('ctx-mailbox-1');

  await coordinator.markRead('mail-1');

  assert.equal(coordinator.state.status, 'ready');
  assert.equal(coordinator.state.mails[0].read, true);
  assert.equal(coordinator.state.characterVersion, 2);
});

test('mail coordinator schedules claimAttachment and updates attachment status', async () => {
  const { coordinator } = setup();
  await coordinator.open('ctx-mailbox-1');

  await coordinator.claimAttachment('mail-1', 'att-hp');

  assert.equal(coordinator.state.status, 'ready');
  assert.equal(coordinator.state.mails[0].attachments[0].quantityClaimed, 8);
  assert.equal(coordinator.state.summary.unreadMailCount, 0);
});

test('mail coordinator schedules claimReward and updates reward state', async () => {
  const { coordinator } = setup();
  await coordinator.open('ctx-mailbox-1');

  await coordinator.claimReward('grant-1');

  assert.equal(coordinator.state.status, 'ready');
  assert.equal(coordinator.state.rewards[0].state, 'delivered');
  assert.equal(coordinator.state.summary.pendingCount, 0);
});

test('mail coordinator schedules deleteMail and removes mail', async () => {
  const { coordinator } = setup();
  await coordinator.open('ctx-mailbox-1');

  await coordinator.deleteMail('mail-1');

  assert.equal(coordinator.state.status, 'ready');
  assert.equal(coordinator.state.mails.length, 0);
});

test('mail coordinator transitions to failed on rejected outcome', async () => {
  const { coordinator } = setup(r => {
    if (r.command === 'mail.delete') {
      return {
        operationId: r.operationId,
        serverTime: 1000,
        replayed: false,
        outcome: {
          status: 'rejected',
          code: 'UNCLAIMED_ATTACHMENTS',
        },
      };
    }
  });

  await coordinator.open('ctx-mailbox-1');
  await coordinator.deleteMail('mail-1');

  assert.equal(coordinator.state.status, 'failed');
  assert.equal(coordinator.state.code, 'UNCLAIMED_ATTACHMENTS');
});

test('mail coordinator handles network drop to unknown and recovers via operation.get', async () => {
  let dropped = true;
  const { coordinator, persistence } = setup(r => {
    if (r.command === 'mail.markRead' && dropped) {
      dropped = false;
      throw new Error('NETWORK_DROP');
    }
  });

  await coordinator.open('ctx-mailbox-1');
  await coordinator.markRead('mail-1');

  assert.equal(coordinator.state.status, 'unknown');
  assert.ok(coordinator.state.pendingOperationId);

  // Recovery
  await coordinator.recover();
  assert.equal(coordinator.state.status, 'ready');
  assert.equal(coordinator.state.pendingOperationId, null);
});

test('mail coordinator generation isolation drops late responses after close', async () => {
  let finishSend;
  const slowPromise = new Promise(resolve => {
    finishSend = resolve;
  });

  const { coordinator } = setup(r => {
    if (r.query === 'mail.list') {
      return slowPromise;
    }
  });

  const openPromise = coordinator.open('ctx-mailbox-1');
  coordinator.close();

  finishSend({
    requestId: 'slow',
    serverTime: 1000,
    versions: [],
    data: { entries: [], nextCursor: null },
  });

  await openPromise;
  assert.equal(coordinator.state.status, 'closed');
});
