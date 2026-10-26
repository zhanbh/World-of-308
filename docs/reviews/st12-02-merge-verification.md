# ST12-02 独立合入核验报告

2026-10-26。核验者为独立merger。集成分支`feat-1.0.0`以`git merge --ff-only feat/st12-02-ranged-charge`快进合入至 **`c5e35f7`**；未推送。

## 来源、范围与契约核验

1. **正文与修改范围**：
   - 依赖ST12-01已验证基线（`dd65f3c`）；
   - spec SHA256 与 ST12-02 accepted_revision（`02731e474c2625de15b77b01584cd6574ecf8bcd84625cb59ef84c936e48fde5`）完全一致，未修改正文；
   - 范围聚焦ST12-02：远程投石、冲锋扫掠、四档协同行为预算及重型攻击并发限制；未越界实现03首本逐房清场、04/05牛头Boss或06 Cocos构建。

2. **核心机制验证**：
   - **投射物独立性与切片保真**：投射物在释放点（hitTick 80）由施法怪物注入`tactics.effects`；一经释放，施法者死亡或受控不取消已释放的在途投射物；投射物数据完整包含于检查点，分段（81 tick）与整段模拟输出完全一致。
   - **冲锋与碰撞**：冲锋在起手结束锁定方向并开始活跃扫掠，触碰玩家结算伤害并施加受控；穿怪不免伤，不以玩家身体当硬墙；扫掠遇到地图边界停止位移；施法者被受控或死亡立即打断冲锋。
   - **四档难度与协同**：
     - 侧翼怪（flanker）上限严格符合 `normal: 0, adventure: 1, warrior: 1, king: 2`；
     - 远程后撤（retreater）上限严格符合 `normal: 0, adventure: 0, warrior: 1, king: 1`；
     - 重型攻击许可（specialCap）上限严格符合 `normal: 1, adventure: 1, warrior: 2, king: 2`；排队等待期间不预扣冷却时间；
     - 混合遭遇（近战+远程+冲锋）同场对抗下，任意分段切片与整段完全保真。
   - **严格数据校验**：
     - `MonsterRuntime.tactics`严格校验为对象，严密拒绝`false`, `0`, `""`, `null`等非对象值；
     - `ProjectileEffect`各项属性、坐标与有理数伤害严格模式校验。

## 实际执行证据

本机环境：Node **24.22.1**，TypeScript **5.8.2**，全过程离线无下载。

- 实施worktree专项测试：`shared/test/monster-tactics.test.mjs` **8/8 通过**；
- 继承测试：`shared/test/monster-joint.test.mjs` **12/12 通过**；
- 集成目录全量门禁：`node tools/check-all.cjs` **7/7 全部通过**（tooling 7项、shared 182项、backend 573项全数通过），日志已归档至 [st12-02-merged-check-all.log](st12-02-merged-check-all.log)；
- backend 与 client 模型 TypeScript 类型检查通过（0 error）；
- `git diff --check` 通过。

结论：**ST12-02满足规格与工程约束，已独立核验通过并合入主开发分支`feat-1.0.0`**。
