/**
 * 308世界 — 死亡复活与结算退出 HUD 纯逻辑模型
 * 遵循 ST14-04 规格与 D05 验收清单。
 * 纯逻辑模型，无直接 DOM / Cocos 引擎硬依赖，支持纯无头自动化测试与 Cocos Prototype 装配。
 */

export type DeathReviveStatus = 'hidden' | 'active' | 'submittingRevive' | 'submittingLeave' | 'revived' | 'exited';
export type ReviveButtonState = 'ready' | 'disabled' | 'submitting';
export type LeaveButtonState = 'ready' | 'disabled' | 'submitting';

export interface DeathReviveButtonGeometry {
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
}

export const DEATH_REVIVE_LAYOUT = {
    panel: { x: 0, y: 0, width: 320, height: 220 },
    progressBar: { x: 0, y: 35, width: 240, height: 16 },
    reviveButton: { x: -75, y: -55, width: 120, height: 44, radius: 22 },
    leaveButton: { x: 75, y: -55, width: 120, height: 44, radius: 22 },
} as const;

export interface DeathReviveSnapshot {
    isDead: boolean;
    deathIndex: number;
    deathDeadline: number; // millisecond timestamp
    now: number;          // millisecond timestamp
    emblemCount: number;
    isSpecialDungeon: boolean;
    paidRevives: number;
    maxRevives?: number; // 3 for special
}

export class DeathReviveHUDModel {
    public status: DeathReviveStatus = 'hidden';
    public remainingMs = 10000;
    public totalMs = 10000;
    public progress = 1.0; // 1.0 -> 0.0

    public deathIndex = 0;
    public emblemCount = 0;
    public isSpecialDungeon = false;
    public paidRevives = 0;
    public maxRevives = 3;

    public reviveButtonState: ReviveButtonState = 'ready';
    public leaveButtonState: LeaveButtonState = 'ready';
    public disabledReason: string | null = null;
    public promptMessage: string | null = null;

    // Visual effect states
    public goldenAura = {
        active: false,
        durationSec: 2.0,
        elapsedSec: 0,
        radius: 48,
    };

    public fadeOut = {
        active: false,
        alpha: 0,
        speed: 2.0, // full fade in 0.5s
    };

    get isVisible(): boolean {
        return this.status === 'active' || this.status === 'submittingRevive' || this.status === 'submittingLeave';
    }

    get remainingSec(): number {
        return Math.max(0, this.remainingMs / 1000);
    }

    get remainingRevives(): number {
        return Math.max(0, this.maxRevives - this.paidRevives);
    }

    get countdownLabel(): string {
        return `剩余时间: ${this.remainingSec.toFixed(1)}s`;
    }

    get emblemLabel(): string {
        return `复活纹章: ${this.emblemCount}`;
    }

    get limitLabel(): string {
        if (!this.isSpecialDungeon) {
            return '普通副本无次数限制';
        }
        return `剩余复活: ${this.remainingRevives}/${this.maxRevives}`;
    }

    get reviveButtonLabel(): string {
        if (this.reviveButtonState === 'submitting') return '复活中...';
        if (this.disabledReason === 'EMBLEM_NOT_ENOUGH') return '纹章不足';
        if (this.disabledReason === 'REVIVE_LIMIT_REACHED') return `已达上限 (${this.maxRevives}/${this.maxRevives})`;
        return '立即复活';
    }

    get leaveButtonLabel(): string {
        if (this.leaveButtonState === 'submitting') return '退出中...';
        return '放弃退出';
    }

    /**
     * 开启/同步死亡复活弹窗
     */
    public open(deathIndex: number, totalMs = 10000, remainingMs = 10000, emblemCount = 0, isSpecialDungeon = false, paidRevives = 0): void {
        this.status = 'active';
        this.deathIndex = deathIndex;
        this.totalMs = totalMs;
        this.remainingMs = Math.max(0, remainingMs);
        this.progress = this.totalMs > 0 ? this.remainingMs / this.totalMs : 0;
        this.emblemCount = emblemCount;
        this.isSpecialDungeon = isSpecialDungeon;
        this.paidRevives = paidRevives;
        this.promptMessage = null;
        this.goldenAura.active = false;
        this.fadeOut.active = false;
        this.updateButtonStates();
    }

    /**
     * 根据权威快照同步数据
     */
    public syncFromSnapshot(snapshot: DeathReviveSnapshot): void {
        if (!snapshot.isDead) {
            this.status = 'hidden';
            return;
        }

        const isNewDeath = this.deathIndex !== snapshot.deathIndex;
        this.deathIndex = snapshot.deathIndex;
        this.emblemCount = snapshot.emblemCount;
        this.isSpecialDungeon = snapshot.isSpecialDungeon;
        this.paidRevives = snapshot.paidRevives;
        if (snapshot.maxRevives !== undefined) {
            this.maxRevives = snapshot.maxRevives;
        }

        if (snapshot.deathDeadline > 0) {
            this.remainingMs = Math.max(0, snapshot.deathDeadline - snapshot.now);
            this.progress = this.totalMs > 0 ? this.remainingMs / this.totalMs : 0;
        }

        if (isNewDeath || this.status === 'hidden' || this.status === 'exited') {
            this.status = 'active';
        }
        this.updateButtonStates();
    }

