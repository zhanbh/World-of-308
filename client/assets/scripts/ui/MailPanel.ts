import { Node, Graphics, Color, UITransform, Label, Vec3, EventTouch, EventMouse, sys, game, Game } from 'cc';
import type {
  MailCoordinator,
  MailCoordinatorState,
  MailItem,
  MailItemAttachment,
  RewardItem,
  DeliverySummary,
} from '../net/MailCoordinator.ts';
import { skinSprite } from './UISkin';

export interface MailPanelOptions {
  contextId?: string;
  onVisibility?: (visible: boolean) => void;
  onSuccess?: (type: 'claim' | 'claimBatch' | 'delete' | 'claimReward', message: string) => void;
  mailboxProvider?: () => MailItem[];
  rewardsProvider?: () => RewardItem[];
  summaryProvider?: () => DeliverySummary;
}

interface ControlButton {
  name: string;
  node: Node;
  width: number;
  canEnable: () => boolean;
  action: () => void;
}

function qualityColor(quality: string): Color {
  switch (quality) {
    case 'green': return new Color(50, 220, 80);
    case 'blue': return new Color(60, 160, 255);
    case 'purple': return new Color(190, 80, 255);
    case 'orange': return new Color(255, 150, 30);
    default: return new Color(225, 230, 235);
  }
}

function qualityBorderKey(quality: string): string {
  switch (quality) {
    case 'green': return 'slot_border_fine';
    case 'blue': return 'slot_border_rare';
    case 'purple': return 'slot_border_unique';
    case 'orange': return 'slot_border_legendary';
    default: return 'slot_border_rough';
  }
}

function errorLabel(code: string): string {
  switch (code) {
    case 'BAG_FULL': return '背包已满，无法容纳附件或待领装备';
    case 'MAIL_NOT_FOUND': return '信件不存在或已过期失效';
    case 'MAIL_EXPIRED': return '该信件已超出30天有效保管期';
    case 'ATTACHMENT_ALREADY_CLAIMED': return '该附件已被提取入包';
    case 'ATTACHMENT_NOT_FOUND': return '信件附件不存在';
    case 'MAIL_HAS_ATTACHMENT': return '信件含有未领取的贵重附件，禁止删除';
    case 'REWARD_ALREADY_CLAIMED': return '该待领奖励已被提取';
    case 'REWARD_NOT_FOUND': return '待领奖励记录不存在';
    case 'RESULT_UNKNOWN': return '操作结果未决，请点击确认结果恢复';
    case 'MAIL_NOT_READY': return '邮箱服务加载中，请稍后重试';
    case 'IDENTITY_REQUIRED': return '请先登录并选择角色';
    case 'CONTEXT_REQUIRED': return '邮箱服务上下文已失效，请重新打开';
    default: return code;
  }
}

/**
 * Cocos presentation panel for Hotel Mailbox and Permanent Pending Rewards (ST07 / ST08).
 * Connects with MailCoordinator for mail reading, attachment claims, batch claims, and reward grants.
 * Adheres strictly to the unified 9-Patch slices, 56px slots, and interactive guidelines.
 */
export class MailPanel {
  private readonly root: Node;
  private readonly windowFrameNode: Node;
  private readonly titleLabel: Label;
  private readonly unreadBadgeLabel: Label;
  private readonly pendingBadgeLabel: Label;
  private readonly closeButtonNode: Node;

  // Mode Switch Tabs
  private readonly inboxTabNode: Node;
  private readonly rewardsTabNode: Node;

  // Containers
  private readonly inboxContainer: Node;
  private readonly rewardsContainer: Node;

  // Inbox Mode UI
  private readonly mailRows: Array<{
    node: Node;
    statusIconNode: Node;
    senderLabel: Label;
    subjectLabel: Label;
    expireLabel: Label;
    badgeNode: Node;
    badgeLabel: Label;
    mail: MailItem | null;
  }> = [];
  private selectedMailId: string | null = null;
  private readonly mailDetailSubjectLabel: Label;
  private readonly mailDetailSenderLabel: Label;
  private readonly mailDetailTimeLabel: Label;
  private readonly mailDetailBodyLabel: Label;
  private readonly mailAttachmentSlotBase: Node;
  private readonly mailAttachmentSlotIcon: Node;
  private readonly mailAttachmentSlotBorder: Node;
  private readonly mailAttachmentNameLabel: Label;
  private readonly mailAttachmentQtyLabel: Label;
  private readonly mailClaimAttachmentBtnNode: Node;
  private readonly mailDeleteBtnNode: Node;
  private readonly mailClaimBatchBtnNode: Node;

  // Rewards Mode UI (Permanent Pending Grants)
  private readonly rewardRows: Array<{
    node: Node;
    nameLabel: Label;
    statusLabel: Label;
    slotIcon: Node;
    borderNode: Node;
    reward: RewardItem | null;
  }> = [];
  private selectedGrantId: string | null = null;
  private readonly rewardDetailNameLabel: Label;
  private readonly rewardDetailSlotBase: Node;
  private readonly rewardDetailSlotIcon: Node;
  private readonly rewardDetailSlotBorder: Node;
  private readonly rewardDetailNoticeLabel: Label;
  private readonly rewardClaimBtnNode: Node;

