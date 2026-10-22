# ST03 独立规格轴评审

2026-10-22。依据 soflow:code-review 的 Spec 轴；核对批准规格 `spec:warrior-loop-st03`（SHA-256 `39a83e30c018ff059b4736028ca491b91fc02e068b3e72113d29bdbe80f495dd`），以及 `docs/backend/source-of-truth.md` 索引的 `town-authority-and-batch-delivery-v1.md`、`data-dictionary-v2.md` 与 `asset-v2.ts`。

## 规格符合性核对

1. **角色选择与代次控制 (`character.select`)**：
   - 校验角色归属当前账号，跨账号或不存在角色拒绝返回 `NOT_FOUND_OR_FORBIDDEN`；
   - 每次成功选择角色，该角色的 `rolePlayEpoch` 单调递增（+1），旧生命周期的请求被拦截判定失效（`VERSION_CONFLICT`）；
   - 上线落点默认隔离于专属旅店 `inn{characterId}`，设置账号当前活跃角色指针 `selectedCharacterId`。
2. **出旅店转换与城镇移动权威 (`scene.exitInn`, `town.move`)**：
   - 出旅店落点严格校验固定出口锚点 `town{mapId, 'inn-door'}`，初始化 `characters.townState`（≤4KiB）；
   - 城镇移动只收有序输入片段（最大1秒/32条指令），按 seq 连续推进；
   - 速度上限（160 px/s）与地图边界检查，阻断超速与瞬移，拒绝客户端自报坐标。
3. **服务地点授权 (`service.open`, `service.close`, `service.get`)**：
   - 服务锚点物理欧氏距离平方校验：距离平方 ≤ 24²（576）源像素才允许签发 `ServiceContext`；
   - 距离超出返回 `LOCATION_NOT_ALLOWED`，未配置锚点返回 `CONFIG_NOT_READY`；
   - 角色移动离开服务半径或主动关闭面板时，上下文即刻失效。
4. **私有读模型与字段裁剪 (`inventory.get`, `mail.list`, `delivery.summary`)**：
   - 背包随时在城镇/旅店可查；
   - 个人金库查询必须持有效银行上下文且距离在24px内，越权或上下文失效拒绝；
   - 完整邮件列表查询必须持有效邮箱上下文且在24px内；
   - HUD 摘要仅返回未读数等轻量元数据，禁止借远程预取泄露全量金库与邮件附件。
5. **客户端城镇协调器 (`TownCoordinator`)**：
   - 驱动场景转换与位置预测同步；
   - 玩家移动前主动闭合打开中的服务面板，杜绝并发消费；
   - 代次升级与重置后阻断旧回调覆写。

## 结论

- 阻断性发现：0。
- 业务规格覆盖完整，10 项 ST03 专项测试 100% 通过（全量 140 项通过）。
- Cocos 城镇地图场景渲染与触摸操作列入 platform-gap。
