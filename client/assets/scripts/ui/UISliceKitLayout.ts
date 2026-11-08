/** Candidate geometry for the isolated UI sample. Coordinates start at the top left. */
export type KitPoint = { x: number; y: number };
export type KitRect = KitPoint & { width: number; height: number };
export type KitControl = KitRect & { id: string; label: string; key: string; circle: boolean };

export function contains(rect: KitRect, point: KitPoint): boolean {
    return point.x >= rect.x && point.x <= rect.x + rect.width
        && point.y >= rect.y && point.y <= rect.y + rect.height;
}

export function controlContains(control: KitControl, point: KitPoint): boolean {
    return control.circle
        ? Math.hypot(point.x - control.x - control.width / 2, point.y - control.y - control.height / 2) <= control.width / 2
        : contains(control, point);
}

export function hudControls(safe: KitRect): KitControl[] {
    const right = safe.x + safe.width, bottom = safe.y + safe.height;
    const x = right - 64, y = bottom - 66;
    const circle = (id: string, label: string, key: string, cx: number, cy: number, size: number): KitControl =>
        ({ id, label, key, x: cx - size / 2, y: cy - size / 2, width: size, height: size, circle: true });
    return [
        circle('stick', '摇杆', 'WASD', safe.x + 70, bottom - 70, 110),
        circle('attack', '普攻', '空格', x, y, 84),
        circle('cross', '十字斩', 'E', x - 113, y - 6, 72),
        circle('bengshan', '崩山击', 'F', x - 185, y - 84, 72),
        circle('badao', '拔刀斩', 'Q', x - 96, y - 162, 72),
        circle('earth', '大崩', 'G', x - 2, y - 108, 72),
        circle('accessory', '饰品', 'T', x - 2, y - 208, 52),
        ...['生命药', '法力药', '增益药'].map((label, index): KitControl => ({
            id: 'potion' + index, label, key: String(index + 1),
            x: x - 296, y: y - 187 + index * 64, width: 48, height: 48, circle: false,
        })),
    ];
}

export function controlGap(a: KitControl, b: KitControl): number {
    if (a.circle && b.circle) return Math.hypot(a.x + a.width / 2 - b.x - b.width / 2,
        a.y + a.height / 2 - b.y - b.height / 2) - a.width / 2 - b.width / 2;
    if (!a.circle && !b.circle) return Math.hypot(Math.max(0, a.x - b.x - b.width, b.x - a.x - a.width),
        Math.max(0, a.y - b.y - b.height, b.y - a.y - a.height));
    const c = a.circle ? a : b, r = a.circle ? b : a;
    const cx = c.x + c.width / 2, cy = c.y + c.height / 2;
    return Math.hypot(cx - Math.max(r.x, Math.min(cx, r.x + r.width)),
        cy - Math.max(r.y, Math.min(cy, r.y + r.height))) - c.width / 2;
}

export function geometryReport(controls: KitControl[], safe: KitRect): { minGap: number; insideSafe: boolean; disjoint: boolean } {
    let minGap = Infinity;
    for (let a = 0; a < controls.length; a++) for (let b = a + 1; b < controls.length; b++)
        minGap = Math.min(minGap, controlGap(controls[a], controls[b]));
    return {
        minGap,
        insideSafe: controls.every(c => contains(safe, c) && contains(safe, { x: c.x + c.width, y: c.y + c.height })),
        disjoint: minGap >= 8,
    };
}

/** Prefer right/below the source, then flip and clamp to the actual usable rectangle. */
export function cardRect(anchor: KitRect, size: { width: number; height: number }, safe: KitRect): KitRect {
    const width = Math.min(size.width, safe.width), height = Math.min(size.height, safe.height);
    let x = anchor.x + anchor.width + 8, y = anchor.y;
    if (x + width > safe.x + safe.width) x = anchor.x - width - 8;
    if (y + height > safe.y + safe.height) y = anchor.y + anchor.height - height;
    return {
        x: Math.max(safe.x, Math.min(x, safe.x + safe.width - width)),
        y: Math.max(safe.y, Math.min(y, safe.y + safe.height - height)),
        width, height,
    };
}

export function percentile(values: readonly number[], fraction: number): number | null {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}
