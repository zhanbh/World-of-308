# ST15-03 独立复核

2026-10-29。复核提交 `a833234904c7285fa255d98b59c66e5c3f141c14`，代码基点 `16c7627`，差异命令 `git diff 16c7627...a833234`。独立复核者仅新增本报告，未修改实现。按 soflow code-review 的 Standards / Spec 两轴分别记录。

## Standards

未发现本次增量的阻断性工程约束违反。根 AGENTS、本地故事约束与 source-of-truth 已核对；未触发 Jira、安装、外部发布或云操作。`git diff --check 16c7627...a833234` 通过。以更早 `e369758` 为基点会包含 `16c7627` 的 execution.json CRLF 空白提示，不属于本次代码增量，未将其称为全历史 diff-check 通过。

资产改动仍在真实 simulation.submit 第二事务内，与 H/CP/O/J、钱包、角色、邮件、实例和 grant 同笔提交；确定键不存在性检查与原操作恢复保留。没有把 terminal helper 测试冒充真实 submit。升级后及末房磨损后的攻击统一沿 currentBasicStats 和 applyTrinketStats 计算，CP 分片和公开 hash 在最终角色资源、技能与攻击状态后生成。

## Spec

未发现本次增量的阻断性规格缺失。核对 Accepted spec/03任务、plan-validation、terminal-integration-notes、字段/API/状态/持有/来源和预算合同。Accepted spec 完整 SHA256 为 ba94c5afa1c3735075c9622513ba589f7e5f55a1ebfeb451d974c0ece8151315，03任务为 5855a794f7c417e6a014131fad92c41756585df9a203c0ffc706b2ed8b575d7a，与批准字节证据一致。体力采用用户明确新裁决：通关固定快照仍 unsettled，真正回城才 settled；独立 decision 覆盖旧 settled 行，未篡改原 Accepted 文件。

累计有效 XP 在30级阈值截断；跨六节点邮件使用确定键，已有 deleted/expired 来源不重发。direct/pending 的实例、来源、clearReceipt 及 pending 引用同笔固定；真实 MailService.reward.claim 和节点 mail.claimAttachment 消费者已由专项测试执行。套装限定30级特殊副本，缺件路径读取角色与账号摘要，固定基础样本后仅同套装版本/装等/品质映射部位；角色 pending 生成计入持有，领取不二次增加。

## 独立执行与限制

在最终提交亲自运行 Node24 `--test --test-isolation=none backend/test/terminal-settlement.test.mjs`：11/11 通过，涵盖真实 Boss 死亡入口、100格满包 pending/真实领取、逐实际 set 写点回滚、成功丢响应恢复、六邮件/stub、严格DTO与配置绑定、成长CP/hash、死亡升级不复活、套装来源拒绝及末房破损攻击。

亲自复现本地预算：100格满包、8敌、13槽、7磨损、6节点邮件、pending与双持有摘要；唯一 R36/W27，实际 get/set 66 次，写集42738B，最大单写6456B，包含 combatResults 页。该夹具只有2个CP块，不能证明8块极限、全字段最大编码、云SDK调用/commit/回调重试或费用；ST15-05仍承担全域预算及联合验收。

另独立执行普通房内存变体：可信活动房0、首怪 ordinary、角色累计 XP9，从真实 submit 升至2级，最大HP1100/MP510；时钟推进500ms后的不同 operation 再次 submit committed，资源上限保留且 stateHash 与 CP 公开hash一致。未修改磁盘实现。下一房 activate 只读确认沿用 previous.role.player（仅替换位置），恢复读取原CP；没有亲自完整跑普通房升级后七房转场/恢复，因此不将其宣称为端到端验证。

审阅作者全量日志记录7/7通过；独立复核本轮没有再次运行全7阶段，不将作者日志写为独立执行。Cocos视觉/真机、正式成长与掉落配置、云事务一致性/预算均仍GAP。

两轴结论：Standards 0项阻断；Spec 0项阻断。可进入ST15-04，ST15-05与平台/设备门禁保持待验收。
