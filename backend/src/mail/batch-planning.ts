import type { MailEntity, MailAttachment } from '../character/character-model.ts';
import { isMailExpired } from './mail-rules.ts';

export const MAX_BATCH_SCAN_MAILS = 100;
export const MAX_BATCH_CANDIDATES = 20;
export const BATCH_STEP_SIZE = 4;

export interface BatchCandidateItem {
  mailId: string;
  attachmentId: string;
  kind: 'equipment' | 'stack';
  childOperationId: string;
}

export interface BatchPlan {
  batchIntentId: string;
  candidates: BatchCandidateItem[];
}

/**
 * Plans a delivery batch by scanning up to 100 non-deleted, non-expired mails
 * and collecting up to 20 unclaimed attachments.
 */
export function planBatchFromMails(
  batchIntentId: string,
  mails: MailEntity[],
  now: number,
  maxMails = MAX_BATCH_SCAN_MAILS,
  maxCandidates = MAX_BATCH_CANDIDATES,
): BatchPlan {
  // Sort reverse-chronologically by createdAt
  const sorted = [...mails].filter(m => m.status !== 'deleted');
  sorted.sort((a, b) => b.createdAt - a.createdAt);

  const scanned = sorted.slice(0, maxMails);
  const candidates: BatchCandidateItem[] = [];

  for (const mail of scanned) {
    if (isMailExpired(mail, now)) {
      continue;
    }
    for (const attachment of mail.attachments) {
      if (
        attachment.quantityClaimed < attachment.quantityGranted &&
        attachment.state !== 'claimed'
      ) {
        if (candidates.length >= maxCandidates) {
          break;
        }
        const index = candidates.length;
        const childOperationId = `${batchIntentId}-c${index}`;
        candidates.push({
          mailId: mail.id,
          attachmentId: attachment.attachmentId,
          kind: attachment.kind,
          childOperationId,
        });
      }
    }
    if (candidates.length >= maxCandidates) {
      break;
    }
  }

  return {
    batchIntentId,
    candidates,
  };
}

/**
 * Plans a delivery batch from explicit client selection (up to 20 attachments).
 */
export function planBatchFromSelection(
  batchIntentId: string,
  selection: Array<{ mailId: string; attachmentId: string }>,
  mailsMap: Map<string, MailEntity>,
  maxCandidates = MAX_BATCH_CANDIDATES,
): BatchPlan {
  const boundedSelection = selection.slice(0, maxCandidates);
  const candidates: BatchCandidateItem[] = [];

  for (let i = 0; i < boundedSelection.length; i++) {
    const item = boundedSelection[i]!;
    const mail = mailsMap.get(item.mailId);
    const attachment = mail?.attachments.find(a => a.attachmentId === item.attachmentId);
    candidates.push({
      mailId: item.mailId,
      attachmentId: item.attachmentId,
      kind: attachment?.kind ?? 'stack',
      childOperationId: `${batchIntentId}-c${i}`,
    });
  }

  return {
    batchIntentId,
    candidates,
  };
}

/**
 * Slices candidate items for single-request execution (up to 4 items)
 * based on current offset cursor.
 */
export function sliceBatchStep(
  candidates: BatchCandidateItem[],
  cursor: string | null,
  stepSize = BATCH_STEP_SIZE,
): {
  stepItems: BatchCandidateItem[];
  nextCursor: string | null;
  offset: number;
} {
  let offset = 0;
  if (cursor !== null && cursor !== '') {
    const parsed = parseInt(cursor, 10);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      offset = parsed;
    }
  }

  const stepItems = candidates.slice(offset, offset + stepSize);
  const nextOffset = offset + stepItems.length;
  const nextCursor = nextOffset < candidates.length ? String(nextOffset) : null;

  return {
    stepItems,
    nextCursor,
    offset,
  };
}
