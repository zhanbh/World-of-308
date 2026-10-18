# 在线命令与查询契约 v1

> 2026-10-19：新机制已确认，见[基线摘要](../wayfinder/core-rules-v2/SUMMARY.md)和[实现差异](../implementation-gaps-2026-10-19.md)。本文现有本地切片/旧契约尚未全部迁移；测试通过不等于新背包、邮箱、冷却与奖励机制已实现。

状态：实现契约草案，非已部署API。[数据模型](data-model.md)、[事务协议](consistency.md)。首版入口拟为game-api云函数，由传输适配器接收平台已验证身份；不开放允许客户端自报身份的旁路HTTP接口。

## 1. 公共信封

```ts
type CommandRequest<T> = {
  protocolVersion: 1;
  command: string;
  operationId: string;    // 一次意图一个ID；不确定是否提交时沿用
  sessionId: string;
  sessionEpoch: number;
  expected?: { challengeVersion?: number; characterVersion?: number;
               containerVersion?: number; itemVersion?: number };
  payload: T;
};
type CommandResponse<T> = {
  operationId: string;
  serverTime: number;
  replayed: boolean;
  outcome:
    | { status: 'committed'; data: T }
    | { status: 'rejected'; code: string; details?: unknown }
    | { status: 'unknown'; code: 'RESULT_UNKNOWN' };
};
```

身份不在payload内；sessionId不是独立认证凭证，须与平台身份及有效epoch共同校验。禁止通用的saveCharacter/setBalance/updateInventory接口。输入采用白名单结构、长度/数值/批量限制；未知字段和越界值拒绝。对外不暴露原始SDK错误和堆栈。

需要expected版本的命令若缺失返回INVALID_ARGUMENT；并发冲突返回VERSION_CONFLICT，由客户端读新状态后重新表达意图，使用新operationId。传输超时则沿用原ID查询/重试，不能改参数。operations键按账号+operationId确定，摘要覆盖命令、版本、payload、会话；同ID异参返回OPERATION_MISMATCH。

查询结果的serverTime是当前查询时刻；重放操作返回原始业务结果/版本，不伪装成当前资产余额。客户端按版本应用结果，再按需刷新视图。

## 2. 身份与基础资产

| 命令/查询 | 输入要点 | 结果及约束 |
| --- | --- | --- |
| session.open | launchId, operationId；独立于普通命令信封，仍须平台认证 | 当前sessionId/epoch、角色摘要、回城状态；不同launchId表示进程重新启动，关闭旧挑战/场景并接管；同一请求重试不再次递增epoch |
| account.get | 当前session与epoch | 当前角色、钱包、资产版本；不返回其他账号数据 |
| character.create | classId；当前只开放配置支持的职业 | 按职业占位创建角色/初始背包；每职业一个；无纹章或装备的隐式赠送，初始物品由版本化配置明确 |
| character.get | characterId | 已授权角色、成长、穿戴和背包视图 |
| inventory.get | characterId | 容量、槽、堆叠、绑定和装备展示数据 |
| equipment.equip | characterId, itemId, slot；character/container/item版本 | 城镇中检查归属、职业、等级、槽位、绑定；交换旧装备需要容量；整个操作一次成功或一次失败 |
| reward.list | characterId, cursor | 原角色待领列表与版本，有界分页 |
| reward.claim | sourceId；container版本 | 仅原角色领取，满包保留pending，已领取返回原交付，不产生第二件 |
| operation.get | operationId | 本账号持久结果，或notFound；当前会话可查询自己旧会话结果，但不能重放旧会话写操作 |

session.open以可信身份解析账号；外部身份校验先于数据库事务，密钥/微信登录凭证不写幂等响应。相同launchId且当前会话仍有效时返回它；若旧launchId已被接管，返回SESSION_REVOKED，不能靠重新open旧请求夺回会话。新进程生成新launchId，不跨重启保存复用。

## 3. 挑战命令

| 命令 | 必需payload与版本 | 成功结果/主要拒绝 |
| --- | --- | --- |
| challenge.start | characterId, dungeonId, difficultyId；character版本 | 分配challengeId、配置/等级/装备快照；不扣房间体力；已有active或未关闭旧拾取场景则拒绝 |
| challenge.enterRoom | challengeId, roomNo；challenge版本 | 首房或上一房清场后合法下一房；刷新体力、只扣一次、生成manifest/roomToken；失败不扣费 |
| challenge.reportEvents | challengeId, roomToken, firstSeq, events；challenge版本 | 有序、完整接收或全部拒绝；返回acceptedThrough、版本、奖励/升级/复活指令；不接受任意资产增量 |
| challenge.revive | challengeId, deathIndex；challenge版本 | 原子扣一枚纹章、次数+1、alive、满血蓝和保护/控制指令；不可跨死亡序号使用 |
| challenge.leave | challengeId, reason:'abandon'或'finishLoot'；challenge版本 | active变failed或completed保持成功；关闭场景、清掉落、回城满状态 |
| drop.collect | challengeId, roomNo, dropId, sceneEpoch, positionHint；challenge及container版本 | 有效场景、当前房间、合法接近后交付；满包留地，不进待领 |

challenge.get返回结果、生死、死亡截止时间、房间进度、lease状态、paidRevives、允许动作及最新版本；服务端先落实已到期状态。查询不是读取陈旧active再交给客户端决定是否失败。currentSession不同或launch丢失时不能用它续关。

