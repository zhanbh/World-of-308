/** Pure pointer arbitration: a scroll can never become a shortcut assignment. */
export const INVENTORY_HOLD_MS = 250;
export const INVENTORY_MOVE_THRESHOLD = 8;
export type InventoryPointerId = number | string;
export type InventoryGestureMode = 'idle' | 'pending' | 'drag' | 'scroll';
export interface InventoryPointerStart {
  id: InventoryPointerId; x: number; y: number; timeMs: number;
  sourceIndex: number | null; sourceKey: string | null; bagVersion: number | null; mouse: boolean;
}
export interface InventoryGestureState {
  mode: InventoryGestureMode; id: InventoryPointerId | null;
  sourceIndex: number | null; sourceKey: string | null; bagVersion: number | null;
  x: number; y: number;
}
export interface InventoryGestureEnd {
  mode: 'tap' | 'drag' | 'scroll' | 'cancel';
  sourceIndex: number | null; sourceKey: string | null; bagVersion: number | null;
  x: number; y: number;
}
interface Active extends InventoryPointerStart { mode: Exclude<InventoryGestureMode, 'idle'>; startX: number; startY: number; startTimeMs: number }
export class InventoryGesture {
  private active: Active | null = null;
  get state(): InventoryGestureState {
    const a = this.active;
    return a ? { mode: a.mode, id: a.id, sourceIndex: a.sourceIndex, sourceKey: a.sourceKey, bagVersion: a.bagVersion, x: a.x, y: a.y }
      : { mode: 'idle', id: null, sourceIndex: null, sourceKey: null, bagVersion: null, x: 0, y: 0 };
  }
  pointerStart(input: InventoryPointerStart): void {
    if (this.active || !this.validPoint(input.x, input.y, input.timeMs)) return;
    const sourceValid = Number.isSafeInteger(input.sourceIndex) && input.sourceIndex! >= 0 && typeof input.sourceKey === 'string' && input.sourceKey.length > 0 && Number.isSafeInteger(input.bagVersion) && input.bagVersion! >= 0;
    this.active = { ...input, sourceIndex: sourceValid ? input.sourceIndex : null, sourceKey: sourceValid ? input.sourceKey : null,
      mode: 'pending', startX: input.x, startY: input.y, startTimeMs: input.timeMs };
  }
  pointerMove(id: InventoryPointerId, x: number, y: number, timeMs: number): { mode: InventoryGestureMode; scrollDelta: number } {
    const a = this.active;
    if (!a || a.id !== id || !this.validPoint(x, y, timeMs) || timeMs < a.timeMs) return { mode: this.state.mode, scrollDelta: 0 };
    const previousY = a.y;
    this.classify(a, x, y, timeMs);
    a.x = x; a.y = y; a.timeMs = timeMs;
    return { mode: a.mode, scrollDelta: a.mode === 'scroll' ? y - previousY : 0 };
  }
  updateHold(timeMs: number): void {
    const a = this.active;
    if (!a || !Number.isFinite(timeMs) || timeMs < a.timeMs) return;
    this.classify(a, a.x, a.y, timeMs); a.timeMs = timeMs;
  }
  pointerEnd(id: InventoryPointerId, x: number, y: number, timeMs: number): InventoryGestureEnd | null {
    const a = this.active;
    if (!a || a.id !== id || timeMs < a.timeMs) return null;
    if (!this.validPoint(x, y, timeMs)) {
      this.active = null;
      return { mode: 'cancel', sourceIndex: a.sourceIndex, sourceKey: a.sourceKey, bagVersion: a.bagVersion, x: a.x, y: a.y };
    }
    this.classify(a, x, y, timeMs);
    this.active = null;
    return { mode: a.mode === 'pending' ? 'tap' : a.mode, sourceIndex: a.sourceIndex, sourceKey: a.sourceKey, bagVersion: a.bagVersion, x, y };
  }
  cancel(): void { this.active = null; }
  private validPoint(x: number, y: number, timeMs: number): boolean { return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(timeMs) && timeMs >= 0; }
  private classify(a: Active, x: number, y: number, timeMs: number): void {
    if (a.mode !== 'pending') return;
    const moved = Math.hypot(x - a.startX, y - a.startY) >= INVENTORY_MOVE_THRESHOLD;
    const canDrag = a.sourceIndex !== null && a.sourceKey !== null;
    if (a.mouse) { if (moved) a.mode = canDrag ? 'drag' : 'scroll'; }
    else if (canDrag && timeMs - a.startTimeMs >= INVENTORY_HOLD_MS) a.mode = 'drag';
    else if (moved) a.mode = 'scroll';
  }
}
