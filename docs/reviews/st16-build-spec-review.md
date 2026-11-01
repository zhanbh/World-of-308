# ST16 build 独立 Spec 轴评审

2026-11-01。评审者：独立 Spec 子 Agent；只读实现，未改实现或 Git。固定基点 `361ea7b7f8f5b327df38ac6dd3cedb4a8bdda5e4`，固定 HEAD `8d73ca80d781bfbb4b14187ab284d203334a25a7`；检查 `git diff <base>...<HEAD>` 及区间提交。依据 soflow code-review adapter/upstream、AGENTS、已接受 ST16 spec/五项 issues，以及 source-of-truth 的恢复/加载/API/状态合同。

## 评审结论

未发现需修改的 Spec 轴问题：未识别缺失/部分实施需求、越界功能或表面实现却违反合同的具体反例。

AC16-1/7 的原意图查询、notFound 保留及恢复栅栏后确认与代次退役一致；AC16-2/3 的固定截止、资源/有序证明/ready 后当前证明沿既有合同。AC16-4/5 对 dead、completed/looting 的证明和动作资格分别处理；AC16-6 保留活动战斗缺口和预测上界。AC16-8 具有真实协调器生命周期入口及恢复后中立输入，死亡不新增动作。

05 联合药品、真实掉落和终局消费者、18 个实际控制写点故障断言与计量相符；小历史与直接注入的 8 块容量明确分列，未把容量夹具说成自然历史。生产登录 UI、SDK/费用、高熵发布域和真实网络/设备均明确保留 GAP，符合规格允许的验收边界；不要求本轮越界补齐。

## 独立验证与限制

独立运行 `node --experimental-strip-types --test backend/test/active-combat-recovery.test.mjs backend/test/cocos-lifecycle-recovery.test.mjs backend/test/dead-looting-recovery.test.mjs backend/test/unknown-recovery-barrier.test.mjs`：exit 0，32/32。包含 held=true 的真实首片恢复、旧组件迟回调、dead/looting、原 O 和实际 OCC 双序。

静态检查联合验收测试、夹具和 05 计量报告；未重复 8 块耗时容量测试或全套七阶段，也未运行 Creator、浏览器、设备或 SDK。完整七阶段及最终源码离线构建由根会话单独闭合。04 历史类型失败不能算 PASS；已检查 05 对原始日志的更正和实际 seq 修正，不据旧口头汇报作结论。本结果是固定源码的 Spec 轴评审，不替代 Standards 轴或发布验收。
