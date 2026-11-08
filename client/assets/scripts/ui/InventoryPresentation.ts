import type { EquipmentView } from '../../../../shared/src/protocol/asset-v2.ts';

export const BAG_GRID = { left: -370, top: 96, cell: 56, stride: 64, columns: 5, viewLeft: -376, viewRight: -36, viewTop: 102, viewBottom: -170 };
export const SLOT_NAMES: Record<EquipmentView['slotKind'], string> = {
    weapon: '武器', shoulder: '护肩', chest: '上衣', belt: '腰带', pants: '下衣', boots: '鞋子',
    necklace: '项链', bracelet: '手镯', ring: '戒指', subEquip: '辅助装备', magicStone: '魔法石', earring: '耳环', trinket: '主动饰品',
};
export const SLOT_ICONS: Record<EquipmentView['slotKind'], string> = {
    weapon: 'weapon_dual_blades', shoulder: 'armor_shoulders', chest: 'armor_chest', belt: 'armor_belt', pants: 'armor_pants', boots: 'armor_boots',
    necklace: 'jewelry_necklace', bracelet: 'jewelry_bracelet', ring: 'jewelry_ring', subEquip: 'special_book', magicStone: 'special_stone', earring: 'special_earring', trinket: 'material_souvenir',
};
export const QUALITY_STYLE = {
    white: { label: '粗糙', color: '#b0bec5', border: 'rough' }, green: { label: '优秀', color: '#66bb6a', border: 'fine' },
    blue: { label: '精良', color: '#29b6f6', border: 'rare' }, purple: { label: '稀有', color: '#ab47bc', border: 'unique' },
    orange: { label: '传说', color: '#ffa726', border: 'legendary' },
};
export function slotCenter(index: number, scroll: number): { x: number; y: number } {
    return { x: BAG_GRID.left + BAG_GRID.cell / 2 + index % 5 * BAG_GRID.stride,
        y: BAG_GRID.top - BAG_GRID.cell / 2 - Math.floor(index / 5) * BAG_GRID.stride + scroll };
}
export function inventorySlotAt(x: number, y: number, scroll: number): number | null {
    const g = BAG_GRID;
    if (x < g.viewLeft || x > g.viewRight || y < g.viewBottom || y > g.viewTop) return null;
    const col = Math.floor((x - g.left) / g.stride), row = Math.floor((g.top + scroll - y) / g.stride);
    if (col < 0 || col >= 5 || row < 0 || row >= 20) return null;
    const index = row * 5 + col, c = slotCenter(index, scroll);
    return Math.abs(x - c.x) <= g.cell / 2 && Math.abs(y - c.y) <= g.cell / 2 ? index : null;
}
export const inventoryScrollMax = () => 20 * BAG_GRID.stride - (BAG_GRID.stride - BAG_GRID.cell) + BAG_GRID.viewBottom - BAG_GRID.top;
export function detailBounds(anchor: { x: number; y: number }, full: boolean): { x: number; y: number; width: number; height: number } {
    const width = full ? 448 : 328, height = full ? 378 : 220;
    let x = anchor.x + 36 + width / 2;
    if (x + width / 2 > 440) x = anchor.x - 36 - width / 2;
    return { x: Math.max(-440 + width / 2, Math.min(440 - width / 2, x)),
        y: Math.max(-194 + height / 2, Math.min(194 - height / 2, anchor.y + 28 - height / 2)), width, height };
}
const STAT_LABELS: Record<string, string> = { attackPower: '攻击强度', physicalAttack: '物理攻击力', magicAttack: '魔法攻击力',
    strength: '力量', agility: '敏捷', intelligence: '智力', maxHp: '生命上限', maxMp: '法力上限', armor: '物理护甲',
    crit: '暴击等级', physicalCrit: '物理暴击', magicalCrit: '魔法暴击', haste: '急速等级', mastery: '精通等级',
    hit: '命中等级', armorPenetration: '护甲穿透', attackSpeed: '攻击速度', resistance: '抗性' };
export function equipmentLines(item: EquipmentView, name: (id: string) => string): Array<{ text: string; color: string }> {
    const lines = [
        { text: QUALITY_STYLE[item.quality].label + ' · ' + SLOT_NAMES[item.slotKind] + ' · Lv.' + item.itemLevel, color: '#8fa2af' },
    ];
    if (item.binding.kind !== 'none') lines.push({ text: item.binding.kind === 'account' ? '账号绑定' : '已绑定', color: '#8fa2af' });
    else if (item.quality === 'purple') lines.push({ text: '装备绑定', color: '#8fa2af' });
    if (item.durability.wearEnabled) lines.push({ text: '耐久 ' + item.durability.current + '/' + item.durability.max,
        color: item.durability.current === 0 ? '#ff5252' : item.durability.current * 2 <= item.durability.max ? '#ffd740' : '#69f0ae' });
    if (item.rolledAffixes.length) {
        lines.push({ text: '装备词条', color: '#e2ebef' });
        for (const a of item.rolledAffixes) lines.push({ text: (STAT_LABELS[a.statId] ?? a.statId) + ' +' + a.value, color: '#42a5f5' });
    }
    if (item.enhancementLevel) lines.push({ text: '强化 +' + item.enhancementLevel, color: '#ffca28' });
    if (item.enhancementBonus) lines.push({ text: '强化攻击强度 +' + item.enhancementBonus.attackPower, color: '#ffca28' });
    if (item.setRef) lines.push({ text: '套装：' + name(item.setRef), color: '#69f0ae' });
    const sources = { initialEquip: '初始装备', roomDrop: '副本掉落', mailAttachment: '邮件附件', grant: '奖励发放', challengeClear: '通关奖励' };
    lines.push({ text: '来源：' + sources[item.source.kind], color: '#8fa2af' });
    return lines;
}
