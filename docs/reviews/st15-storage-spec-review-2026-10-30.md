# ST15 结果存储整改独立 Spec 评审

日期：2026-10-30。评审轴仅 Spec；固定 base `8cbbda3`，code HEAD `bf6c5ccf94088187085872fce5e4a87e9d39d83b`。唯一提交 `bf6c5cc fix(st15): store complete combat results in a bounded atomic gzip document`；评审命令 `git diff 8cbbda3...bf6c5cc`。未修改实现、未重跑作者的长全量/每写点测试、无 Jira/安装/云/推送。

## 依据与范围

读取根 AGENTS.md、soflow code-review adapter/upstream、source-of-truth.md、冻结 st15/spec.md、issues/05、plan-validation-2026-10-29.json、decision-terminal-stamina-2026-10-29.md、st15-local-verification.md、本次 storage-verification 及 combat-result-storage-v2.md，并核对完整差异、codec、公开查询、终局预算保护、新旧结果 oracle 及联合夹具测试。

## Spec

0 项可操作缺陷；未发现本次 diff 越过授权范围或改变奖励/体力玩法。合同 v2 第3行要求“完整事件、公开每页32条/最多1024页、稳定actionResultsRef及原O重放”，实现保存原数组 JSON，无资源串数值化、去重或配置重算；公开查询仍分页并严格解析。第5行“每操作一个包”与第9行“包和所有CP/资产/O/J仍同一事务”对应固定单包和现有同笔 set；原子预算保护仍生效。第7行的1MiB最终文档与32MiB流式解压上限均有实现及定向负测，schema1保留读取。

这不是完整发布包络证明：v2 第11行明确“尚未证明自然可达”及“完整可发布内容包络仍需正式发布器/SDK验证”。同499页与8改块混合样本成功、32768事件codec通过，不足以关闭任意高熵1024页、自然战斗可达性、云运行时和SDK/真机GAP。原任务05的全量7/7与每实际写点证据由根评审结合作者最终日志确认，本轴不自称独立完成。

## 独立执行

- `git rev-parse HEAD`、`git log 8cbbda3..bf6c5cc --oneline`、`git diff --stat 8cbbda3...bf6c5cc` 及定向/完整差异和合同读取。
- Node24 `--test backend/test/combat-result-storage.test.mjs`：沙箱子进程 spawn EPERM，未执行测试正文。
- 同 Node24 `--test --test-isolation=none backend/test/combat-result-storage.test.mjs`：2/2通过，覆盖32768事件无损codec、损坏与33MiB炸弹拒绝、公开旧schema1读取及损坏身份/压缩数据拒绝。使用既有运行时，无安装、无权限提升。

结论：本次映射整改 Spec 轴通过（0项发现），保留发布级GAP及最终联合日志待根评审汇总。
