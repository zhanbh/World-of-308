/**
 * 308世界 — UI 状态机与核心交互逻辑模型
 * 遵循 D05 验收清单 (UI01~UI15) 与 ui-layout-specification-v1.md 规范。
 * 纯逻辑模型，无直接 Cocos / DOM 耦合，可直接用于自动化测试与前端装配。
 */

// 1. 严格 13 装备槽定义（明确无头部槽位）
export type EquipmentSlot =
    | 'shoulder'    // 护肩 (防具 1)
    | 'chest'       // 上衣 (防具 2)
    | 'belt'        // 腰带 (防具 3)
    | 'pants'       // 下衣 (防具 4)
    | 'boots'       // 鞋子 (防具 5)
    | 'trinket'     // 主动饰品 (独立固定CD)
    | 'necklace'    // 项链 (首饰 1)
    | 'bracelet'    // 手镯 (首饰 2)
    | 'ring'        // 戒指 (首饰 3)
    | 'subEquip'    // 辅助装备 (特殊装备 1)
    | 'magicStone'  // 魔法石 (特殊装备 2)
    | 'earring'     // 耳环 (特殊装备 3)
    | 'weapon';     // 主手武器

export const ALL_EQUIPMENT_SLOTS: EquipmentSlot[] = [
    'shoulder', 'chest', 'belt', 'pants', 'boots',
    'trinket',
    'necklace', 'bracelet', 'ring',
    'subEquip', 'magicStone', 'earring',
    'weapon'
];

// 耐久度启用 7 槽：武器、5件防具、耳环
export const DURABILITY_ENABLED_SLOTS = new Set<EquipmentSlot>([
    'weapon', 'shoulder', 'chest', 'belt', 'pants', 'boots', 'earring'
]);

// 强化启用 2 槽：武器与耳环
export const ENHANCEMENT_ENABLED_SLOTS = new Set<EquipmentSlot>([
    'weapon', 'earring'
]);

// 品质定义
export type ItemQuality = 'white' | 'green' | 'blue' | 'purple' | 'orange';

// 绑定状态
export type ItemBinding = 'none' | 'account' | 'character';

// 耐久度状态三色阶梯
export type DurabilityStatus = 'normal' | 'warning' | 'broken' | 'unbreakable';

// 装备/道具实例
export interface ItemInstance {
    id: string;
    templateId: string;
    name: string;
    slot?: EquipmentSlot;
    itemLevel: number;
    requiredLevel: number;
    quality: ItemQuality;
    binding: ItemBinding;
    durability?: number;
    maxDurability?: number;
    enhancementLevel?: number; // 0 ~ 20 (仅武器/耳环)
    baseStats: {
        ap?: number;
        str?: number;
        agi?: number;
        int?: number;
        sta?: number;
        armor?: number;
    };
    affixes?: { type: string; value: number }[]; // 额外副属性
    setName?: string;
    sellPrice: number;
}

// 角色综合战斗属性展开
export interface ComputedCharacterStats {
    level: number;
    str: number;
    agi: number;
    int: number;
    sta: number;
    totalAp: number;
    baseAndWeaponAp: number;
    statConvertedAp: number;
    enhancementAp: number;
    affixAp: number;
    critRate: number; // 百分比, 如 18.5
    critDamage: number; // 默认 150%
    hitRate: number;
    haste: number; // 急速 %
    mastery: number; // 精通 %
    penetration: number; // 护甲穿透
    maxHp: number;
    maxMp: number;
    armor: number;
    damageReductionPercent: number; // 护甲减伤率 %
    magicResistPercent: number;
    cdrPercent: number; // 技能冷却缩减 %
    gearScore: number; // 综合装备评分
}

// 激活的套装信息
export interface ActiveSetInfo {
    setName: string;
    equippedCount: number; // 实际穿戴且有效(非0耐久)的件数
    totalCount: number;
    activeTier: number[]; // 如 [2, 5]
    descriptions: { requiredCount: number; effect: string; active: boolean }[];
}