  // Notification & Status Banner
  private readonly resultBannerLabel: Label;
  private readonly statusLabel: Label;
  private readonly recoverButtonNode: Node;

  private readonly controls: ControlButton[] = [];
  private visible = false;
  private state: MailCoordinatorState;
  private currentMode: 'inbox' | 'rewards' = 'inbox';
  private currentContextId: string | null = null;
  private localNotice = '';
  private localError = '';
  private suppressMouseUntil = 0;
  private buttonResets: Array<() => void> = [];

  private readonly coordinator: MailCoordinator;
  private readonly options: MailPanelOptions;

  private cancel = (): void => {
    for (const reset of this.buttonResets) reset();
    this.buttonResets = [];
  };

  private onHide = (): void => {
    this.cancel();
  };

  constructor(
    parent: Node,
    coordinator: MailCoordinator,
    options: MailPanelOptions = {}
  ) {
    this.coordinator = coordinator;
    this.options = options;
    this.state = coordinator.state;
    this.currentContextId = options.contextId ?? 'sandbox-mail-context';

    game.on(Game.EVENT_HIDE, this.onHide, this);

    this.root = this.node(parent, 'MailPanel', 0, 0, 960, 540);
    this.root.active = false;

    // Dark backdrop mask
    const bg = this.root.addComponent(Graphics);
    bg.fillColor = new Color(16, 24, 30, 240);
    bg.rect(-480, -270, 960, 540);
    bg.fill();

    // 9-Patch Window Frame (912 x 500)
    this.windowFrameNode = this.node(this.root, 'MailWindowFrame', 0, 0, 912, 500);
    skinSprite(this.windowFrameNode, 'ui/slices/panel_window_frame', true);

    // Header Title
    this.titleLabel = this.label(this.root, '旅店信箱 · 待领中心', -250, 226, 22, 380);

    // Header Delivery Status Badges
    this.unreadBadgeLabel = this.label(this.root, '未读信件: 0', 100, 226, 15, 180);
    this.unreadBadgeLabel.color = new Color(100, 220, 255);
    this.pendingBadgeLabel = this.label(this.root, '待领奖励: 0', 260, 226, 15, 140);
    this.pendingBadgeLabel.color = new Color(255, 215, 60);

    // Close Buttons
    this.closeButtonNode = this.button('✕ 关闭', 400, 226, () => this.close(), () => true, 76);
    this.button('✕ 关闭', -400, 226, () => this.close(), () => true, 76);

    // Mode Toggle Tabs (y = 185)
    this.inboxTabNode = this.button(
      '系统信件 (收件箱)',
      -260,
      185,
      () => this.switchMode('inbox'),
      () => this.currentMode !== 'inbox' && this.state.status !== 'submitting',
      160
    );
    this.rewardsTabNode = this.button(
      '永久待领 (奖励暂存)',
      -80,
      185,
      () => this.switchMode('rewards'),
      () => this.currentMode !== 'rewards' && this.state.status !== 'submitting',
      160
    );

    // --- Tab 1: Inbox Mode Container ---
    this.inboxContainer = this.node(this.root, 'InboxContainer', 0, -15, 870, 340);

    // Left Mail List Well (470 x 320)
    const mailListWell = this.node(this.inboxContainer, 'MailListWell', -190, 0, 470, 320);
    skinSprite(mailListWell, 'ui/slices/panel_well_inner', true);
    this.label(mailListWell, '信件列表 (点击查阅详情)', 0, 140, 14, 440);

    // 4 Mail List Rows
    for (let i = 0; i < 4; i++) {
      const y = 92 - i * 62;
      const rowNode = this.node(mailListWell, `MailRow_${i}`, 0, y, 450, 54);
      skinSprite(rowNode, 'ui/slices/panel_well_inner', true);

      const statusIconNode = this.node(rowNode, `MailStatus_${i}`, -198, 0, 20, 20);
      skinSprite(statusIconNode, 'icons/special_book_48', true);

      const senderLabel = this.label(rowNode, '', -120, 10, 13, 120);
      senderLabel.horizontalAlign = Label.HorizontalAlign.LEFT;

      const expireLabel = this.label(rowNode, '', 140, 10, 11, 120);
      expireLabel.horizontalAlign = Label.HorizontalAlign.RIGHT;
      expireLabel.color = new Color(160, 175, 190);

      const subjectLabel = this.label(rowNode, '', -40, -12, 13, 270);
      subjectLabel.horizontalAlign = Label.HorizontalAlign.LEFT;

      const badgeNode = this.node(rowNode, `MailBadge_${i}`, 180, -12, 54, 20);
      skinSprite(badgeNode, 'ui/slices/slot_grid_base', true);
      const badgeLabel = this.label(badgeNode, '附件', 0, 0, 11, 54);
      badgeLabel.color = new Color(255, 215, 60);

      const index = i;
      this.interactiveButton(
        rowNode,
        450,
        54,
        () => {
          const mail = this.mailRows[index]?.mail;
          if (mail) {
            this.selectedMailId = mail.mailId;
            if (!mail.read) {
              void this.markCurrentRead();
            }
            this.updateInboxDetails();
          }
        },
        () => true
      );

      this.mailRows.push({
        node: rowNode,
        statusIconNode,
        senderLabel,
        subjectLabel,
        expireLabel,
        badgeNode,
        badgeLabel,
        mail: null,
      });
    }

    // Right Mail Detail Card (340 x 320)
    const mailDetailWell = this.node(this.inboxContainer, 'MailDetailWell', 235, 0, 340, 320);
    skinSprite(mailDetailWell, 'ui/slices/panel_well_inner', true);

    this.label(mailDetailWell, '信件正文与附件', 0, 140, 14, 300);
    this.mailDetailSubjectLabel = this.label(mailDetailWell, '请选择信件', 0, 112, 15, 310);
    this.mailDetailSubjectLabel.color = new Color(255, 220, 100);

    this.mailDetailSenderLabel = this.label(mailDetailWell, '', -80, 88, 12, 140);
    this.mailDetailSenderLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
    this.mailDetailSenderLabel.color = new Color(160, 180, 200);

    this.mailDetailTimeLabel = this.label(mailDetailWell, '', 70, 88, 12, 160);
    this.mailDetailTimeLabel.horizontalAlign = Label.HorizontalAlign.RIGHT;
    this.mailDetailTimeLabel.color = new Color(160, 180, 200);

    this.mailDetailBodyLabel = this.label(mailDetailWell, '', 0, 36, 12, 310);
    this.mailDetailBodyLabel.horizontalAlign = Label.HorizontalAlign.LEFT;

    // Attachment Well Area (Inside Detail Card)
    const attachArea = this.node(mailDetailWell, 'AttachmentArea', 0, -42, 310, 70);
    skinSprite(attachArea, 'ui/slices/panel_well_inner', true);

    this.mailAttachmentSlotBase = this.node(attachArea, 'AttachSlotBase', -115, 0, 56, 56);
    skinSprite(this.mailAttachmentSlotBase, 'ui/slices/slot_grid_base', true);
    this.mailAttachmentSlotIcon = this.node(this.mailAttachmentSlotBase, 'AttachSlotIcon', 0, 0, 48, 48);
    this.mailAttachmentSlotBorder = this.node(this.mailAttachmentSlotBase, 'AttachSlotBorder', 0, 0, 56, 56);
    skinSprite(this.mailAttachmentSlotBorder, 'ui/slices/slot_border_rough', true);

    this.mailAttachmentNameLabel = this.label(attachArea, '无附件', 10, 12, 14, 180);
    this.mailAttachmentNameLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
    this.mailAttachmentQtyLabel = this.label(attachArea, '', 10, -12, 12, 180);
    this.mailAttachmentQtyLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
    this.mailAttachmentQtyLabel.color = new Color(255, 215, 60);

    // Detail Action Buttons (Claim Attachment & Delete Mail)
    this.mailClaimAttachmentBtnNode = this.button(
      '提取附件',
      -70,
      -110,
      () => void this.executeClaimAttachment(),
      () => this.canClaimAttachment(),
      130
    );

    this.mailDeleteBtnNode = this.button(
      '删除信件',
      80,
      -110,
      () => void this.executeDeleteMail(),
      () => this.canDeleteMail(),
      130
    );

    // One-Key Batch Claim Button
    this.mailClaimBatchBtnNode = this.button(
      '一键领取所有邮件附件',
      -190,
      -135,
      () => void this.executeClaimBatch(),
      () => this.canClaimBatch(),
      300
    );

    // --- Tab 2: Rewards Mode Container (Permanent Pending Grants) ---
    this.rewardsContainer = this.node(this.root, 'RewardsContainer', 0, -15, 870, 340);
    this.rewardsContainer.active = false;

    // Left Rewards List Well (470 x 320)
    const rewardListWell = this.node(this.rewardsContainer, 'RewardListWell', -190, 0, 470, 320);
    skinSprite(rewardListWell, 'ui/slices/panel_well_inner', true);
    this.label(rewardListWell, '永久待领装备与掉落 (背包已满溢出暂存)', 0, 140, 14, 440);

    // 4 Reward List Rows
    for (let i = 0; i < 4; i++) {
      const y = 92 - i * 62;
      const rowNode = this.node(rewardListWell, `RewardRow_${i}`, 0, y, 450, 54);
      skinSprite(rowNode, 'ui/slices/panel_well_inner', true);

      const slotBase = this.node(rowNode, `RewardSlot_${i}`, -190, 0, 44, 44);
      skinSprite(slotBase, 'ui/slices/slot_grid_base', true);
      const slotIcon = this.node(slotBase, `RewardIcon_${i}`, 0, 0, 36, 36);
      const borderNode = this.node(slotBase, `RewardBorder_${i}`, 0, 0, 44, 44);
      skinSprite(borderNode, 'ui/slices/slot_border_rough', true);

      const nameLabel = this.label(rowNode, '', -40, 8, 14, 230);
      nameLabel.horizontalAlign = Label.HorizontalAlign.LEFT;

      const statusLabel = this.label(rowNode, '', 140, 8, 12, 100);
      statusLabel.horizontalAlign = Label.HorizontalAlign.RIGHT;

      const index = i;
      this.interactiveButton(
        rowNode,
        450,
        54,
        () => {
          const reward = this.rewardRows[index]?.reward;
          if (reward) {
            this.selectedGrantId = reward.grantId;
            this.updateRewardDetails();
          }
        },
        () => true
      );

      this.rewardRows.push({
        node: rowNode,
        nameLabel,
        statusLabel,
        slotIcon,
        borderNode,
        reward: null,
      });
    }

    // Right Reward Detail Card (340 x 320)
    const rewardDetailWell = this.node(this.rewardsContainer, 'RewardDetailWell', 235, 0, 340, 320);
    skinSprite(rewardDetailWell, 'ui/slices/panel_well_inner', true);

    this.label(rewardDetailWell, '待领装备详情与入包', 0, 140, 14, 300);
    this.rewardDetailNameLabel = this.label(rewardDetailWell, '请选择待领装备', 0, 100, 16, 310);
    this.rewardDetailNameLabel.color = new Color(255, 215, 60);

    // Big 56x56 slot preview
    this.rewardDetailSlotBase = this.node(rewardDetailWell, 'RewardDetailSlot', 0, 45, 56, 56);
    skinSprite(this.rewardDetailSlotBase, 'ui/slices/slot_grid_base', true);
    this.rewardDetailSlotIcon = this.node(this.rewardDetailSlotBase, 'RewardDetailIcon', 0, 0, 48, 48);
    this.rewardDetailSlotBorder = this.node(this.rewardDetailSlotBase, 'RewardDetailBorder', 0, 0, 56, 56);
    skinSprite(this.rewardDetailSlotBorder, 'ui/slices/slot_border_rough', true);

    this.rewardDetailNoticeLabel = this.label(
      rewardDetailWell,
      '* 副本战利品在背包满时自动转入永久待领\\n* 永久保存不失效，清理背包后可随时提取',
      0,
      -35,
      12,
      310
    );
    this.rewardDetailNoticeLabel.color = new Color(160, 180, 200);

    this.rewardClaimBtnNode = this.button(
      '提取入包',
      0,
      -105,
      () => void this.executeClaimReward(),
      () => this.canClaimReward(),
      180
    );

    // --- Footer Banner & Recovery Control (y = -228) ---
    this.resultBannerLabel = this.label(this.root, '', -120, -228, 14, 520);
    this.resultBannerLabel.color = new Color(100, 230, 255);

    this.statusLabel = this.label(this.root, '', 160, -228, 13, 300);
    this.statusLabel.color = new Color(255, 120, 120);

    this.recoverButtonNode = this.button(
      '确认操作结果恢复',
      260,
      -228,
      () => void this.executeRecover(),
      () => this.state.status === 'unknown',
      170,
      32
    );
    this.recoverButtonNode.active = false;

    // Initial updates
    this.updateInboxRows();
    this.updateRewardRows();
    this.updateInboxDetails();
    this.updateRewardDetails();
  }

