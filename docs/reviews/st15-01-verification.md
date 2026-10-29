# ST15-01 本地实施验证

2026-10-29。范围仅 ticket:warrior-loop-st15-01；尚待独立merger复核。未创建Jira，未安装SDK/依赖、操作云、启动浏览器、部署或推送。

## 已交付

真实Movement输入 + 普攻击杀 -> 同笔写固定room来源 -> drop.list公开描述与H/C/B版本 -> drop.collect材料合堆或装备延迟物化 -> 角色适用套装持有 + 完整参与数量谱系J + 稳定O。未开启显式local-test-drops授权时原no-rewards训练仍不产资产。DropCoordinator持久化原指令，丢响应后operation.get恢复，不改ID或乐观发奖。

当前专用合同见[ground-drop-collect-contract-v1.md](../backend/ground-drop-collect-contract-v1.md)，字段/API/状态及source-of-truth已同步。后续02/03按[终局接点](../stories/warrior-loop/st15/terminal-integration-notes.md)收口，01未提前实现Boss免费复活、即时金币/经验、升级邮件或通关装备direct/pending。

## 来源核验

Accepted spec/ticket正文未修改。旧frontmatter重复的3be6725f...并不匹配真实字节，不能声称原hash已通过。旁置[实际计划校验](../stories/warrior-loop/st15/plan-validation-2026-10-29.json)固定spec body `e574471d617afba569e6d46612e0e03a435a1e26722cc70acaffbd618f137993`、01 body `227b1bebd14690b3c714c7952f969562975d58a13511f4b703c78bde3e32b78b`；沿实际冻结内容实施，不重写历史证据。

## 红绿与真实边界

- 首红：公开drop.list没有入口而INVALID_ENUM；新增严格查询与真实死亡同笔room生成后绿。
- 第二纵切红：drop.collect不支持；补完整真实MemoryStore事务交付后绿。
- 装备纵切红：来源缺roomId被现有装备DTO拒绝；补roomDrop{roomId,dropId}后绿。
- 完整性红：伪sourceId可从篡改room描述发奖；加已确认roomNo+spawnId与确定sourceKey/dropId检查后绿。
- 客户端红：DropCoordinator不存在；补真实服务JSON传输/持久化/原操作恢复后绿。
- 扩展验证：满20格仍允许同模板同绑定未满堆合并；无空间BAG_FULL保留地面；异参/原拒绝稳定回执；服务端CP距离而非positionHint；材料5个写点及套装7个写点逐点失败全回滚；同源双意图并发只提交一笔；collect与leave通过真实MemoryStore快照屏障在两种提交顺序均发生冲突重试；先入包后离场不撤回；次房prepare禁旧地面；会话/房间token/场景错误拒绝；异步CP读取期间lease过期不发布资产；固定payload/配置hash禁止改奖。

纵切使用实际技能与已确认移动，不以伪死亡handler制造drops；边界用例仅在真实击杀后迁移合法CP或破坏来源以验证拒绝，未冒充真实SDK。

## 实际命令与结果

工具：已有Node24.22.1，已有TypeScript5.8.2（Creator3.8.8目录）。首次默认沙箱运行check-all遇spawn EPERM，不能作为通过；后经批准执行本地子进程检查。

```powershell
$env:WORLD308_TYPESCRIPT='C:/ProgramData/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript'
& 'C:/Users/bohan.zhan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' tools/check-all.cjs
& 'C:/Users/bohan.zhan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test --test-isolation=none backend/test/drop-collect.test.mjs
& 'C:/Users/bohan.zhan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' backend/tools/demo-drop-collect.mjs
```

当前全量日志[st15-01-check-all.log](st15-01-check-all.log)：**7/7**；tooling7/shared227/backend656（基线639 + 新专项17），既有客户端纯模型/UI回归及严格类型检查通过。专项17/17。演示实际输出：真实移动普攻击杀生成5条地面来源；lost response=unknown；original receipt recovered=ready/collected=true。不打印账号私有主体/随机流。Node对Creator客户端package未声明type给出MODULE_TYPELESS_PACKAGE_JSON警告；不为消除测试警告修改游戏package。

## 实际预算与边界

材料collect（2块CP）唯一R12/W5，实际get14/set5；实测本夹具最大写3557B。重复读取包括CP头校验和发布前H租约校验，不隐藏为SDK免费。装备另实例R1/W1，角色适用套装另持有R1/W1，套装每7个写点实际故障验证。CP n块时R10+n，再按实例和汇总增加；get=R+2；W5/6/7；原回执R4/W0；drop.list R6/W0。这些是当前单项路径，绝不替代终局R44/W33或真实云事务调用/费用证明。

运行守卫：bag256KiB、room128KiB、item16KiB、holdings16KiB、J128KiB、O16KiB。固定候选量/词条继承现有有界DTO；current普通kill最多8敌，来源列表允许上界16。最大合法终局、满100格极限联合字节、复杂所有效果CP并行完整集合留05联合验收，不以当前3.6KB夹具宣称全局最坏通过。

## GAP

独立规格/标准merger审查仍待执行；本票仅本地实现候选。正式掉率/幸运与缺件奖励策略、Boss终局/金币经验/升级邮件/奖励路由（02/03）、Cocos图标光柱/胜利HUD（04）、全联合预算（05）不在01已完成声明中。微信SDK、真实数据库、网络/设备性能及Note20 Ultra手机手感仍无证据。变更已在专用分支，不自行合入根或发布。
