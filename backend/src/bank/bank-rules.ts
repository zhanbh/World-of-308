import type { ContainerEntity, ContainerSlotStack, EquipmentEntity } from '../character/character-model.ts';
import { validateBackpack, type InventoryCatalog } from '../inventory/organize.ts';
import type { BankExpansionConfig, BankCurrency, ExpansionOffer, StackPlan } from './bank-model.ts';
import type { WalletEntity } from '../shop/shop-model.ts';
import { resource } from '../../../shared/src/exact-values.ts';
export class BankRefusal extends Error {
    readonly code: string;
    readonly availableCapacity?: number;
    constructor(code: string, availableCapacity?: number) { super(code); this.name = 'BankRefusal'; this.code = code; this.availableCapacity = availableCapacity; }
}
function fail(code: string, capacity?: number): never { throw new BankRefusal(code, capacity); }
const ref = (s: unknown): s is string => typeof s === 'string' && /^[\x21-\x7e]{1,128}$/.test(s);
export function validateBankContainer(container: ContainerEntity, catalog: InventoryCatalog): void {
    if (!container || !['backpack', 'personalVault', 'accountVault'].includes(container.kind))
        fail('CONFIG_NOT_READY');
    if (container.kind === 'accountVault') {
        if (container.capacity !== 100 || container.characterId !== undefined || (container.stage !== undefined && container.stage !== 0))
            fail('CONFIG_NOT_READY');
        for (const slot of Object.values(container.slots))
            if (slot.kind === 'stack' && slot.binding.kind === 'character')
                fail('BINDING_RESTRICTED');
    }
    try {
        validateBackpack({ ...container, kind: 'backpack', characterId: container.characterId ?? '__account_vault__', stage: container.kind === 'accountVault' ? 4 : container.stage }, catalog);
    }
    catch (error) {
        fail(error instanceof Error ? error.message : 'CONFIG_NOT_READY');
    }
}
function pair(source: ContainerEntity, target: ContainerEntity, catalog: InventoryCatalog): void {
    validateBankContainer(source, catalog);
    validateBankContainer(target, catalog);
    if (source.id === target.id || source.accountId !== target.accountId || (source.kind === 'backpack') === (target.kind === 'backpack'))
        fail('LOCATION_NOT_ALLOWED');
    if (source.characterId && target.characterId && source.characterId !== target.characterId)
        fail('NOT_FOUND_OR_FORBIDDEN');
    const sourceIds = new Set(Object.values(source.slots).map(s => s.kind === 'stack' ? s.stackId : s.itemId));
    if (Object.values(target.slots).some(s => sourceIds.has(s.kind === 'stack' ? s.stackId : s.itemId)))
        fail('CONFIG_NOT_READY');
}
function bindingAllowed(binding: ContainerSlotStack['binding'], source: ContainerEntity, target: ContainerEntity): void {
    if (binding.kind === 'character' && (target.kind === 'accountVault' || binding.accountId !== source.accountId || binding.characterId !== target.characterId))
        fail('BINDING_RESTRICTED');
    if (binding.kind === 'account' && (binding.accountId !== source.accountId || binding.characterId !== undefined))
        fail('BINDING_RESTRICTED');
    if (binding.kind === 'none' && (binding.accountId !== undefined || binding.characterId !== undefined))
        fail('CONFIG_NOT_READY');
    if (!['none', 'account', 'character'].includes(binding.kind))
        fail('CONFIG_NOT_READY');
}
const pool = (s: ContainerSlotStack) => JSON.stringify([s.templateRef.id, s.templateRef.version, s.binding.kind, s.binding.accountId ?? null, s.binding.characterId ?? null]);
export function planStackTransfer(source: ContainerEntity, target: ContainerEntity, stackId: string, quantity: number, journalId: string, catalog: InventoryCatalog): StackPlan {
    pair(source, target, catalog);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20)
        fail('INVALID_ARGUMENT');
    if (!ref(journalId) || journalId.length > 120)
        fail('CONFIG_NOT_READY');
    const found = Object.entries(source.slots).find(([, s]) => s.kind === 'stack' && s.stackId === stackId);
    if (!found || found[1].kind !== 'stack')
        fail('ITEM_NOT_ELIGIBLE');
    const [sourceIndex, original] = found as [
        string,
        ContainerSlotStack
    ];
    if (quantity > original.quantity)
        fail('ITEM_NOT_ELIGIBLE');
    bindingAllowed(original.binding, source, target);
    const compatible = Object.entries(target.slots).sort(([a], [b]) => Number(a) - Number(b)).filter(([, s]) => s.kind === 'stack' && pool(s) === pool(original)) as Array<[
        string,
        ContainerSlotStack
    ]>;
    const empty = Array.from({ length: target.capacity }, (_, i) => i).filter(i => !Object.hasOwn(target.slots, i));
    const availableCapacity = compatible.reduce((n, [, s]) => n + 20 - s.quantity, 0) + empty.length * 20;
    if (availableCapacity < quantity)
        fail(target.kind === 'backpack' ? 'BAG_FULL' : 'CONTAINER_FULL', availableCapacity);
    const result: StackPlan = { sourceSlots: structuredClone(source.slots), targetSlots: structuredClone(target.slots), transferredQuantity: quantity, availableCapacity, lineage: { inputs: [{ ...structuredClone(original), containerId: source.id }], outputs: [] } };
    const output = (slot: ContainerSlotStack, containerId: string) => { const ordinal = result.lineage.outputs.length; slot.traceRef = `${journalId}:${ordinal}`; result.lineage.outputs.push({ ...structuredClone(slot), containerId, ordinal }); };
    if (original.quantity === quantity)
        delete result.sourceSlots[Number(sourceIndex)];
    else {
        const remainder = result.sourceSlots[Number(sourceIndex)] as ContainerSlotStack;
        remainder.quantity -= quantity;
        output(remainder, source.id);
    }
    let remaining = quantity;
    for (const [index, old] of compatible) {
        const amount = Math.min(remaining, 20 - old.quantity);
        if (!amount)
            continue;
        result.lineage.inputs.push({ ...structuredClone(old), containerId: target.id });
        const slot = result.targetSlots[Number(index)] as ContainerSlotStack;
        slot.quantity += amount;
        output(slot, target.id);
        remaining -= amount;
    }
    for (const index of empty) {
        if (!remaining)
            break;
        const amount = Math.min(20, remaining);
        const ordinal = result.lineage.outputs.length;
        const slot = { ...structuredClone(original), stackId: `${journalId}:s${ordinal}`, quantity: amount };
        result.targetSlots[index] = slot;
        output(slot, target.id);
        remaining -= amount;
    }
    return result;
}
/** Versions and timestamps are advanced by the committing service, never by this plan. */
export function planEquipmentTransfer(source: ContainerEntity, target: ContainerEntity, item: EquipmentEntity, characterId: string, catalog: InventoryCatalog = {}) {
    pair(source, target, catalog);
    if ((source.characterId && source.characterId !== characterId) || (target.characterId && target.characterId !== characterId))
        fail('NOT_FOUND_OR_FORBIDDEN');
    const found = Object.entries(source.slots).find(([, s]) => s.kind === 'equipment' && s.itemId === item.id);
    if (!found || item.accountId !== source.accountId || item.lifecycle !== 'active' || item.location.kind !== 'container' || item.location.containerId !== source.id)
        fail('ITEM_NOT_ELIGIBLE');
    if (source.kind === 'accountVault' ? item.holderCharacterId !== undefined : item.holderCharacterId !== characterId)
        fail('ITEM_NOT_ELIGIBLE');
    bindingAllowed(item.binding, source, target);
    const header = found[1];
    if (header.kind !== 'equipment' || header.sortHeader.itemLevel !== item.itemLevel || header.sortHeader.quality !== item.quality || header.sortHeader.slotKind !== item.slotKind)
        fail('CONFIG_NOT_READY');
    const index = Array.from({ length: target.capacity }, (_, i) => i).find(i => !Object.hasOwn(target.slots, i));
    if (index === undefined)
        fail(target.kind === 'backpack' ? 'BAG_FULL' : 'CONTAINER_FULL', 0);
    const sourceSlots = structuredClone(source.slots), targetSlots = structuredClone(target.slots), nextItem = structuredClone(item);
    delete sourceSlots[Number(found[0])];
    targetSlots[index] = structuredClone(header);
    nextItem.location = { kind: 'container', containerId: target.id };
    if (target.kind === 'accountVault')
        delete nextItem.holderCharacterId;
    else
        nextItem.holderCharacterId = characterId;
    return { sourceSlots, targetSlots, nextItem };
}
function exact(value: unknown, positive = false): bigint {
    if (typeof value !== 'string')
        fail('CONFIG_NOT_READY');
    try {
        const n = resource(value);
        if (positive && n === 0n)
            fail('CONFIG_NOT_READY');
        return n;
    }
    catch {
        return fail('CONFIG_NOT_READY');
    }
}
export function expansionOffer(container: ContainerEntity, targetStage: number, config?: BankExpansionConfig): ExpansionOffer {
    if (container.kind === 'accountVault')
        fail('LOCATION_NOT_ALLOWED');
    if (!['backpack', 'personalVault'].includes(container.kind) || !Number.isInteger(container.stage) || container.stage < 0 || container.stage > 4 || container.capacity !== (container.stage + 1) * 20)
        fail('CONFIG_NOT_READY');
    if (!Number.isInteger(targetStage) || targetStage !== container.stage + 1 || targetStage > 4)
        fail('UNLOCK_STAGE_MISMATCH');
    if (!config || !ref(config.ref?.id) || !Number.isSafeInteger(config.ref.version) || config.ref.version < 1 || !['test', 'release'].includes(config.profile))
        fail('CONFIG_NOT_READY');
    const row = config[container.kind]?.[targetStage];
    if (!row || Object.keys(row).some(k => !['gold', ...(container.kind === 'personalVault' ? ['points'] : [])].includes(k)))
        fail('CONFIG_NOT_READY');
    const costs: ExpansionOffer['costs'] = [{ currency: 'gold', amount: exact(row.gold, true).toString() }];
    if (container.kind === 'personalVault')
        costs.push({ currency: 'points', amount: exact((row as {
                points: string;
            }).points, true).toString() });
    return { configRef: structuredClone(config.ref), capacity: (targetStage + 1) * 20, costs };
}
export function planExpansionPayment(wallet: Pick<WalletEntity, 'gold' | 'points'>, currency: BankCurrency, offer: ExpansionOffer): {
    gold: string;
    points: string;
    cost: string;
} {
    if (currency !== 'gold' && currency !== 'points')
        fail('INVALID_ARGUMENT');
    const chosen = offer.costs.find(c => c.currency === currency);
    if (!chosen)
        fail('INVALID_ARGUMENT');
    const gold = exact(wallet.gold), points = exact(wallet.points), cost = exact(chosen.amount, true);
    if ((currency === 'gold' ? gold : points) < cost)
        fail('CURRENCY_NOT_ENOUGH');
    return { gold: (currency === 'gold' ? gold - cost : gold).toString(), points: (currency === 'points' ? points - cost : points).toString(), cost: cost.toString() };
}