  get isOpen(): boolean {
    return this.visible;
  }

  get mode(): 'inbox' | 'rewards' {
    return this.currentMode;
  }

  public destroy(): void {
    this.dispose();
  }

  public async open(): Promise<void> {
    this.visible = true;
    this.root.active = true;
    this.suppressMouseUntil = Date.now() + 250;
    this.localError = '';
    this.localNotice = '';

    if (this.currentContextId) {
      await this.coordinator.open(this.currentContextId);
    }
    this.syncFromCoordinator();
    this.options.onVisibility?.(true);
  }

  public close(): void {
    if (!this.visible) return;
    this.cancel();
    this.visible = false;
    this.root.active = false;
    this.coordinator.close();
    this.options.onVisibility?.(false);
  }

  public dispose(): void {
    this.close();
    game.off(Game.EVENT_HIDE, this.onHide, this);
    if (this.root.isValid) this.root.destroy();
  }

  public switchMode(mode: 'inbox' | 'rewards'): void {
    if (this.state.status === 'submitting') return;
    this.currentMode = mode;
    this.localError = '';
    this.localNotice = '';

    this.inboxContainer.active = mode === 'inbox';
    this.rewardsContainer.active = mode === 'rewards';

    if (mode === 'inbox') this.updateInboxRows();
    if (mode === 'rewards') this.updateRewardRows();
    this.updateTabStyles();
  }

