# ST14-04 死亡复活 HUD、状态机与视觉交互独立评审与验证报告

## 1. 任务背景与目标
- **故事**: ST14【死亡、复活与失败退出】
- **任务编号**: ST14-04【Cocos 死亡复活 HUD、状态机与视觉交互】
- **执行目标**:
  1. 死亡触发复活 HUD：居中展示 10.0 秒平滑倒计时进度条与倒计时数字。
  2. 实时展示当前角色背包内复活纹章存量（如 `复活纹章: 10`）以及特殊副本剩余复活次数（如 `剩余复活: 3/3`）。
  3. 提供【立即复活】与【放弃退出】交互按钮；无纹章或达上限时复活按钮置灰并提示原因。
  4. 点击【立即复活】：发送请求，收到成功响应后播放起死金色光环、全满血蓝刷新、职业技能 CD 重置；
  5. 点击【放弃退出】或倒计时归零：触发渐隐转场，退出挑战返回副本大门。
  6. 错误与未知状态容错：网络延迟或未知响应保持 HUD 提示，不冲掉新场景，确保离线 Cocos 构建与纯模型测试双绿。

## 2. 架构设计与改动清单
- **纯逻辑模型 `DeathReviveHUDModel.ts`**:
  - 独立于 Cocos 引擎与 DOM，纯 TypeScript 类，支持纯 Node 自动化测试与 Cocos 原型装配。
  - 状态机：`hidden` -> `active` -> `submittingRevive` / `submittingLeave` -> `revived` / `exited`。
  - 精确命中判定：面板居中，提供【立即复活】按钮（`x: -75, y: -55, width: 120, height: 44`）与【放弃退出】按钮（`x: 75, y: -55, width: 120, height: 44`）。
  - 视觉反馈动效参数：
    - `goldenAura`: 复活瞬间在战士周围生成金色神圣光环（持续 2.0s，随时间淡出）。
    - `fadeOut`: 放弃或倒计时超时退出时触发黑屏渐隐（1.0s），平滑过渡。
- **技能重置 `WarriorSkillsModel.resetCooldowns()`**:
  - 实现了死亡复活后的技能冷却清空，重置十字斩、崩山击、拔刀斩、崩山裂地斩的所有 CD。
- **Cocos 原型集成 `Prototype.ts`**:
  - `onLoad`: 初始化死亡面板、倒计时进度条、纹章存量、次数上限与按钮 Label 节点。
  - `update(dt)`: 实时检测 `this.model.isDead`，激活 HUD，推进倒计时与渐隐动画。
  - `draw(dt)`: 渲染半透明遮罩、居中弹窗、10s 平滑进度条（>3s 绿色，<=3s 警示红）、复活/退出按钮以及战士身周金色复活光环。
  - `touchStart / touchMove / touchEnd / keyDown`: 拦截输入，阵亡期间阻止普攻/移动/技能，命中按钮执行复活或放弃逻辑。
- **自动化测试回归**:
  - `client/tools/check-ui-model.cjs`: 新增测试 9，验证 `DeathReviveHUDModel` 布局几何、点击命中、10s 倒计时、纹章存量显示、特殊副本 3 次限制、置灰原因（`EMBLEM_NOT_ENOUGH` / `REVIVE_LIMIT_REACHED`）、金色光环与黑屏淡出。
  - `client/tools/check-model.cjs` & `tools/tsconfig.models.json`: 纳入类型检查与 transpiled 纯模型测试矩阵。

## 3. 全链路工具链门禁验证
运行：
```powershell
& "C:/Users/bohan.zhan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe" tools/check-all.cjs --typescript "C:/ProgramData/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript"
```
验证结果：
- CHECK: tooling contracts -> PASS (7/7)
- CHECK: shared/backend types -> PASS
- CHECK: shared value contracts -> PASS (227/227)
- CHECK: client pure-model types -> PASS
- CHECK: backend regression (legacy and v2) -> PASS (633/633)
- CHECK: client model regression -> PASS (21/21)
- CHECK: client UI-model regression -> PASS (9/9)
- **SUMMARY: 7/7 checks passed (100% 成功)**
- **遵循约束**: 无外部浏览器打开，全流程纯无头命令行执行，无 Jira 单据或额外外部依赖。