进房的业务键为challengeId+roomNo：不同operationId重复进入同一已支付房间也不得再扣体力。若它已不是当前可进入房间，返回ROOM_NOT_AVAILABLE；业务去重与HTTP请求去重各自成立。

## 4. 战斗事件与顺序

```ts
type BattleEvent =
  | { seq: number; kind: 'playerDied'; deathIndex: number;
      simulationTick: number; lingeringSourceIds: string[] }
  | { seq: number; kind: 'monsterKilled'; spawnId: string;
      simulationTick: number; source: { kind: 'direct'|'dot'|'lingering'; sourceId: string } };
```

roomToken由服务端发放并绑定账号、会话、挑战和房间，不能作为身份替代。simulationTick是客户端顺序提示，不是可回拨的权威时钟，也不允许用它延长10秒截止时间。

每挑战序号递增，客户端单写队列按顺序提交，不同时发送两个改挑战状态的命令。批量大小按事务/字节预算限制，不能在一个批次里推进多个房间。重复seq须匹配已接收内容；首版仅允许最新批次的同摘要重放和操作结果重放，其他旧序号返回EVENT_ALREADY_ACCEPTED并指示查询；不重新执行。缺号返回EVENT_GAP和nextSeq。怪物来源业务键仍独立去重，换seq也不能重杀同一spawnId。

死亡后只允许已声明残留来源导致的monsterKilled，不再接受新直接攻击；最终首领死亡由服务端识别manifest并自动触发终局，不另提供客户端finishVictory接口。首领后同批次的小怪击杀由间接击杀记录覆盖，不再次奖励。若同一模拟步玩家与首领都死，客户端固定先报告playerDied，再报告首领死亡，以得到免费复活分支。

首版只做清单/顺序/来源边界校验，不假装能验证客户端提交的死亡、DOT或位置真实。拾取位置positionHint只做地图边界/接近一致性校验，不能证明真实移动；金币无需客户端collect命令。离开旧房间后旧房间未拾取物不可再领取，服务端用currentRoomNo和sceneEpoch判定，不靠客户端删图。

客户端不得在pending事件未知时先发付费复活：先flush，再按服务端lifeState/deathIndex决定是否显示消费。

## 5. 心跳、后台与恢复

心跳使用独立轻量契约：sessionId/epoch、challengeId、sceneEpoch、heartbeatSeq；每个新心跳只更新lease，不创建无限operations。相同heartbeatSeq重试返回当前租约，不能再次延长。客户端每2秒发送一次（工程初值），收到断网信号/请求失败立即暂停模拟。

- scene.suspend：传递递增controlSeq，服务端首次确认后台时进入recovery并设10秒截止；相同/后续重复suspend不得滚动延期。
- scene.resume：同一launch/会话在有效恢复窗口内校验状态后回到connected；返回原死亡截止时间，不能重置它。只有这个命令能退出显式recovery，普通心跳不能。
- 静默断线：leaseUntil=最后一次成功新心跳的服务端时间+10秒；到期不能用迟到心跳/事件救活场景。
- scene.status：返回权威截止时间与结果，若过期先执行关闭；active失败，completed只关闭拾取。

物理断线瞬间服务端不可观测。上述租约意味着静默断线实际余量为0–10秒，正常2秒心跳时通常8–10秒；不能声称精准从拔网线瞬间另给足10秒。客户端本地最多等待10秒，但以服务器更早截止为准。显式后台通知成功时按该通知的服务端时刻开始10秒；通知丢失则回退租约。所有这些是工程检测方式，不增加离线战斗权限。

## 6. 错误与客户端动作

| 错误码 | 处理 |
| --- | --- |
| AUTH_REQUIRED / SESSION_REVOKED | 停止战斗/资产写；重新认证或展示被接管，不自动循环抢回 |
| INVALID_ARGUMENT / OPERATION_MISMATCH | 修正客户端；异参不能重试旧ID |
| NOT_FOUND_OR_FORBIDDEN | 不区分其他账号对象存在性 |
| VERSION_CONFLICT | 读新状态，新意图新ID；不盲目覆盖 |
| ACTIVE_CHALLENGE_EXISTS / SCENE_STILL_OPEN | 返回本账号有效指针，引导先结束 |
| CONFIG_NOT_READY | 本次开局失败，无体力消耗 |
| STAMINA_NOT_ENOUGH / ROOM_NOT_AVAILABLE | 原状态保留 |
| DEADLINE_EXPIRED / CHALLENGE_TERMINAL / SCENE_CLOSED | 应用权威结果回城或停止战斗，不自行改成功为失败 |
| EMBLEM_NOT_ENOUGH / REVIVE_LIMIT_REACHED / NOT_DEAD | 不消费；刷新允许动作 |
| BAG_FULL | 地面物保留或待领保持pending；整理后以新ID再次表达领取意图 |
| EVENT_GAP / EVENT_ALREADY_ACCEPTED | 对齐nextSeq及权威状态，不丢弃未知提交结果 |
| RATE_LIMITED / SERVICE_UNAVAILABLE | 有界退避，若提交情况未知先查同ID结果；不得离线继续战斗 |
| RESULT_UNKNOWN | 不是失败结论；同ID查结果/重试，不生成新随机或新扣款 |

鉴权失败、格式错误、限流在事务前拒绝，不承诺存operations；进入事务的稳定业务拒绝保存结果。notFound仅表示本次查询未找到，不能证明另一在途请求永远不会提交；重试仍沿用同ID。日志只记录requestId、脱敏账号、命令、业务来源、版本和错误码。
