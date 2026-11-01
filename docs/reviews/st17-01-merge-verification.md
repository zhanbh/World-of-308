# ST17-01 独立合入核验（初次）

2026-11-01。独立 merger 审核 `b1dec5e0fa95739d174b84da8e2591203c89ebb5`，基点 `fbfbc72d2f4a7305abff10991e52314c5a63238c`。结论：**NOT READY，暂缓合入**。仅核验用户授权的01，不将02–05未实施列为缺陷。

## 已独立通过

- 基点是HEAD祖先；工作树干净。冻结spec和全部5票完整文件SHA与plan-accepted-check.json一致。
- 实际执行 `node --experimental-strip-types --test backend/test/room-death-wear.test.mjs`：exit0，11/11，约1.37秒。
- 实际执行check-all选定 `backend/tsconfig.json` 与 `tools/tsconfig.models.json`：分别PASS，exit0。不是完整七阶段检查。
- 检查diff、耐久及评分合同、相关源码和测试：固定1/5本地策略与H绑定；普通清房和死亡独立触发，7槽磨损、6槽不磨损；0属性/套装过滤，必要statsVersion/CP同步，评分事实不写；已释放快照及死亡尾效保留。
- 新测试实际运行到16个set写调用逐点失败并全快照回滚，原O丢响应查询/重放及真实双提交OCC仅一次扣损；独立采样R24/W16/41调用、写24831 UTF-8字节、最大文档4797B，与实现报告一致。真实Movement清房→出门→prepare/activate/ready→下一房0武器普攻/十字斩通过。

## 合入阻塞：普通清房后恢复不能重新移动

`backend/src/challenge/challenge-service.ts` 的scene.ready（588–595）仍只对active房间或completed+cleared+looting重建anchor/acceptingInputs/lastReadyReceipt。新开放的active+cleared普通房清场，suspend→resumePrepare→ready虽全部committed且connected，CP却保留 `acceptingInputs:false` 与 `anchorWallAt:null`，因此不能继续走出口。`client/assets/scripts/net/RecoveryProof.ts:8` 的完整恢复证明同样排除了active+cleared，ready最终证明处理也须一致收口。

独立反例在临时文件 `/tmp/st17-01-independent-recovery-repro.mjs` 复用本票真实fixture，在真实clear后依次提交上述三个控制命令；只运行新增反例：

```bash
node --experimental-strip-types --test --test-name-pattern='independent reproduction' /tmp/st17-01-independent-recovery-repro.mjs
```

实际exit1，输出 `phase:'cleared', result:'active', acceptingInputs:false, anchor:null`，断言acceptingInputs应为true失败。未改生产源码或Git。此缺陷影响AC17-1/2既有恢复与继续当前挑战接缝；建议最小统一资格判断，并新增真实普通清房→完整恢复→继续移动/出门、无二次磨损及原截止不续期回归。修复后按新SHA另附独立复核，保留本次初始发现。

## 边界

未重复75项长回归、全七阶段、Creator或8CP压力循环；SDK/设备/正式内容发布域未验证。02–05修理、UI和全故事评审不属于本片合入范围。根会话负责后续FF和execution，本文不代表已合入或已推送。
