# E01-06 最小测试release与校验接口

2026-10-22。实现对应[任务06](../stories/warrior-loop/e01/issues/06-release-fixtures.md)。权威依据为[配置发布](../backend/configuration-and-migration-v1.md)、[发布基线](../backend/release-and-validation-baseline-v1.md)、[包络](../backend/simulation-content-envelope-v1.md)和[三本内容](warrior-three-dungeon-baseline-v1.md)。

## 公开接口与样本

`shared/src/config/release-v1.ts`提供同步`loadTestRelease(text,authorization)`进行严格结构、profile、引用和合法域检查，异步`verifyTestRelease(text,authorization)`另以WebCrypto核验实际SHA-256摘要，`publicRelease(release)`裁剪公开节点。真正加载经校验的fixture应使用verifyTestRelease；同步入口不宣称完成摘要核验。

authorization由可信调用方另行提供，包含profileId/environmentScope/allowTestStrategies；客户端配置中的testOnly不能授予自己测试策略权限。当前仅注册local-test、warrior-e01-test、e01-contract-v1和test-fill-missing。普通正式配置不能借此接口加载；不部署或激活任何指针。

合法样本位于`shared/fixtures/warrior-first-normal.test.json`。独立非法样本为missing-price、illegal-equipment-level、enabled-hunter三个invalid.json文件；它们具有各自实际内容摘要，但仍因语义非法被拒绝。`build-release-fixtures.cjs`只是显式本地authoring工具，运行时不调用，不动态读取Python或文档补数值。

## 编码与引用

release含schemaVersion/releaseId/manifestHash/profileId/environmentScope/purpose/codeCompatibility/protocolRange/units/provenance/entryDungeonRef/strategy/nodes。版本1只接受协议2，位置/资源精度1000和10ms逻辑步；金额、资源使用u64规范十进制字符串，动作时长配置使用整数微秒，UTC墙钟Time仍使用毫秒，不混用。币种与资产协议统一为gold/points（金币/点券）。

每节点id/version/kind/visibility/data，id最多64字符，release最多256节点、总UTF-8最多256KiB。支持class、skill、map、monster、equipment、reward、price、dungeon。所有实体引用携id+version并校验目标种类；缺失/错版本/错类型/重复id/递归和公开节点指向私有节点均拒绝。当前类型关系本身为有向无环层次，不支持任意脚本或递归召唤。

摘要算法：剔除根manifestHash，对对象键递归字典序、数组保留顺序，以JSON字符串编码标量，UTF-8 SHA-256输出64位小写hex。校验后的对象递归冻结，不能靠修改返回值热换release。摘要校验只证明字节内容对应其摘要，不证明发行者身份或允许生产激活。

装备13槽与现有UI/资产DTO一致：shoulder/chest/belt/pants/boots/trinket/bracelet/necklace/ring/subEquip/magicStone/earring/weapon。只接受五品质、10/15/20/25/30装等，7磨损部位与非磨损的显式null策略分开；普通紫装穿戴绑定、橙装拾取绑定。当前耐久policyRef只接受注册的测试策略或not-applicable-v1，不把未解析字符串当默认策略。装备模板不是已生成实例，不承载当前持有者或随机结果。

## 最小范围和后续责任

样本有战士四技能2/3/1/4节点、关闭猎人、7个同时出怪房间共28怪（1精英/1Boss）、1个随机房间紫名×2经验的策略约束、无障碍地图、可组合怪物分类/技能/身份、白武器、奖励私有权重与维修价格。所有HP/AP/节点/价格和简化遭遇都是明确测试值；不替代完整首本Boss行为、技能成长、1～30成长经济、后两本或最终掉落表。角色升级/技能解锁规则由后续正式内容表实现，此fixture不能充当完整运行产品release。

公开投影不携私有reward/dungeon节点、策略、授权或provenance。返回manifestHash是整份release的绑定引用，公开投影不是同一原文，不能用该hash宣称公开片段本身可独立复算。正式公开资源manifest和发行签名/授权仍由后续发布故事完成。

当前检验技能节点最多4/6、时长/间隔、每房最多8怪、spawn容量、地图点边界及引用闭包，但没有执行碰撞连通性、可达动作取消图证明、最大CP实际编码或收益守恒。测试合法不表示平衡、SDK或真机通过。

## ST01交接时的0基房间纠偏

交叉核对数据字典v2后，修正本模块及全部合法/非法fixture此前误用的1基房间编号。权威值为roomNo0～6，紫名候选roomNo0～5；界面第1～7房仅为显示标签。解析器拒绝1基配置，不在加载时隐式换算。authoring脚本按固定顺序生成0基值并重新计算真实manifestHash；新旧摘要不同，不可将变更后的内容与旧摘要混用。本次纠偏不是早期E01快照已通过的证据，后续回归单独记录。
