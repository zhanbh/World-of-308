# ST12-02 本地验证报告

日期：2026-10-26。分支`feat/st12-02-ranged-charge`；初始基点`dd65f3c`（合入ST12-01后的`feat-1.0.0`）。本记录为实施者证据，不代表整包ST12/平台/设备验收。

只读来源：spec accepted_revision `26fc51d20aa68ff91e7cc72c0a9768ece64c0359710e36dd363d02f2577cebd7`；ST12-02 accepted_revision `02731e474c2625de15b77b01584cd6574ecf8bcd84625cb59ef84c936e48fde5`。

## 实际交付

1. **远程与投射物生命周期**：
   - 远程投石起手80 tick，收招50 tick，CD 400 tick，射程210px；
   - 到期释放独立飞行实体，速度400px/s，半宽22px，逐tick飞行并检测与玩家重叠，命中扣血并施加受控；
   - 投射物飞行完整进入`monsters[i].tactics.effects`，任意切片（如81 tick保存切片继续推进）与整段模拟输出严格一致；
   - 起手阶段被打断取消投射物生成；释放后施法者死亡或受控不取消已飞出投射物，继续按物理轨迹命中结算。

2. **冲锋与扫掠位移**：
   - 冲锋起手70 tick，活跃扫掠35 tick，收招70 tick，CD 500 tick，射程150px；
   - 起手终点锁定方向，活跃扫掠高速位移，地图边界/墙体碰撞停止扫掠；
   - 穿怪不免伤，不以玩家身体当硬墙；扫掠触碰玩家结算伤害并施加僵直；
   - 施法者被受控或死亡立即打断冲锋位移。

3. **四档难度与协同策略**：
   - 四档侧翼上限：normal 0, adventure 1, warrior 1, king 2；
   - 四档后撤上限：normal 0, adventure 0, warrior 1, king 1；
   - 重型技能并发上限（specialCap）：normal 1, adventure 1, warrior 2, king 2；
   - 远程怪后撤机制：玩家距离 < 95px 时，在后撤配额内向 120px 处后撤拉开距离；超额或超出距离留在射程内输出；
   - 重型技能排队等待期间不预扣冷却时间；
   - 混合三怪遭遇（近战+远程+冲锋）同场对抗，分段切片与整段推进完全保真。

4. **严格数据模式与鲁棒性**：
   - `MonsterRuntime.tactics`严格校验为对象，拒绝`false`, `0`, `""`, `null`等非对象值；
   - 严格校验`role`与`effects`列表项的完整字段及有理数范围。

## 测试证据

本机Node **24.22.1**，TypeScript **5.8.2**，复用Creator安装离线运行。

1. 专项测试：`shared/test/monster-tactics.test.mjs` **8/8 全部通过**：
   - `ranged releases a moving projectile; release and flight survive a sliced checkpoint`: PASS
   - `projectile interrupted before release is cancelled; caster interrupted after release preserves in-flight projectile`: PASS
   - `charge locks direction, sweeps across map, deals damage on contact, and respects boundary`: PASS
   - `four-tier difficulty role assignments match candidate bounds`: PASS
   - `difficulty retreat behavior: warrior ranged retreats when player < 95px; normal ranged does not retreat`: PASS
   - `special attack concurrency cap delays second special attack without consuming cooldown`: PASS
   - `mixed encounter: melee, ranged, and charge monsters fight simultaneously; sliced checkpoint preserves exact outcome`: PASS
   - `strict validation: rejects falsy non-null tactics and invalid effect kind`: PASS

2. 继承测试：`shared/test/monster-joint.test.mjs` **12/12 全部通过**。

3. 全量门禁：`tools/check-all.cjs` **7/7 全部通过**：
   - tooling contracts: PASS
   - shared/backend types: PASS
   - shared value contracts: PASS (182/182 tests)
   - client pure-model types: PASS
   - backend regression (legacy and v2): PASS (573/573 tests)
   - client model regression: PASS
   - client UI-model regression: PASS