  private updateTabStyles(): void {
    skinSprite(
      this.inboxTabNode,
      this.currentMode === 'inbox' ? 'ui/slices/button_pressed' : 'ui/slices/button_normal',
      true
    );
    skinSprite(
      this.rewardsTabNode,
      this.currentMode === 'rewards' ? 'ui/slices/button_pressed' : 'ui/slices/button_normal',
      true
    );
  }

  // --- Inbox Mode Logic ---
  private getMails(): MailItem[] {
    if (this.options.mailboxProvider) return this.options.mailboxProvider();
    if (this.state.mails && this.state.mails.length > 0) return this.state.mails;
    return this.defaultSandboxMails();
  }

  private updateInboxRows(): void {
    const mails = this.getMails();
    for (let i = 0; i < this.mailRows.length; i++) {
      const row = this.mailRows[i];
      const mail = mails[i] ?? null;
      row.mail = mail;
      if (mail) {
        row.node.active = true;
        skinSprite(row.statusIconNode, mail.read ? 'icons/special_book_48' : 'icons/special_card_48', true);
        row.senderLabel.string = '来自: 旅店招待所';
        row.senderLabel.color = mail.read ? new Color(150, 165, 180) : new Color(255, 230, 150);

        const daysLeft = Math.max(1, Math.ceil((mail.expiresAt - Date.now()) / (24 * 3600 * 1000)));
        row.expireLabel.string = `保全剩余 ${daysLeft}天`;

        const hasAttach = mail.attachments.some(a => a.quantityGranted > a.quantityClaimed);
        row.subjectLabel.string = `${mail.read ? '' : '● '}${this.mockSubject(mail.mailId)}`;
        row.subjectLabel.color = mail.read ? new Color(190, 200, 210) : new Color(255, 255, 255);

        row.badgeNode.active = hasAttach;
        row.badgeLabel.string = hasAttach ? `附件(${mail.attachments.length})` : '';
      } else {
        row.node.active = false;
      }
    }

    const currentMail = mails.find(m => m.mailId === this.selectedMailId);
    if (!currentMail && mails.length > 0) {
      this.selectedMailId = mails[0].mailId;
    }
    this.updateInboxDetails();
  }

