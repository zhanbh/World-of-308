import type { ContainerSlot, ContainerSlotStack } from '../character/character-model.ts';
export type BankCurrency = 'gold' | 'points';
export interface BankExpansionConfig {
    ref: {
        id: string;
        version: number;
    };
    profile: 'test' | 'release';
    backpack: Readonly<Record<number, {
        gold: string;
    }>>;
    personalVault: Readonly<Record<number, {
        gold: string;
        points: string;
    }>>;
}
export interface ExpansionOffer {
    configRef: {
        id: string;
        version: number;
    };
    capacity: number;
    costs: Array<{
        currency: BankCurrency;
        amount: string;
    }>;
}
export type BankStackInput = ContainerSlotStack & {
    containerId: string;
};
export type BankStackOutput = BankStackInput & {
    ordinal: number;
};
export interface StackPlan {
    sourceSlots: Record<number, ContainerSlot>;
    targetSlots: Record<number, ContainerSlot>;
    transferredQuantity: number;
    availableCapacity: number;
    lineage: {
        inputs: BankStackInput[];
        outputs: BankStackOutput[];
    };
}
