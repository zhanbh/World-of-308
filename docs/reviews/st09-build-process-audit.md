# ST09 soflow build 流程追溯与当前门禁

2026-10-24。用户要求核对并补齐ST09的build流程，重申工程不允许创建Jira单。审计对象固定为 `04a1cc7...5129c57461c7daed1c20999d5c3b0b82382f9d00`，不是ST10开工，也不重做已批准任务图。

执行技能：soflow build及其implement-spec、code-review；实际技能路径记录在下方，仓库读者不依赖个人机器链接。优先遵守根AGENTS.md和用户授权。Jira、glab认证、外部MR就绪写入不作为本仓库本地交付前置，不创建虚构key/SP/MR/CI记录。

## 结论边界

本次是**事后核查和当前检查补齐**，不能追认原实施完全符合build。原代码已在5129c57提交并推送；现有Accepted规格/任务的来源修订保持不变。仅更新派生执行状态及新增审计证据，不改spec.md，不篡改旧评审或旧SHA清单。

| build要求 | 原实施事实 | 本次处置 |
| --- | --- | --- |
| 定位spec与Accepted任务图 | 四项任务已批准，有来源/任务SHA | 本地验证Accepted、修订、依赖和原交付清单；通过 |
| 外部排期/Jira key/glab/MR | 本工程本地任务流程，GitHub远端 | 由AGENTS.md替代为仓库文档；未调用外部单据或补造字段 |
| integration branch | 使用用户指定feat-1.0.0，单提交5129c57 | 保持现有分支，不重写已推送历史 |
| frontier 01→02/03/04 | 并发按规则/服务/协调器/UI分工，未形成逐任务完成后推进的完整记录 | 记录历史偏差；现在验证依赖图和组合行为，不能补造当时调度 |
| 每implementer独立worktree/branch | 原实施共享checkout | 历史不符合；事后建空worktree无证明力，不作伪整改；本轮审计仅只读代码+各自报告 |
| 每ticket TDD纵切循环 | 部分测试/失败记录存在，不能证明每ticket完整red→green | 不声称全程TDD；本轮回归是当前验证，不冒充先测证据 |
| merger子Agent合入integration | 原实施由主任务集成共享文件，没有独立merger记录 | 历史偏差不可补造 |
| 完整diff双轴独立评审 | 原有后端规格/客户端评审；未覆盖完整diff双轴且未充分绑定提交 | 本轮新起两个独立评审者，固定5129c57全diff，分别写Standards/Spec报告 |
| 问题修复与复核 | 原三项P2有修复与独立复核，真实Cocos验收 | 原记录保留；本轮新发现须真实修复和复核后记录，不先宣称通过 |
| ticket coverage/revision | execution.json有四项，但仍标未提交，任务原文pending | 保留原Approved正文，更新派生执行状态、交付SHA、证据和当前入口 |
| 行为/类型/安全/CI证据绑定 | 本地测试/真实Cocos有证据；无远端CI/正式SDK/手机证据 | 本轮重新运行本地检查、Cocos类型；文本凭证筛查仅有限检查，远端CI写未运行，不冒充MR-ready |
| 清理implementer worktrees | 原实施未创建 | 无可清理工作区，不触碰其他工作树 |

## 本轮补核工作区

首次管理工作树位于默认沙箱外，出现写入审批等待；停止该路径写入后，改用项目内 `.worktrees/st09-build-audit`，分支 `feat/st09-build-audit`。先本地提交 `7a6b2d1` 的精确忽略规则，再创建工作树，原用户配置不搬动。新工作树起点为原交付5129c57加忽略规则；补测由单独implementer完成，再由merger整合，不能据此声称原实施也用了该流程。旧管理工作树已归档，无需触碰其他工作区。

## 当前可复现检查

运行 `python3 docs/stories/warrior-loop/st09/verify-build-audit.py`，只读本地Git和文件、输出JSON；无联网、Jira、外部写入。已保存输出[build-audit-checks.json](../stories/warrior-loop/st09/build-audit-checks.json)。检查Accepted规格/来源/各票据SHA、缺依赖/环、原提交51文件清单。代码不变时有效；文档追加审计后清单按原commit读取，避免把历史清单改成新结果。用内存中的计划副本验证了过期spec和依赖环均拒绝，原Approved图通过；未修改真实计划。

重新运行 `node tools/check-all.cjs --typescript /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript`：7/7，通过工具7、共享112、后端335测试以及类型/旧模型检查。另运行同命令加 `--type-project tools/tsconfig.cocos-inventory.json`，真实Cocos声明类型通过。测试输出计数在[执行记录](../stories/warrior-loop/st09/execution.json)中归档。

原Cocos H5构建/鼠标/触屏模拟/丢包恢复证据见[原本地验收](st09-local-verification.md)，本轮未冒称重做浏览器/真机。原功能文件与manifest一致时沿用；更改代码则需按受影响范围重验。

文本diff做private-key/GitHub token/AWS access-id/Slack token格式筛查，未命中；不代表完整安全审计、依赖扫描或平台安全通过。仓库没有配置远端CI，本轮未安装扫描器或借本地测试冒充CI。