  private updateInboxDetails(): void {
    const mails = this.getMails();
    const mail = mails.find(m => m.mailId === this.selectedMailId);
    if (!mail) {
      this.mailDetailSubjectLabel.string = '请选择信件';
      this.mailDetailSenderLabel.string = '';
      this.mailDetailTimeLabel.string = '';
      this.mailDetailBodyLabel.string = '收件箱暂无选中信件。';
      this.mailAttachmentNameLabel.string = '无附件';
      this.mailAttachmentQtyLabel.string = '';
      skinSprite(this.mailAttachmentSlotIcon, 'icons/special_book_48', true);
      return;
    }

    this.mailDetailSubjectLabel.string = this.mockSubject(mail.mailId);
    this.mailDetailSenderLabel.string = '发件人: 赫顿玛尔市政厅';
    const date = new Date(mail.createdAt);
    this.mailDetailTimeLabel.string = `${date.getMonth() + 1}月${date.getDate()}日投递`;
    this.mailDetailBodyLabel.string = this.mockBody(mail.mailId);

    const firstUnclaimed = mail.attachments.find(a => a.quantityGranted > a.quantityClaimed) ?? mail.attachments[0];
    if (firstUnclaimed) {
      const isClaimed = firstUnclaimed.quantityClaimed >= firstUnclaimed.quantityGranted;
      const itemName = this.mockAttachmentName(firstUnclaimed.templateRef);
      const quality = this.mockAttachmentQuality(firstUnclaimed.templateRef);

      skinSprite(this.mailAttachmentSlotBorder, `ui/slices/${qualityBorderKey(quality)}`, true);
      skinSprite(this.mailAttachmentSlotIcon, this.mockAttachmentIcon(firstUnclaimed.templateRef), true);

      this.mailAttachmentNameLabel.string = itemName;
      this.mailAttachmentNameLabel.color = qualityColor(quality);

      const remain = firstUnclaimed.quantityGranted - firstUnclaimed.quantityClaimed;
      this.mailAttachmentQtyLabel.string = isClaimed ? '[已提取]' : `数量: ${remain}`;
      this.mailAttachmentQtyLabel.color = isClaimed ? new Color(150, 160, 170) : new Color(255, 215, 60);
    } else {
      this.mailAttachmentNameLabel.string = '此信件未附带物品';
      this.mailAttachmentNameLabel.color = new Color(160, 175, 190);
      this.mailAttachmentQtyLabel.string = '';
      skinSprite(this.mailAttachmentSlotIcon, 'icons/special_book_48', true);
      skinSprite(this.mailAttachmentSlotBorder, 'ui/slices/slot_border_rough', true);
    }
  }

  private canClaimAttachment(): boolean {
    if (this.state.status === 'submitting') return false;
    const mails = this.getMails();
    const mail = mails.find(m => m.mailId === this.selectedMailId);
    if (!mail) return false;
    return mail.attachments.some(a => a.quantityGranted > a.quantityClaimed);
  }

  private canDeleteMail(): boolean {
    if (this.state.status === 'submitting') return false;
    const mails = this.getMails();
    const mail = mails.find(m => m.mailId === this.selectedMailId);
    if (!mail) return false;
    // Strictly forbid deleting mail with unclaimed attachments
    return !mail.attachments.some(a => a.quantityGranted > a.quantityClaimed);
  }

  private canClaimBatch(): boolean {
    if (this.state.status === 'submitting') return false;
    const mails = this.getMails();
    return mails.some(m => m.attachments.some(a => a.quantityGranted > a.quantityClaimed));
  }

  private async markCurrentRead(): Promise<void> {
    if (!this.selectedMailId) return;
    try {
      await this.coordinator.markRead(this.selectedMailId);
      this.syncFromCoordinator();
      this.updateInboxRows();
    } catch {}
  }

  private async executeClaimAttachment(): Promise<void> {
    const mails = this.getMails();
    const mail = mails.find(m => m.mailId === this.selectedMailId);
    if (!mail) return;
    const attach = mail.attachments.find(a => a.quantityGranted > a.quantityClaimed);
    if (!attach) return;

    this.localError = '';
    this.localNotice = '';
    try {
      await this.coordinator.claimAttachment(mail.mailId, attach.attachmentId);
      if (this.coordinator.state.status === 'ready') {
        const name = this.mockAttachmentName(attach.templateRef);
        this.localNotice = `提取成功：${name} 已放入背包`;
        this.updateInboxRows();
        this.options.onSuccess?.('claim', this.localNotice);
      }
      this.syncFromCoordinator();
    } catch (err: unknown) {
      this.localError = (err as Error).message || '提取附件失败';
      this.syncFromCoordinator();
    }
  }