// UI 激活面板枚举
export type UIActivePanel =
    | 'none'                // 仅常驻 HUD
    | 'characterProfile'    // 个人信息与装备检视 (C/M 键)
    | 'inventory'           // 背包与快速换装 (B 键)
    | 'dungeonPortal'       // 副本难度选择
    | 'repair'              // 林纳克斯装备修理
    | 'enhance'             // 玛丽装备强化
    | 'merchant'            // 杂货商人买卖
    | 'vault'               // 银行金库 (个人/账号)
    | 'mail'                // 邮箱与通关待领
    | 'leaderboard';        // 战力排行榜

export class UIStateModel {
    public activePanel: UIActivePanel = 'none';
    public isInspectMode: boolean = false; // 是否处于只读检视他人模式
    public inspectTargetName: string = '';

    // 角色基础数据
    public level: number = 15;
    public job: 'warrior' | 'hunter' = 'warrior';
    public characterName: string = '狂暴先驱';
    public gold: number = 1250;
    public stamina: number = 10;

    // 穿戴槽位
    public equipped: Partial<Record<EquipmentSlot, ItemInstance>> = {};

    // 背包容量与格子 (初始20格，最多100格)
    public bagCapacity: number = 20;
    public bag: (ItemInstance | null)[] = [];

    // 消耗品快捷栏 (固定3位，绑定模板)
    public quickSlots: (string | null)[] = [null, null, null];

    constructor() {
        this.bag = new Array(this.bagCapacity).fill(null);
    }

    /**
     * 打开面板，同时阻止战斗摇杆与技能输入
     */
    public openPanel(panel: UIActivePanel, inspectTarget: string = ''): void {
        this.activePanel = panel;
        this.isInspectMode = (panel === 'characterProfile' && inspectTarget !== '');
        this.inspectTargetName = inspectTarget;
    }

    /**
     * 关闭面板，恢复移动权限
     */
    public closePanel(): void {
        this.activePanel = 'none';
        this.isInspectMode = false;
        this.inspectTargetName = '';
    }

    /**
     * 面板是否打开（打开时角色必须停止移动）
     */
    public get isAnyPanelOpen(): boolean {
        return this.activePanel !== 'none';
    }

    /**
     * 耐久度状态评估 (验收点 UI08)
     */
    public getDurabilityStatus(slot: EquipmentSlot, current?: number, max?: number): DurabilityStatus {
        if (!DURABILITY_ENABLED_SLOTS.has(slot) || current === undefined || max === undefined || max <= 0) {
            return 'unbreakable';
        }
        if (current <= 0) return 'broken';
        const ratio = current / max;
        if (ratio <= 0.5) return 'warning';
        return 'normal';
    }

    /**
     * 穿戴/替换装备 (验收点 UI01: 满包原格互换，绝不丢弃物品)
     */
    public equipFromBag(bagIndex: number): { success: boolean; message?: string } {
        if (bagIndex < 0 || bagIndex >= this.bag.length) return { success: false, message: '无效的背包索引' };
        const item = this.bag[bagIndex];
        if (!item || !item.slot) return { success: false, message: '该物品不是可穿戴装备' };

        // 校验槽位合法性（杜绝头部等非13槽）
        if (!ALL_EQUIPMENT_SLOTS.includes(item.slot)) {
            return { success: false, message: `非法装备槽位: ${item.slot}` };
        }

        // 等级要求校验 (角色可穿戴高于自身最多 10 级的装备)
        if (item.requiredLevel > this.level + 10) {
            return { success: false, message: `角色等级不足，穿戴要求: Lv.${item.requiredLevel}` };
        }

        const currentEquipped = this.equipped[item.slot];
        if (currentEquipped) {
            // 原格无缝对调
            this.equipped[item.slot] = item;
            this.bag[bagIndex] = currentEquipped;
        } else {
            // 空槽穿戴，原本格子变空
            this.equipped[item.slot] = item;
            this.bag[bagIndex] = null;
        }
        return { success: true };
    }

