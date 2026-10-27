/**
 * 308世界 — 战斗补给 HUD 纯逻辑模型
 * 遵循 ST13-04 规格与 D05 验收清单。
 * 纯逻辑模型，无直接 DOM / Cocos 引擎依赖，支持自动化测试与 Cocos Prototype 装配。
 */

export type QuickSlotKind = 'hp' | 'mp' | 'unknown';
export type QuickSlotStatus = 'unbound' | 'empty' | 'cooldown' | 'ready' | 'submitting' | 'disabled';
export type TrinketStatus = 'unbound' | 'waiting' | 'cooldown' | 'active' | 'ready' | 'submitting' | 'disabled';

export interface QuickSlotViewState {
    slotIndex: number;
    templateId: string | null;
    name: string;
    kind: QuickSlotKind;
    quantity: number;
    status: QuickSlotStatus;
    cooldownLeftSec: number;
    label: string;
}

export interface TrinketViewState {
    itemId: string | null;
    templateId: string | null;
    name: string;
    status: TrinketStatus;
    cooldownLeftSec: number;
    waitLeftSec: number;
    buffLeftSec: number;
    label: string;
}

export interface SupplyButtonGeometry {
    x: number;
    y: number;
    radius: number;
}

export const SUPPLY_BUTTON_LAYOUT = {
    slot0: { x: 135, y: 10, radius: 28 },
    slot1: { x: 205, y: 10, radius: 28 },
    slot2: { x: 275, y: 10, radius: 28 },
    trinket: { x: 345, y: 10, radius: 28 },
} as const;

export interface SupplySnapshotInput {
    quickSlots: (string | null)[];
    backpackStacks: { templateId: string; quantity: number }[];
    equippedTrinket: { itemId: string; templateRef: string } | null;
    trinketEquipWaitUntilTick?: number;
    cooldowns: { cooldownId: string; readyAtTick: number }[];
    buffs: { buffId: string; templateRef: string; endsAtTick: number }[];
    currentTick: number;
    lifeState: 'alive' | 'dead';
    isFighting: boolean;
}

const TEMPLATE_NAMES: Record<string, { name: string; short: string; kind: QuickSlotKind }> = {
    'item:hp-potion-small-v1': { name: '初级生命药剂', short: '小红', kind: 'hp' },
    'potion_hp_minor': { name: '初级生命药剂', short: '小红', kind: 'hp' },
    'item:hp-potion-medium-v1': { name: '中级生命药剂', short: '中红', kind: 'hp' },
    'potion_hp_medium': { name: '中级生命药剂', short: '中红', kind: 'hp' },
    'item:hp-potion-large-v1': { name: '高级生命药剂', short: '大红', kind: 'hp' },
    'potion_hp_large': { name: '高级生命药剂', short: '大红', kind: 'hp' },
    'item:hp-potion-greater-v1': { name: '强效生命药剂', short: '特红', kind: 'hp' },
    'potion_hp_greater': { name: '强效生命药剂', short: '特红', kind: 'hp' },
    'item:hp-potion-max-v1': { name: '顶级生命药水', short: '神红', kind: 'hp' },
    'potion_hp_max': { name: '顶级生命药水', short: '神红', kind: 'hp' },

    'item:mp-potion-small-v1': { name: '初级法力药剂', short: '小蓝', kind: 'mp' },
    'potion_mp_minor': { name: '初级法力药剂', short: '小蓝', kind: 'mp' },
    'item:mp-potion-medium-v1': { name: '中级法力药剂', short: '中蓝', kind: 'mp' },
    'potion_mp_medium': { name: '中级法力药剂', short: '中蓝', kind: 'mp' },
    'item:mp-potion-large-v1': { name: '高级法力药剂', short: '大蓝', kind: 'mp' },
    'potion_mp_large': { name: '高级法力药剂', short: '大蓝', kind: 'mp' },
    'item:mp-potion-greater-v1': { name: '强效法力药剂', short: '特蓝', kind: 'mp' },
    'potion_mp_greater': { name: '强效法力药剂', short: '特蓝', kind: 'mp' },
    'item:mp-potion-max-v1': { name: '顶级法力药水', short: '神蓝', kind: 'mp' },
    'potion_mp_max': { name: '顶级法力药水', short: '神蓝', kind: 'mp' },

    'item:trinket-warrior-glory-v1': { name: '战神荣耀徽记', short: '战神', kind: 'unknown' },
    'item:trinket-power-v1': { name: '蛮力护符', short: '蛮力', kind: 'unknown' },
    'item:trinket-haste-v1': { name: '疾风结晶', short: '疾风', kind: 'unknown' },
    'item:trinket-minor-v1': { name: '学徒护符', short: '学徒', kind: 'unknown' },
    'item:trinket-medium-v1': { name: '精兵徽章', short: '精兵', kind: 'unknown' },
};