  private async executeDeleteMail(): Promise<void> {
    const mails = this.getMails();
    const mail = mails.find(m => m.mailId === this.selectedMailId);
    if (!mail) return;

    this.localError = '';
    this.localNotice = '';
    try {
      await this.coordinator.deleteMail(mail.mailId);
      if (this.coordinator.state.status === 'ready') {
        this.localNotice = '已安全删除已读信件';
        this.selectedMailId = null;
        this.updateInboxRows();
        this.options.onSuccess?.('delete', this.localNotice);
      }
      this.syncFromCoordinator();
    } catch (err: unknown) {
      this.localError = (err as Error).message || '删除信件失败';
      this.syncFromCoordinator();
    }
  }

  private async executeClaimBatch(): Promise<void> {
    this.localError = '';
    this.localNotice = '';
    try {
      const res = await this.coordinator.claimAvailable();
      if (this.coordinator.state.status === 'ready') {
        this.localNotice = `一键领取完成：成功收取 ${res.totalDelivered} 件附件${res.skippedCount > 0 ? ` (因背包满跳过 ${res.skippedCount} 件)` : ''}`;
        this.updateInboxRows();
        this.options.onSuccess?.('claimBatch', this.localNotice);
      }
      this.syncFromCoordinator();
    } catch (err: unknown) {
      this.localError = (err as Error).message || '一键领取失败';
      this.syncFromCoordinator();
    }
  }

  // --- Rewards Mode Logic (Permanent Pending Grants) ---
  private getRewards(): RewardItem[] {
    if (this.options.rewardsProvider) return this.options.rewardsProvider();
    if (this.state.rewards && this.state.rewards.length > 0) return this.state.rewards;
    return this.defaultSandboxRewards();
  }

  private updateRewardRows(): void {
    const rewards = this.getRewards();
    for (let i = 0; i < this.rewardRows.length; i++) {
      const row = this.rewardRows[i];
      const reward = rewards[i] ?? null;
      row.reward = reward;
      if (reward) {
        row.node.active = true;
        const name = this.mockRewardName(reward.itemId);
        const quality = this.mockRewardQuality(reward.itemId);

        skinSprite(row.slotIcon, this.mockRewardIcon(reward.itemId), true);
        skinSprite(row.borderNode, `ui/slices/${qualityBorderKey(quality)}`, true);

        row.nameLabel.string = name;
        row.nameLabel.color = qualityColor(quality);

        const isDelivered = reward.state === 'delivered';
        row.statusLabel.string = isDelivered ? '[已入包]' : '[待提取]';
        row.statusLabel.color = isDelivered ? new Color(150, 160, 170) : new Color(255, 215, 60);
      } else {
        row.node.active = false;
      }
    }

    const currentReward = rewards.find(r => r.grantId === this.selectedGrantId);
    if (!currentReward && rewards.length > 0) {
      this.selectedGrantId = rewards[0].grantId;
    }
    this.updateRewardDetails();
  }

  private updateRewardDetails(): void {
    const rewards = this.getRewards();
    const reward = rewards.find(r => r.grantId === this.selectedGrantId);
    if (!reward) {
      this.rewardDetailNameLabel.string = '请选择待领装备';
      skinSprite(this.rewardDetailSlotIcon, 'icons/special_card_48', true);
      skinSprite(this.rewardDetailSlotBorder, 'ui/slices/slot_border_rough', true);
      return;
    }

    const name = this.mockRewardName(reward.itemId);
    const quality = this.mockRewardQuality(reward.itemId);

    this.rewardDetailNameLabel.string = name;
    this.rewardDetailNameLabel.color = qualityColor(quality);

    skinSprite(this.rewardDetailSlotIcon, this.mockRewardIcon(reward.itemId), true);
    skinSprite(this.rewardDetailSlotBorder, `ui/slices/${qualityBorderKey(quality)}`, true);
  }

  private canClaimReward(): boolean {
    if (this.state.status === 'submitting') return false;
    const rewards = this.getRewards();
    const reward = rewards.find(r => r.grantId === this.selectedGrantId);
    return !!(reward && reward.state === 'pending');
  }

  private async executeClaimReward(): Promise<void> {
    const rewards = this.getRewards();
    const reward = rewards.find(r => r.grantId === this.selectedGrantId);
    if (!reward) return;

    this.localError = '';
    this.localNotice = '';
    try {
      await this.coordinator.claimReward(reward.grantId);
      if (this.coordinator.state.status === 'ready') {
        const name = this.mockRewardName(reward.itemId);
        this.localNotice = `提取成功：${name} 已安全移入普通背包`;
        this.updateRewardRows();
        this.options.onSuccess?.('claimReward', this.localNotice);
      }
      this.syncFromCoordinator();
    } catch (err: unknown) {
      this.localError = (err as Error).message || '提取待领装备失败';
      this.syncFromCoordinator();
    }
  }

  // --- Recovery Logic ---
  public async recover(): Promise<void> {
    await this.executeRecover();
  }