    /**
     * 卸下穿戴装备 (验收点 UI01: 卸装需要空格，满包安全拒绝)
     */
    public unequipToBag(slot: EquipmentSlot): { success: boolean; message?: string } {
        const item = this.equipped[slot];
        if (!item) return { success: false, message: '当前部位未穿戴装备' };

        const emptyIndex = this.bag.findIndex(cell => cell === null);
        if (emptyIndex === -1) {
            // 满包拦截！
            return { success: false, message: '背包已满，无法卸下装备！' };
        }

        this.bag[emptyIndex] = item;
        delete this.equipped[slot];
        return { success: true };
    }

    /**
     * 进本拦截与校验 (验收点 LOC04)
     */
    public canEnterDungeon(): { allowed: boolean; reason?: string } {
        const weapon = this.equipped['weapon'];
        if (!weapon) {
            return { allowed: false, reason: '请先装备武器再进入副本！' };
        }
        if ((weapon.durability ?? 100) <= 0) {
            return { allowed: false, reason: '当前武器已完全损坏（0耐久），请前往铁匠铺修理后再战！' };
        }
        if (this.stamina <= 0) {
            return { allowed: false, reason: '体力不足，无法开启新挑战' };
        }
        return { allowed: true };
    }

    /**
     * 账号金库存入校验 (验收点 UI04: 角色绑定物品严禁存入账号金库)
     */
    public canDepositToAccountVault(item: ItemInstance): { allowed: boolean; reason?: string } {
        if (item.binding === 'character') {
            return { allowed: false, reason: '角色绑定物品无法存入账号金库！' };
        }
        return { allowed: true };
    }

    /**
     * 商人出售穿戴防护 (验收点 UI10: 穿戴装备严禁直接在商人界面出售)
     */
    public canSellItem(item: ItemInstance, isFromEquipped: boolean): { allowed: boolean; reason?: string } {
        if (isFromEquipped) {
            return { allowed: false, reason: '穿戴中的装备无法直接出售，请先卸下至背包！' };
        }
        return { allowed: true };
    }

    /**
     * 计算装备修理总费用 (验收点 UI08: 金币不足整批拒绝)
     */
    public calculateTotalRepairCost(pricePerPoint: number = 2): { totalCost: number; wornCount: number } {
        let totalCost = 0;
        let wornCount = 0;
        for (const slot of ALL_EQUIPMENT_SLOTS) {
            if (!DURABILITY_ENABLED_SLOTS.has(slot)) continue;
            const item = this.equipped[slot];
            if (!item || item.durability === undefined || item.maxDurability === undefined) continue;
            const missing = item.maxDurability - item.durability;
            if (missing > 0) {
                wornCount++;
                totalCost += missing * pricePerPoint;
            }
        }
        return { totalCost, wornCount };
    }

    /**
     * 执行当前穿戴一键全修 (验收点 UI08)
     */
    public repairAllEquipped(pricePerPoint: number = 2): { success: boolean; message?: string } {
        const { totalCost, wornCount } = this.calculateTotalRepairCost(pricePerPoint);
        if (wornCount === 0) {
            return { success: false, message: '当前穿戴装备无需修理' };
        }
        if (this.gold < totalCost) {
            // 整批拒绝，不扣除1分钱
            return { success: false, message: '金币不足以支付全部修理费！' };
        }

        // 成功扣费并修满
        this.gold -= totalCost;
        for (const slot of ALL_EQUIPMENT_SLOTS) {
            if (!DURABILITY_ENABLED_SLOTS.has(slot)) continue;
            const item = this.equipped[slot];
            if (item && item.durability !== undefined && item.maxDurability !== undefined) {
                item.durability = item.maxDurability;
            }
        }
        return { success: true };
    }

