# ST17-01 独立合入复核

2026-11-01。核验固定源码 `13a8b6bf4935ce93ec4341b04d8f12d6630c479d`，基点 `fbfbc72d2f4a7305abff10991e52314c5a63238c`，对初次交付 `b1dec5e0fa95739d174b84da8e2591203c89ebb5` 的恢复接缝修复做定向复核。结论：**READY，可合入ST17-01**。本结论不是全ST17完成或发布许可。

[初次NOT READY报告](st17-01-merge-verification.md)保留。此次独立审核了追加实现报告、源差异和新真实纵切：服务端统一合法inputPhase，scene.ready重建普通active+cleared的锚点/输入资格/原ready回执，recoveryPage的原ready证明授权同步；客户端RecoveryCoordinator当前证明分支与RecoveryProof接受这一合法组合。未新增恢复机制或协议，加载/恢复/关闭的现有拒绝及死亡空尾、completed移动限制保持。

## 独立执行证据

- `node --experimental-strip-types --test backend/test/room-death-wear.test.mjs`：exit0，**12/12**，约1.34秒。新真实clear→完整既有owner恢复→移动出口→下一房→0武器普攻/十字斩用例通过；断言原恢复票截止11600不变、acceptedSeq/Tick不变、timeline+1、ready锚点3000、cleared inputGapBaseAt=null、7槽实例版本不二次推进。
- `node tools/check-all.cjs --typescript /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript --type-project backend/tsconfig.json`：PASS。
- 同命令选定 `tools/tsconfig.models.json`：PASS。两项为选定类型项目，最终命令exit0，不称全七阶段。
- 冻结spec和全部5票完整SHA重新与plan-accepted-check.json逐一匹配。基点祖先检查exit0，工作树干净，HEAD为上述固定源码。
- 同次12项还独立重跑了普通16写点全回滚、丢响应原O、真实双提交OCC、原释放快照/死亡尾通关及新挑战破损入口等用例。实测普通样本R24/W16/41调用、24831写UTF-8字节、4797B最大文档，与初次样本一致。

初次阻塞已由真实完整恢复纵切覆盖并通过，本片未发现其余可行动合入问题。实现者的33项定向和历史75项回归日志作为其执行证据读取，本复核没有重复它们。没有执行Creator、全七阶段、8CP压力、SDK或设备测试。修理/面板/全故事联合验收仍属02–05，当前用户只授权01。

根会话负责FF、执行记录与本地提交；此报告本身不操作Git或推送。