  private async executeRecover(): Promise<void> {
    try {
      await this.coordinator.recover();
      this.syncFromCoordinator();
      if (this.state.status === 'ready') {
        this.localNotice = '已恢复并同步原操作结果';
        this.updateInboxRows();
        this.updateRewardRows();
      }
    } catch (err: unknown) {
      this.localError = (err as Error).message || '恢复失败';
      this.syncFromCoordinator();
    }
  }

  public update(): void {
    if (!this.visible) return;
    this.syncFromCoordinator();
  }

  private syncFromCoordinator(): void {
    this.state = this.coordinator.state;
    const unreadCount = this.state.summary?.unreadMailCount ?? this.getMails().filter(m => !m.read).length;
    const pendingCount = this.state.summary?.pendingCount ?? this.getRewards().filter(r => r.state === 'pending').length;

    this.unreadBadgeLabel.string = `未读信件: ${unreadCount}`;
    this.pendingBadgeLabel.string = `待领奖励: ${pendingCount}`;

    this.recoverButtonNode.active = this.state.status === 'unknown';

    if (this.state.status === 'submitting') {
      this.statusLabel.string = '正在提交请求到服务端…';
      this.statusLabel.color = new Color(255, 215, 60);
    } else if (this.state.status === 'unknown') {
      this.statusLabel.string = '交易状态未决，请点击右侧确认结果恢复';
      this.statusLabel.color = new Color(255, 120, 120);
    } else if (this.state.code || this.localError) {
      this.statusLabel.string = errorLabel(this.state.code || this.localError);
      this.statusLabel.color = new Color(255, 120, 120);
    } else {
      this.statusLabel.string = '';
    }

    this.resultBannerLabel.string = this.localNotice;

    // Refresh control buttons
    for (const ctrl of this.controls) {
      const enabled = ctrl.canEnable();
      skinSprite(ctrl.node, enabled ? 'ui/slices/button_normal' : 'ui/slices/button_disabled', true);
    }
  }

  public async submitCurrentAction(): Promise<void> {
    if (this.currentMode === 'inbox') {
      if (this.canClaimAttachment()) {
        await this.executeClaimAttachment();
      } else if (this.canClaimBatch()) {
        await this.executeClaimBatch();
      }
    } else if (this.currentMode === 'rewards') {
      if (this.canClaimReward()) {
        await this.executeClaimReward();
      }
    }
  }

  // --- Mock String Helpers for Presentation ---
  private mockSubject(mailId: string): string {
    if (mailId.includes('welcome')) return '冒险者公会迎新物资发放';
    if (mailId.includes('arena')) return '月光竞技场周常参与嘉奖';
    if (mailId.includes('notice')) return '停机更新维护与全服补偿';
    return `市政厅投递信件 #${mailId.slice(0, 6)}`;
  }

  private mockBody(mailId: string): string {
    if (mailId.includes('welcome')) return '欢迎踏入世界308！公会已为你准备了应急补给药剂，请及时查收并在历练中妥善使用。';
    if (mailId.includes('arena')) return '你在本周的模拟对决中表现优异，特此授予纪念太刀，望在未来的地下城挑战中再创佳绩！';
    return '尊敬的玩家：服务器已完成版本例行维护，本次调整了城镇界面布局。祝游戏愉快！';
  }

  private mockAttachmentName(ref: string): string {
    if (ref.includes('potion')) return '初级生命药剂';
    if (ref.includes('sword') || ref.includes('weapon')) return '精制精铁太刀';
    if (ref.includes('armor')) return '行军锁子甲';
    return '未知包裹物资';
  }

  private mockAttachmentQuality(ref: string): string {
    if (ref.includes('sword')) return 'blue';
    if (ref.includes('armor')) return 'green';
    return 'white';
  }

  private mockAttachmentIcon(ref: string): string {
    if (ref.includes('potion')) return 'icons/consumable_hp_potion_48';
    if (ref.includes('sword') || ref.includes('weapon')) return 'icons/weapon_dual_blades_48';
    return 'icons/armor_chest_48';
  }

  private mockRewardName(itemId: string): string {
    if (itemId.includes('ring')) return '牛头械王的心脏戒指';
    if (itemId.includes('dagger')) return '落雷凯诺的淬毒匕首';
    return `副本溢出珍宝 #${itemId.slice(0, 6)}`;
  }

  private mockRewardQuality(itemId: string): string {
    if (itemId.includes('ring')) return 'purple';
    return 'blue';
  }

  private mockRewardIcon(itemId: string): string {
    if (itemId.includes('ring')) return 'icons/ring_48';
    return 'icons/weapon_dual_blades_48';
  }

  private defaultSandboxMails(): MailItem[] {
    const now = Date.now();
    return [
      {
        mailId: 'mail-welcome-01',
        characterId: 'char-default',
        createdAt: now - 3600000,
        expiresAt: now + 29 * 24 * 3600 * 1000,
        read: false,
        attachments: [
          {
            attachmentId: 'att-welcome-hp',
            kind: 'stack',
            templateRef: 'potion_hp_minor',
            quantityGranted: 10,
            quantityClaimed: 0,
            binding: { kind: 'none' },
          },
        ],
      },
      {
        mailId: 'mail-arena-01',
        characterId: 'char-default',
        createdAt: now - 86400000,
        expiresAt: now + 27 * 24 * 3600 * 1000,
        read: true,
        attachments: [
          {
            attachmentId: 'att-arena-sword',
            kind: 'equipment',
            templateRef: 'weapon_blade_rare',
            quantityGranted: 1,
            quantityClaimed: 0,
            binding: { kind: 'character' },
          },
        ],
      },
      {
        mailId: 'mail-notice-01',
        characterId: 'char-default',
        createdAt: now - 172800000,
        expiresAt: now + 25 * 24 * 3600 * 1000,
        read: true,
        attachments: [],
      },
    ];
  }