export class SupplyHUDModel {
    public quickSlots: QuickSlotViewState[] = [
        this.makeInitialQuickSlot(0),
        this.makeInitialQuickSlot(1),
        this.makeInitialQuickSlot(2)
    ];

    public trinket: TrinketViewState = {
        itemId: null,
        templateId: null,
        name: '未装备',
        status: 'unbound',
        cooldownLeftSec: 0,
        waitLeftSec: 0,
        buffLeftSec: 0,
        label: '饰品\n未装备'
    };

    private submittingQuickSlots = new Set<number>();
    private submittingTrinket = false;

    private makeInitialQuickSlot(index: number): QuickSlotViewState {
        return {
            slotIndex: index,
            templateId: null,
            name: '未绑定',
            kind: 'unknown',
            quantity: 0,
            status: 'unbound',
            cooldownLeftSec: 0,
            label: `${index + 1} 药\n未绑`
        };
    }

    /**
     * 触屏点击热区测试 (Hit Test)
     * 返回命中的药位索引或饰品标记，保证与技能/普攻/摇杆绝不相交
     */
    public hitTest(x: number, y: number): { target: 'quickSlot'; index: number } | { target: 'trinket' } | null {
        const layout = SUPPLY_BUTTON_LAYOUT;
        if (Math.hypot(x - layout.slot0.x, y - layout.slot0.y) <= layout.slot0.radius) {
            return { target: 'quickSlot', index: 0 };
        }
        if (Math.hypot(x - layout.slot1.x, y - layout.slot1.y) <= layout.slot1.radius) {
            return { target: 'quickSlot', index: 1 };
        }
        if (Math.hypot(x - layout.slot2.x, y - layout.slot2.y) <= layout.slot2.radius) {
            return { target: 'quickSlot', index: 2 };
        }
        if (Math.hypot(x - layout.trinket.x, y - layout.trinket.y) <= layout.trinket.radius) {
            return { target: 'trinket' };
        }
        return null;
    }

