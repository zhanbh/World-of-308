import type { ContainerEntity, MailEntity, MailAttachment } from '../character/character-model.ts';

export const MAX_STACK_QUANTITY = 20;

/**
 * Mail expiry rule:
 * Mail is strictly expired when current server time is greater than or equal to expiresAt.
 */
export function isMailExpired(mail: Pick<MailEntity, 'expiresAt'>, now: number): boolean {
  return now >= mail.expiresAt;
}

/**
 * Manual deletion protection rule:
 * Mails containing any attachments that have not been fully claimed cannot be manually deleted.
 */
export function canDeleteMail(
  mail: Pick<MailEntity, 'attachments'>
): boolean {
  if (!mail.attachments || mail.attachments.length === 0) {
    return true;
  }
  return !mail.attachments.some(
    attachment => attachment.quantityClaimed < attachment.quantityGranted
  );
}

/**
 * Capacity calculation for claiming stackable attachments into a container:
 * Determines how many items from the attachment can be accepted by the container.
 * Returns 0 if container has no room for even a single item (BAG_FULL).
 * Returns Math.min(remainingQuantity, availableCapacity) otherwise.
 */
export function calculateStackClaimQuantity(
  remainingQuantity: number,
  templateRef: { id: string },
  binding: { kind: string; accountId?: string; characterId?: string },
  backpack: ContainerEntity
): number {
  if (remainingQuantity <= 0) {
    return 0;
  }

  const occupiedSlotCount = Object.keys(backpack.slots).length;
  const freeSlotCount = Math.max(0, backpack.capacity - occupiedSlotCount);

  let existingSpace = 0;
  for (const slot of Object.values(backpack.slots)) {
    if (slot && slot.kind === 'stack' && slot.templateRef.id === templateRef.id) {
      const bindingMatches =
        slot.binding.kind === binding.kind &&
        slot.binding.accountId === binding.accountId &&
        slot.binding.characterId === binding.characterId;
      if (bindingMatches) {
        existingSpace += Math.max(0, MAX_STACK_QUANTITY - slot.quantity);
      }
    }
  }

  const freeSlotSpace = freeSlotCount * MAX_STACK_QUANTITY;
  const totalAvailableCapacity = existingSpace + freeSlotSpace;

  if (totalAvailableCapacity <= 0) {
    return 0;
  }

  return Math.min(remainingQuantity, totalAvailableCapacity);
}

/**
 * Eligibility check for claiming equipment attachment or pending reward:
 * Equipment requires at least 1 unoccupied container slot.
 */
export function canClaimEquipmentAttachment(backpack: ContainerEntity): boolean {
  const occupiedSlotCount = Object.keys(backpack.slots).length;
  return occupiedSlotCount < backpack.capacity;
}