  private defaultSandboxRewards(): RewardItem[] {
    const now = Date.now();
    return [
      {
        grantId: 'grant-boss-ring-01',
        itemId: 'item-boss-ring-99',
        characterId: 'char-default',
        createdAt: now - 7200000,
        state: 'pending',
      },
      {
        grantId: 'grant-boss-dagger-01',
        itemId: 'item-boss-dagger-88',
        characterId: 'char-default',
        createdAt: now - 14400000,
        state: 'delivered',
      },
    ];
  }

  // --- Helper Node Creators ---
  private node(parent: Node, name: string, x: number, y: number, w: number, h: number): Node {
    const n = new Node(name);
    n.layer = parent.layer;
    n.setPosition(x, y, 0);
    const tr = n.addComponent(UITransform);
    tr.setContentSize(w, h);
    parent.addChild(n);
    return n;
  }

  private label(parent: Node, text: string, x: number, y: number, size: number, w = 300): Label {
    const n = new Node('Label');
    n.layer = parent.layer;
    n.setPosition(x, y, 0);
    const tr = n.addComponent(UITransform);
    tr.setContentSize(w, size + 6);
    const lbl = n.addComponent(Label);
    lbl.string = text;
    lbl.fontSize = size;
    lbl.lineHeight = size + 4;
    lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    lbl.color = new Color(230, 235, 240);
    parent.addChild(n);
    return lbl;
  }

  private button(
    text: string,
    x: number,
    y: number,
    action: () => void,
    canEnable: () => boolean,
    width = 120,
    height = 36
  ): Node {
    const btn = this.node(this.root, `Btn_${text.slice(0, 8)}`, x, y, width, height);
    skinSprite(btn, canEnable() ? 'ui/slices/button_normal' : 'ui/slices/button_disabled', true);
    this.label(btn, text, 0, 0, 14, width);

    this.interactiveButton(btn, width, height, action, canEnable);
    this.controls.push({ name: text, node: btn, width, canEnable, action });
    return btn;
  }

  private interactiveButton(
    btn: Node,
    _width: number,
    _height: number,
    action: () => void,
    canEnable: () => boolean
  ): void {
    let pressed = false;
    const reset = () => {
      if (pressed) {
        pressed = false;
        skinSprite(btn, canEnable() ? 'ui/slices/button_normal' : 'ui/slices/button_disabled', true);
      }
    };
    this.buttonResets.push(reset);

    const onDown = () => {
      if (Date.now() < this.suppressMouseUntil) return;
      if (!canEnable()) return;
      pressed = true;
      skinSprite(btn, 'ui/slices/button_pressed', true);
    };

    const onUp = () => {
      if (Date.now() < this.suppressMouseUntil) return;
      if (!pressed) return;
      pressed = false;
      skinSprite(btn, canEnable() ? 'ui/slices/button_normal' : 'ui/slices/button_disabled', true);
      action();
    };

    btn.on(Node.EventType.TOUCH_START, onDown);
    btn.on(Node.EventType.TOUCH_END, onUp);
    btn.on(Node.EventType.TOUCH_CANCEL, reset);
    btn.on(Node.EventType.MOUSE_DOWN, onDown);
    btn.on(Node.EventType.MOUSE_UP, onUp);
  }

  public hitTest(
    x: number,
    y: number
  ): 'close' | 'inboxTab' | 'rewardsTab' | 'claimAttachment' | 'deleteMail' | 'claimBatch' | 'claimReward' | 'recover' | null {
    if (!this.visible) return null;
    if (Math.abs(x - 400) <= 40 && Math.abs(y - 226) <= 20) return 'close';
    if (Math.abs(x - (-400)) <= 40 && Math.abs(y - 226) <= 20) return 'close';

    if (Math.abs(y - 185) <= 20) {
      if (Math.abs(x - (-260)) <= 80) return 'inboxTab';
      if (Math.abs(x - (-80)) <= 80) return 'rewardsTab';
    }

    if (this.currentMode === 'inbox') {
      if (Math.abs(x - (-70)) <= 65 && Math.abs(y - (-110)) <= 18) return 'claimAttachment';
      if (Math.abs(x - 80) <= 65 && Math.abs(y - (-110)) <= 18) return 'deleteMail';
      if (Math.abs(x - (-190)) <= 150 && Math.abs(y - (-135)) <= 18) return 'claimBatch';
    }

    if (this.currentMode === 'rewards') {
      if (Math.abs(x) <= 90 && Math.abs(y - (-105)) <= 18) return 'claimReward';
    }

    if (this.state.status === 'unknown' && Math.abs(x - 260) <= 85 && Math.abs(y - (-228)) <= 18) return 'recover';

    return null;
  }
}