原提交最大合法字段探针额外发现真实缺陷：[原始探针](st09-original-size-probe.json)中，100格角色绑定堆叠内部约82KiB，双私有容器快照133084字节，旧parser抛PAYLOAD_TOO_LARGE。该探针还未使用JSON转义最坏字符；补测将进一步验证128位ASCII引号/反斜线，不能缩短合法ID或减少格数掩盖预算不足。该原始缺陷已由下述a75ee61补核修复；原始探针和旧清单保留，不把旧失败改成成功。

## 任务覆盖与出口

| 任务 | 代码/实际接口 | 测试与交互证据 |
| --- | --- | --- |
| ST09-01 | BankService bank.get/itemVersion，Town getInventory，BankCoordinator/Panel | bank-v2/town-bank-regression/bank-coordinator；真实切页与左右滚动 |
| ST09-02 | planStackTransfer、inventory.transfer | bank-rules/bank-v2/bank-panel-gesture；真实数量取消/存取/绑定拒绝/丢包恢复 |
| ST09-03 | planEquipmentTransfer、跨scope holdings | bank-v2逐写点、bank-composition真实ST05/ST06；真实整件存取 |
| ST09-04 | expansionOffer/payment，expansionQuote/expand，普通Inventory扩容 | bank-v2/ordinary expansion coordinator/panel gesture；真实两币确认、锁格与B入口 |

四项保留明确的正式价格/发布域、SDK/真实事务、手机验收GAP；本轮不会补造它们。ST05～08界面联调是已记录缺口，**用户后续明确要求下一故事为ST10**，因此不把城镇联调新增为ST10前置。Accepted spec中的当时建议保留，最新顺序以本次用户决定为准。

## 后续 build 执行约束

ST10先按现有本地规格/任务图检查适用前置；未批准的新任务粒度再走一次必要的人眼闸门，不重复问ST09。实际实施按frontier推进，每implementer独立工作树并核对integration起点、逐ticket TDD、merger集成、完整diff双轴评审及逐项修复；如果采用其他方式，须在采用前说明适用依据，不能做完才称已完整走build。所有步骤只保留本地任务与门禁证据，不创建Jira。

技能来源：`/Users/zhanbohan/.codex/plugins/cache/soflow/soflow/2.8.0/skills/soflow/build/SKILL.md`；`.../upstream/mattpocock-skills/skills/engineering/implement-spec/SKILL.md`；`.../skills/soflow/upstream-adapters/code-review/SKILL.md`与`SKILL.upstream.md`。


## 本轮补核结果与当前门禁（2026-10-24）

补核修复本地提交 `a75ee619d4f64f2e073c62d5626e605aff028402`，已快进合入feat-1.0.0；未推送。单一implementer在项目内独立工作树完成，merger先独立核对祖先关系/干净状态/12文件范围，随后由主任务集中执行快进以处理子任务写权限审批，merger再核对合入后SHA及原9个dirty路径未变。[合入证据](st09-build-merge-verification.md)。这描述实际执行者，不冒称子Agent已执行被中断的写操作。

### Standards

[独立完整报告及复核](st09-build-standards-review.md)：硬性规范未关闭项0；未使用button模式参数已移除。银行入口访问规则重复保留1项非阻塞启发式建议：当前两个入口一致且回归通过，本次不为代码异味扩大身份/访问重构范围。不是把启发式建议当已修复，也不影响原授权规则。

### Spec

[独立完整报告及复核](st09-build-spec-review.md)：S1双向装备并发两种提交顺序、S2个人库四档两币矩阵已补测，首次即绿，未伪造失败记录。S3最大编码存在真实失败，测试先复现再修复；现已独立复核关闭，未关闭规格项0。

共享应用预算现为内部单容器256KiB、inventory.get128KiB、bank.get256KiB、整理J512KiB；其余查询64KiB、银行及其他普通J128KiB/O16KiB保持。修复同步Bank/Inventory/Equipment与公开解码/解析，不仅放宽银行一处而让同一合法背包在换装或普通读取时再次失败。实测内部双100堆约143065/143073B，银行快照230917B，单容器查询114894B，整理100输入95输出流水311437B，银行20目标合并流水66677B；包含合法ASCII128转义字符，不缩短字段掩盖问题。详见[真实红绿与数据](st09-build-fix-verification.md)。

主工作区合入后重新执行全套7/7，通过工具7、共享112、后端341测试和相关类型/模型；真实Cocos声明类型再次通过。重新构建命令被权限审批拒绝，未实际执行，尊重拒绝不换工具重试：**本轮Cocos H5构建仍待执行**；此前5129c57的构建/鼠标/触屏属于历史证据，不能覆盖新实现SHA。正式SDK、远端CI、安全平台和手机门禁仍未通过/未运行，不标MR-ready或正式发布就绪。

可复现计划/来源核对、原交付manifest、本轮实现diff的有限凭证筛查见[机器记录](../stories/warrior-loop/st09/build-audit-checks.json)。本轮审计文档尚未提交；旧delivery已推送与新fix仅本地分别记录在execution.json，不再混成一个布尔状态。下一故事是ST10，不插入未授权的新前置。

临时工作区收尾：管理工作树已归档，项目内实施工作树在确认干净、修复已合入后已移除；`git worktree list`只剩主工作区。修复分支和提交保留，可恢复审计，不删除用户其他工作区。
