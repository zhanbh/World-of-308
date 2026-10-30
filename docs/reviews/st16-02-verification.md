# ST16-02 未知请求与迟包验证（2026-10-30）

来源：已接受 ST16-02、ST16 spec AC16-1/7；未修改冻结规格、任务、批准清单。沿已批准真实服务/MemoryStore/授权传输与公开模型边界实施。无 Jira、安装、云、浏览器或 push。

CombatRecoveryCoordinator 在 suspend/resumePrepare 前统一 freeze Movement 和显式注册的 Drop/Terminal，保留原持久意图并关闭新业务写。各参与者 resolvePendingOriginal 首轮仅通过相同授权 send 的 operation.get 查询，返回 settled/notFound/unknown；notFound 不重发且保留意图。服务恢复栅栏提交后，原查询或原封不动旧意图取得最终 OCC 结果，才清持久记录。原结果确认不调用 Movement connected refresh，不把旧回执灌入新读模型。ready 前仍核对全部参与者，重建成功后读取当前 Drop/Terminal 视图。

恢复前原查询失败时，展示 unknown/PENDING_ORIGINAL_RESULT；每次显式 retry 只执行有界一轮，不循环轮询。待执行控制 DTO 在本地独立 journal 持久保存，重开继续原控制；控制已经进入 Recovery journal 的崩溃交接窗口优先恢复该原控制，不创建新 tuple。init/close/freeze 均使旧异步代次失效；跨角色/场景/挑战的旧回调不能清新 pending 或覆盖视图。没有离线补报、补奖或预测资产写。

## TDD 与实际覆盖

- 真实装备 collect 已提交丢响应：新增测试先因 freeze 缺失失败，再查询原 O 通过；只调用一次 collect，背包仅一件 unknown-boots，location=container。
- 未知 simulation 到 suspend：先因 hasPending 仍为 true 失败，再独立原结果确认通过；恢复不依赖 connected Movement refresh。
- 真实终局装备+leave 丢响应：先因 Terminal.freeze 缺失失败，再原 leave 确认通过；终局回执保持同一事实，装备不重复。
- 原查询网络失败：先复现 NO_PENDING_RECOVERY_CONTROL，再新增待栅栏控制 journal；重建 owner 后原查询成功才发送一次原 suspend。每次调用次数有界。
- notFound 后旧装备 collect 与恢复两序：MemoryStore.beforeCommit 控制真实快照事务提交顺序，均断言 conflicts>0。旧 collect 先提交：恢复保留一件装备与 collected=true；恢复先提交：旧 collect 原子拒绝、零装备、collected=false。没有 mock 身份、资产、CP 或消费者。
- Movement/Drop/Terminal 的原结果查询挂起后 close 或重新绑定角色代次/场景代次/挑战，再释放旧回调：旧结果返回 unknown，视图完全不变；关闭保留旧持久 pending。
- owner 注册真实 Drop：事件顺序严格 operation.get → scene.suspend，未知装备只物化一次，统一冻结阻新 collect。

专项 13/13，见 st16-02-unknown-tests.log。此前六文件相关回归44/44（其中当时新增12项），见 st16-02-related-tests.log；models/backend 两 tsc exit0，见 st16-02-types.log。合流后另录最终数量与类型复验。本片未跑全7阶段/62写点；按用户边界留05，不实现04生命周期，也不宣称设备、云SDK或独立评审通过。

## 接口、预算与边界

零新后端 DTO、物理键、事务写或资产逻辑；公开 CP/结果分页字节上界不变。新增本地有界控制 journal；每个 pending 参与者栅栏前后各最多一轮 operation.get，fenced+notFound 最多重送一次原 DTO，由既有版本/场景栅栏决定结果。未发现 pending 时零额外 operation.get。Drop/Terminal 必须作为 constructor 第五参数注册；Cocos接线属于04，02不声称现有 UI 已统一注册。