    /**
     * 每帧/逻辑周期推进倒计时与动画状态
     */
    public update(dtSec: number): { timeoutTriggered: boolean; fadeOutComplete: boolean } {
        let timeoutTriggered = false;
        let fadeOutComplete = false;

        // 倒计时推进
        if (this.status === 'active' || this.status === 'submittingRevive') {
            this.remainingMs = Math.max(0, this.remainingMs - dtSec * 1000);
            this.progress = this.totalMs > 0 ? this.remainingMs / this.totalMs : 0;

            if (this.remainingMs <= 0) {
                // 超时触发退出
                this.status = 'submittingLeave';
                this.promptMessage = '复活倒计时超时，正在退出...';
                timeoutTriggered = true;
                this.updateButtonStates();
            }
        }

        // 金色复活光环推进
        if (this.goldenAura.active) {
            this.goldenAura.elapsedSec += dtSec;
            if (this.goldenAura.elapsedSec >= this.goldenAura.durationSec) {
                this.goldenAura.active = false;
            }
        }

        // 渐隐转场推进
        if (this.fadeOut.active) {
            this.fadeOut.alpha = Math.min(1.0, this.fadeOut.alpha + dtSec * this.fadeOut.speed);
            if (this.fadeOut.alpha >= 1.0) {
                fadeOutComplete = true;
            }
        }

        return { timeoutTriggered, fadeOutComplete };
    }

    private updateButtonStates(): void {
        if (this.status === 'submittingRevive') {
            this.reviveButtonState = 'submitting';
            this.leaveButtonState = 'ready';
            this.disabledReason = 'SUBMITTING';
            return;
        }

        if (this.status === 'submittingLeave') {
            this.reviveButtonState = 'disabled';
            this.leaveButtonState = 'submitting';
            this.disabledReason = 'SUBMITTING';
            return;
        }

        if (this.status !== 'active') {
            this.reviveButtonState = 'disabled';
            this.leaveButtonState = 'disabled';
            return;
        }

        this.leaveButtonState = 'ready';

        if (this.emblemCount <= 0) {
            this.reviveButtonState = 'disabled';
            this.disabledReason = 'EMBLEM_NOT_ENOUGH';
            return;
        }

        if (this.isSpecialDungeon && this.paidRevives >= this.maxRevives) {
            this.reviveButtonState = 'disabled';
            this.disabledReason = 'REVIVE_LIMIT_REACHED';
            return;
        }

        this.reviveButtonState = 'ready';
        this.disabledReason = null;
    }

    /**
     * 触屏点击热区测试 (Hit Test)
     * 返回命中的按钮，保证与底层技能/普攻热区互斥
     */
    public hitTest(x: number, y: number): 'revive' | 'leave' | null {
        if (!this.isVisible) return null;

        const layout = DEATH_REVIVE_LAYOUT;
        // 判定 revive 按钮热区
        const rb = layout.reviveButton;
        if (Math.abs(x - rb.x) <= rb.width / 2 && Math.abs(y - rb.y) <= rb.height / 2) {
            return 'revive';
        }

        // 判定 leave 按钮热区
        const lb = layout.leaveButton;
        if (Math.abs(x - lb.x) <= lb.width / 2 && Math.abs(y - lb.y) <= lb.height / 2) {
            return 'leave';
        }

        return null;
    }

    /**
     * 点击【立即复活】
     */
    public onReviveClicked(): { success: boolean; reason?: string } {
        if (this.status !== 'active') {
            return { success: false, reason: 'HUD_NOT_ACTIVE' };
        }
        if (this.reviveButtonState !== 'ready') {
            return { success: false, reason: this.disabledReason || 'BUTTON_DISABLED' };
        }
        this.status = 'submittingRevive';
        this.updateButtonStates();
        return { success: true };
    }

    /**
     * 点击【放弃退出】
     */
    public onLeaveClicked(): { success: boolean } {
        if (this.status !== 'active' && this.status !== 'submittingRevive') {
            return { success: false };
        }
        this.status = 'submittingLeave';
        this.updateButtonStates();
        return { success: true };
    }

    /**
     * 复活成功响应处理
     */
    public onReviveSuccess(): void {
        this.status = 'revived';
        this.goldenAura.active = true;
        this.goldenAura.elapsedSec = 0;
        this.promptMessage = null;
    }

    /**
     * 复活失败响应处理 (保持 HUD，允许重试或等待超时)
     */
    public onReviveFailed(code: string, message?: string): void {
        this.status = 'active';
        this.promptMessage = message || (code === 'EMBLEM_NOT_ENOUGH' ? '复活纹章不足' : code === 'REVIVE_LIMIT_REACHED' ? '已达本局复活上限' : code === 'DEADLINE_EXPIRED' ? '复活超时已判败' : `复活失败: ${code}`);
        this.updateButtonStates();
    }

    /**
     * 退出成功响应处理
     */
    public onLeaveSuccess(): void {
        this.status = 'exited';
        this.fadeOut.active = true;
        this.fadeOut.alpha = 0;
    }
}