    /**
     * 从权威状态快照同步刷新 HUD 视图
     */
    public syncFromSnapshot(snapshot: SupplySnapshotInput): void {
        const { quickSlots, backpackStacks, equippedTrinket, trinketEquipWaitUntilTick, cooldowns, buffs, currentTick, lifeState, isFighting } = snapshot;

        // 1. 同步快捷药位
        const hpCd = cooldowns.find(c => c.cooldownId === 'hpPotion');
        const mpCd = cooldowns.find(c => c.cooldownId === 'mpPotion');

        for (let i = 0; i < 3; i++) {
            const templateId = quickSlots[i] ?? null;
            if (!templateId) {
                this.quickSlots[i] = {
                    slotIndex: i,
                    templateId: null,
                    name: '未绑定',
                    kind: 'unknown',
                    quantity: 0,
                    status: 'unbound',
                    cooldownLeftSec: 0,
                    label: `${i + 1} 药\n未绑`
                };
                continue;
            }

            const info = TEMPLATE_NAMES[templateId] ?? { name: '消耗品', short: '药水', kind: 'unknown' as const };
            // 计算背包中当前模板的全部数量
            const totalQty = backpackStacks
                .filter(s => s.templateId === templateId)
                .reduce((sum, s) => sum + s.quantity, 0);

            const activeCd = info.kind === 'hp' ? hpCd : info.kind === 'mp' ? mpCd : null;
            const cdTicksLeft = activeCd ? Math.max(0, activeCd.readyAtTick - currentTick) : 0;
            const cooldownLeftSec = cdTicksLeft > 0 ? cdTicksLeft * 0.01 : 0;

            let status: QuickSlotStatus = 'ready';
            let label = `${info.short}\n×${totalQty}`;

            if (lifeState === 'dead' || !isFighting) {
                status = 'disabled';
                label = `${info.short}\n禁用`;
            } else if (this.submittingQuickSlots.has(i)) {
                status = 'submitting';
                label = `${info.short}\n使用中`;
            } else if (totalQty <= 0) {
                status = 'empty';
                label = `${info.short}\n耗尽`;
            } else if (cooldownLeftSec > 0) {
                status = 'cooldown';
                label = `${info.short}\n${cooldownLeftSec.toFixed(1)}s`;
            }

            this.quickSlots[i] = {
                slotIndex: i,
                templateId,
                name: info.name,
                kind: info.kind,
                quantity: totalQty,
                status,
                cooldownLeftSec,
                label
            };
        }

        // 2. 同步主动饰品
        if (!equippedTrinket) {
            this.trinket = {
                itemId: null,
                templateId: null,
                name: '未装备',
                status: 'unbound',
                cooldownLeftSec: 0,
                waitLeftSec: 0,
                buffLeftSec: 0,
                label: '饰品\n未装备'
            };
            return;
        }

        const tInfo = TEMPLATE_NAMES[equippedTrinket.templateRef] ?? { name: '主动饰品', short: '饰品', kind: 'unknown' as const };
        const trinketCd = cooldowns.find(c => c.cooldownId === 'trinket');
        const cdTicksLeft = trinketCd ? Math.max(0, trinketCd.readyAtTick - currentTick) : 0;
        const cooldownLeftSec = cdTicksLeft > 0 ? cdTicksLeft * 0.01 : 0;

        const waitTicksLeft = trinketEquipWaitUntilTick ? Math.max(0, trinketEquipWaitUntilTick - currentTick) : 0;
        const waitLeftSec = waitTicksLeft > 0 ? waitTicksLeft * 0.01 : 0;

        const activeBuff = buffs.find(b => b.templateRef === equippedTrinket.templateRef);
        const buffTicksLeft = activeBuff ? Math.max(0, activeBuff.endsAtTick - currentTick) : 0;
        const buffLeftSec = buffTicksLeft > 0 ? buffTicksLeft * 0.01 : 0;

        let tStatus: TrinketStatus = 'ready';
        let tLabel = `${tInfo.short}\n就绪`;

        if (lifeState === 'dead' || !isFighting) {
            tStatus = 'disabled';
            tLabel = `${tInfo.short}\n禁用`;
        } else if (this.submittingTrinket) {
            tStatus = 'submitting';
            tLabel = `${tInfo.short}\n激活中`;
        } else if (buffLeftSec > 0) {
            tStatus = 'active';
            tLabel = `${tInfo.short}\n${buffLeftSec.toFixed(1)}s`;
        } else if (waitLeftSec > 0) {
            tStatus = 'waiting';
            tLabel = `等待\n${waitLeftSec.toFixed(0)}s`;
        } else if (cooldownLeftSec > 0) {
            tStatus = 'cooldown';
            tLabel = `CD\n${cooldownLeftSec.toFixed(0)}s`;
        }

        this.trinket = {
            itemId: equippedTrinket.itemId,
            templateId: equippedTrinket.templateRef,
            name: tInfo.name,
            status: tStatus,
            cooldownLeftSec,
            waitLeftSec,
            buffLeftSec,
            label: tLabel
        };
    }

    /**
     * 触发使用快捷药位
     * 若处于可用状态，生成合法 ActionInput 并标记提交中
     */
    public triggerQuickSlot(index: number, tick: number): { kind: 'item'; quickSlotIndex: number; templateId: string; tick: number } | null {
        const slot = this.quickSlots[index];
        if (!slot || slot.status !== 'ready' || !slot.templateId) {
            return null;
        }
        this.submittingQuickSlots.add(index);
        slot.status = 'submitting';
        return {
            kind: 'item',
            quickSlotIndex: index,
            templateId: slot.templateId,
            tick
        };
    }

    /**
     * 触发激活主动饰品
     * 若处于可用状态，生成合法 ActionInput 并标记提交中
     */
    public triggerTrinket(tick: number): { kind: 'trinket'; itemId: string; tick: number } | null {
        if (this.trinket.status !== 'ready' || !this.trinket.itemId) {
            return null;
        }
        this.submittingTrinket = true;
        this.trinket.status = 'submitting';
        return {
            kind: 'trinket',
            itemId: this.trinket.itemId,
            tick
        };
    }

    /**
     * 响应提交完成或重置提交中标记
     */
    public resolveSubmission(slotKind: 'quickSlot' | 'trinket', index?: number): void {
        if (slotKind === 'quickSlot' && index !== undefined) {
            this.submittingQuickSlots.delete(index);
        } else if (slotKind === 'trinket') {
            this.submittingTrinket = false;
        }
    }

    /**
     * 清理所有待决提交状态（网络未知、换房或断线恢复时重置）
     */
    public clearSubmissions(): void {
        this.submittingQuickSlots.clear();
        this.submittingTrinket = false;
    }
}