    /**
     * 计算并汇总角色的攻防全维度属性 (透传至个人信息 C 键面板)
     */
    public computeCharacterStats(): ComputedCharacterStats {
        let baseAndWeaponAp = 20; // 基础初始 AP
        let enhancementAp = 0;
        let affixAp = 0;
        let armor = 50;
        let critRate = 5.0; // 基础 5%
        let haste = 0.0;
        let mastery = 0.0;
        let penetration = 0;
        let bonusStr = 0;
        let bonusAgi = 0;
        let bonusInt = 0;
        let bonusSta = 0;
        let maxHp = 600 + this.level * 40;
        let maxMp = 130 + this.level * 10;
        let gearScore = 0;

        for (const slot of ALL_EQUIPMENT_SLOTS) {
            const item = this.equipped[slot];
            if (!item) continue;

            // 0 耐久装备属性失效 (D05 规则)
            if (DURABILITY_ENABLED_SLOTS.has(slot) && (item.durability ?? 1) <= 0) {
                continue;
            }

            // 装等评分累加
            gearScore += item.itemLevel * (item.quality === 'purple' ? 1.5 : item.quality === 'orange' ? 2.0 : 1.0);

            // 基础属性
            if (item.baseStats.ap) baseAndWeaponAp += item.baseStats.ap;
            if (item.baseStats.str) bonusStr += item.baseStats.str;
            if (item.baseStats.agi) bonusAgi += item.baseStats.agi;
            if (item.baseStats.int) bonusInt += item.baseStats.int;
            if (item.baseStats.sta) bonusSta += item.baseStats.sta;
            if (item.baseStats.armor) armor += item.baseStats.armor;

            // 强化加成 (仅武器与耳环有效)
            if (ENHANCEMENT_ENABLED_SLOTS.has(slot) && item.enhancementLevel) {
                const addAp = slot === 'weapon'
                    ? Math.round(item.enhancementLevel * 2.4)
                    : Math.round(item.enhancementLevel * 1.6);
                enhancementAp += addAp;
                gearScore += item.enhancementLevel * 15;
                if (item.enhancementLevel >= 13) {
                    penetration += (item.enhancementLevel - 12) * 5;
                }
            }

            // 随机词条
            if (item.affixes) {
                for (const affix of item.affixes) {
                    if (affix.type === 'ap' && ENHANCEMENT_ENABLED_SLOTS.has(slot)) {
                        affixAp += affix.value;
                    } else if (affix.type === 'crit') {
                        critRate += affix.value;
                    } else if (affix.type === 'haste') {
                        haste += affix.value;
                    } else if (affix.type === 'mastery') {
                        mastery += affix.value;
                    }
                }
            }
        }

        const totalStr = 50 + this.level * 5 + bonusStr;
        const totalAgi = 30 + this.level * 3 + bonusAgi;
        const totalInt = 20 + this.level * 2 + bonusInt;
        const totalSta = 40 + this.level * 4 + bonusSta;

        // 战士力量换算 AP，猎人敏捷换算 AP
        const mainStatRatio = 0.45;
        const statConvertedAp = Math.round((this.job === 'warrior' ? totalStr : totalAgi) * mainStatRatio);
        const totalAp = baseAndWeaponAp + statConvertedAp + enhancementAp + affixAp;

        // 护甲物理减伤率 DR = Armor / (Armor + 50 * Level + 300)
        const drDenominator = armor + 50 * this.level + 300;
        const damageReductionPercent = Math.round((armor / drDenominator) * 1000) / 10;

        maxHp += totalSta * 10;

        return {
            level: this.level,
            str: totalStr,
            agi: totalAgi,
            int: totalInt,
            sta: totalSta,
            totalAp,
            baseAndWeaponAp,
            statConvertedAp,
            enhancementAp,
            affixAp,
            critRate: Math.round(critRate * 10) / 10,
            critDamage: 150,
            hitRate: 98.0,
            haste: Math.round(haste * 10) / 10,
            mastery: Math.round(mastery * 10) / 10,
            penetration,
            maxHp,
            maxMp,
            armor,
            damageReductionPercent,
            magicResistPercent: 12.0,
            cdrPercent: 5.0,
            gearScore: Math.round(gearScore)
        };
    }
}
