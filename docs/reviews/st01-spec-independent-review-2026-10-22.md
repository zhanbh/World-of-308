# ST01 独立规格轴评审

2026-10-22；初审结论：需修复两项。仅本地验证，不代表真实 SDK、部署或 ST02 验收。基线 HEAD `ab195410928f3f887f928d87e56d5d4ad61f71e5`；审查未提交工作区。

批准规格 SHA-256：`5d06a7edfea304cd2f196f81ee7987223e30f0f01a84eeb52545947b8ba4890c`。读取 source-of-truth、身份合同§6/7、持有合同和加载/体力规则；九键初始化为权威纠正。

## 原始发现（修复前证据保留）

- **SR01 / P1：拒绝结果没有占用 open 意图。** `backend/src/identity/login-service.ts:64`、`:77`。独立直调：prepare 得到有效 T；以同 launch/openOperationId 和不存在的 ticketId commit，返回 `NOT_FOUND_OR_FORBIDDEN`；再换为有效 T，返回 `committed`。同 open 键异参没有拒绝，原拒绝也无法稳定重放。权威原句：身份合同§3“同open键异参拒绝”。应保留业务拒绝的原元组及结果；基础设施未知/鉴权失败不据此擅自固化业务结果。
- **SR02 / P1：异步读取期间跨截止仍能登录。** `backend/src/identity/login-service.ts:63`、`:79`、`:82`。独立 Store 端口包裹真实 MemoryStore，仅在 commit 读取候选 S 时把时钟由 1000 推至 61000；T.expiresAt=61000，结果仍 `committed`，初始化九键已发布。原因是只使用事务开始时的 now。权威原句：身份合同§6要求“commit同时校验票据未用/未过期”，§7“ T在事务重试期间过期则拒绝且整笔不提交”。需要最终时刻检查，并确保过期时不泄漏先前暂存的角色/挑战写入。

角色/场景指针、已提交 O 的 superseded 回放、来源绑定和客户端旧回调，本次静态核对未发现额外可复现问题；不等同穷尽证明。

## 原始代码快照 SHA-256

| 文件 | SHA-256 |
| --- | --- |
| backend/src/identity/identity-v2.ts | F6BD49D536A20151732F24C073B4AF7A065B5415AAF7F60FAE1C718F67BBD7AC |
| backend/src/identity/login-handoff.ts | 9BFC980A975D21B18FF5C9B4A50F83EB3423F6C3C111DBAB6E6AC9D2DDC32022 |
| backend/src/identity/login-model.ts | 3AF10D904FB93B8921F54A34193DA5023BC50840C4FB3A33CCD2BE7F5774DAC4 |
| backend/src/identity/login-service.ts | EEED8B25BAC6F9D3CE853EA693BC2002F37FEC98C582D469557E8F12B8E4C6FD |
| client/assets/scripts/net/LoginCoordinator.ts | 046137EC35EEC179220787F0C6469CEAFBF43F211A98C9E9A684488499C96DFA |

执行证据：使用已安装 Node24 直接导入 TS、真实 MemoryStore 和 LoginService；输出 `same-open { status: 'rejected', code: 'NOT_FOUND_OR_FORBIDDEN' } committed`、`expires committed 61000`。没有修改实现或安装依赖。

## 修复后独立复核

复核 service SHA-256：`A430CFF85F1030019C4FFEDBD432D9419CDDABAB6A649C73B6EF91833F324204`。原发现保留，SR01/SR02在本地范围内关闭。

独立变体直调通过：首个不存在票据的拒绝保存原结果；同 open 换有效票据返回 OPERATION_MISMATCH；推进时钟后同原参 replay 的 serverTime/code保持原值。另在最后一个初始化 holdings 读取时推进至票据截止，返回 DEADLINE_EXPIRED；真实 MemoryStore仅保留 prepared T与拒绝 O，没有初始化资产。检查实现最终期限判断前使用本事务 local write-plan，拒绝不会 flush交接写。

独立运行四个 login 测试文件，共64项通过、0失败，包含CP读取跨截止后旧H/CP/C/S保持原状、并发首登、未知恢复、旧会话不可复活和9个初始化写故障。存在 Node module-type性能提示，不影响断言。未增加SDK/云资源验证结论。
