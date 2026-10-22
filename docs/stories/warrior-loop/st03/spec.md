---
artifact_kind: specification
artifact_id: spec:warrior-loop-st03
spec_hash: 39a83e30c018ff059b4736028ca491b91fc02e068b3e72113d29bdbe80f495dd
tracker: local-markdown
plan_status: approved
stories:
  - slug: st03-town-authority
    title: 城镇步行、服务地点授权与私有读模型
    covers: [US1, US9, US13, AC12]
---
# ST03：城镇步行、服务地点授权与私有读模型实施规格

2026-10-22。承接ST02本地交付与用户推进意图；本文件为ST03实施任务图待确认稿，不授权SDK安装、云资源或部署。来源为[故事卡](../st03.md)、[城镇地点授权合同](../../../backend/town-authority-and-batch-delivery-v1.md)、[数据字典](../../../backend/data-dictionary-v2.md)及[真相源索引](../../../backend/source-of-truth.md)。

## 玩家可验证结果

合法会话下，玩家进行角色选择与城镇服务交互：
1. 角色选择与代次：提交 `character.select`，校验角色归属并绑定账号 `selectedCharacterId`；单调递增角色 `rolePlayEpoch`；上线默认隔离于旅店 `inn{characterId}`。
2. 城镇位置与移动权威：出旅店落固定城镇锚点 `town{mapId, 'inn-door'}`；城镇移动遵循有序输入校验（最大1秒/32步长、速度上限、地图边界），嵌入维护 `characters.townState`（≤4KiB），拒绝客户端自报坐标。
3. 服务地点授权（ServiceContext）：地图包含银行、邮箱、铁匠铺、商店服务锚点；交互半径≤24源像素；进入范围申请签发绑定角色与地点版本的 `ServiceContext`；玩家移出范围或关闭面板使上下文立即失效。
4. 私有读模型与字段裁剪：银行资产/个人金库查询必须持有效银行上下文；完整邮件列表与领取必须持有效邮箱上下文；HUD仅查询未读摘要提醒，严禁远程预取完整金库或全部邮件。
5. 客户端协调器驱动：纯模型 `TownCoordinator` 驱动移动同步、服务上下文生命周期与私有查询缓存，阻断旧代次迟到回包。

## 本轮范围

- 本地真实MemoryStore事务实现v2角色选择、城镇移动位置更新与服务上下文签发/校验能力。
- 客户端纯模型 `TownCoordinator` 负责输入封包、距离校验与服务面板状态机。
- 不引入外部npm依赖，不修改真实云数据库，不连接真实微信鉴权。

## 公开测试边界

1. CharacterSelect 应用入口：验证角色归属、代次单调递增、旅店隔离与非本账号角色拒绝。
2. 城镇移动与服务授权事务入口：移动步长与速度校验、瞬移拒绝；24像素服务锚点距离判断、超出范围撤销上下文；移动与服务交互并发竞争。
3. 私有读模型入口：越权访问金库/邮件拒绝、上下文失效拦截、HUD精简摘要返回。
4. TownCoordinator+传输端口：移动同步、进入/离开服务半径状态切换、迟到低版本响应隔离。

## 完成与准入

01～06覆盖角色选择代次、城镇移动状态、服务上下文授权、私有读模型、客户端协调器、联合验收与独立评审。任务粒度及硬依赖需人工确认后进入实现；计划批准与独立产物验收分别记录。
