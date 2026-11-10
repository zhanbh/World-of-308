# 正式旅店信箱与永久待领面板 UI 样式切片落地验证记录

2026-11-10。分支 `feat/mail-ui-style`，基线 `feat-1.0.0` / `2da6b75`。接续 ST07 单项邮件与永久待领领取、ST08 邮件与待领的可恢复批量领取能力，遵循本地文档管理与离线交付约束，不创建或同步 Jira 单据，不在会话窗口内嵌图片展示。

---

## 一、本轮交付范围与设计规范对齐

1. **底板与切片改造**：
   - 主窗口背景使用深色半透明遮罩与 912×500 的 `ui/slices/panel_window_frame` 9-Patch 外框；
   - 信件列表、详情卡与附件区底板均使用 `ui/slices/panel_well_inner` 凹槽切片，统一内嵌视口层次感；
   - 附件与待领槽位采用 56×56 标准规格的 `ui/slices/slot_grid_base` 与品质边框 `ui/slices/slot_border_*`；
   - 关闭按钮、模式切换 Tab 标签（系统信件/永久待领）、单项领取、安全删除、一键批量领取及未知网络自愈恢复按钮均升级为 9-Patch 切片（`ui/slices/button_normal`、`ui/slices/button_pressed`、`ui/slices/button_disabled`），剔除临时矢量代码。

2. **核心业务与交互双模式**：
   - **系统信件 (收件箱)**：展示信件列表、发件人、到期倒计时（30天保全期）、未读/已读状态标星；支持选中信件自动标已读、单附件领取、删除邮件（含未领附件时严格禁用防误删）；
   - **一键批量可恢复领取 (`mail.claimAvailable`)**：一键扫描并提取所有可用信件附件，遇到背包满项安全跳过并返回统计信息，支持断线重连恢复；
   - **永久待领 (奖励暂存)**：专为副本掉落或系统发放满包溢出设计的永久暂存区，无丢失不失效，支持随时提取移入普通背包；
   - **未知网络状态自愈**：超时或网络瞬断时置为 `unknown`，显示警告横幅并点亮自愈按钮，通过 `operation.get` 自动核对落地状态，杜绝重复领取或漏发。

3. **城镇场景与快捷交互集成**：
   - `Prototype.ts` 城镇模式在 `(50, 20)` 绘制旅店邮政信箱（深木立柱、深红邮箱壳、黄铜投信槽与金鹰纹章），顶部导航栏增设 `信箱 I` 快捷胶囊；
   - 支持键盘 `I` 键与 `Esc` 键快捷切换/关闭，支持触摸热区点击旅店信箱交互；
   - 沙盒协调器 `createSandboxMailCoordinator` 完整覆盖 `mail.list`、`reward.list`、`delivery.summary`、`mail.markRead`、`mail.claimAttachment`、`mail.delete`、`reward.claim` 及 `mail.claimAvailable`。

4. **单测套件交付**：
   - 交付 [`backend/test/mail-cocos.test.mjs`](file:///D:/IdeaProjects/World-of-308/backend/test/mail-cocos.test.mjs)，包含 9 组纯 Node / VM 自动化用例，完整覆盖生命周期、UI 层级标签、Tab 模式切换、单项领取、防删保护、一键批量、待领提取、热区命中几何、断网自愈与安全销毁。

---

## 二、实际验证记录与证据

1. **类型检查门禁**：
   - `client/tsconfig.json`：Cocos 客户端代码（包含 `MailPanel.ts`、`Prototype.ts`、`PrototypePreview.ts` 等）编译通过，0 错误；
   - `backend/tsconfig.json`：后端与协议层编译通过，0 错误；
   - `tools/tsconfig.models.json`：纯模型层编译通过，0 错误。

2. **单元与交互测试**：
   - 回归 [`backend/test/mail-cocos.test.mjs`](file:///D:/IdeaProjects/World-of-308/backend/test/mail-cocos.test.mjs) 9 组用例全部通过（100% 通过）：
     - `MailPanel: initializes closed, opens in inbox mode, and shows mail title and summary badges`；
     - `MailPanel: tab switching between inbox and rewards modes`；
     - `MailPanel: claim single attachment executes and updates coordinator and row status`；
     - `MailPanel: one-key batch claim (claimAvailable) collects all attachments across mails`；
     - `MailPanel: delete mail executes for mail without unclaimed attachments, blocked when attachments remain`；
     - `MailPanel: rewards mode displays permanent pending grants and executes claimReward into backpack`；
     - `MailPanel: hitTest accurately resolves interactive hotspots`；
     - `MailPanel: unknown network state exposes recovery button and resolves cleanly`；
     - `MailPanel: close and dispose cleanup safely`。
   - 回归 [`backend/test/mail-coordinator-batch.test.mjs`](file:///D:/IdeaProjects/World-of-308/backend/test/mail-coordinator-batch.test.mjs) 与 [`backend/test/mail-coordinator-v2.test.mjs`](file:///D:/IdeaProjects/World-of-308/backend/test/mail-coordinator-v2.test.mjs) 全部通过。
   - 回归全量面板交互单测（`shop-cocos.test.mjs`、`repair-cocos.test.mjs`、`enhancement-cocos.test.mjs`、`ranking-cocos.test.mjs`、`loot-victory-cocos.test.mjs`）共 36 组用例 100% 通过。

3. **客户端模型回归**：
   - `client/tools/check-ui-model.cjs`：UI 模型测试 100% 通过；
   - `client/tools/check-model.cjs`：动作与连段模型测试全部通过。
