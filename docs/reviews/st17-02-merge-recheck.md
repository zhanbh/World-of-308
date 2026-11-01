# ST17-02 独立最终合入复核

2026-11-02。独立复核者：新建final-recheck子Agent，未参与实现或根会话修复。固定源码 `0ea7f0fafda90cee844d9e69bb94d90b6f5806f6`，集成基线 `4bbe1840cae9e221d90feceeca8a2aa7f2e9d527`。结论：**READY，可合入ST17-02**；本报告不是全ST17、真机或发布完成。

## 原阻塞及修复核验

旧merger在e21afe0发现新repair-open忽略角色expected，旧意图可覆盖新服务指针；原NOT READY结论及子任务额度中断已由根会话在02验证附录归档。本次独立检查e21afe0到固定HEAD的修复：可信身份/会话及原O查询仍在前，原tuple成功回放不重新读当前位置或改issuedAt；新意图必须恰好携带当前角色expected，缺失/错误对象拒绝INVALID_ARGUMENT，旧版本拒绝VERSION_CONFLICT。改变expected复用原ID仍OPERATION_MISMATCH。

真实两序OCC用例证明旧repair-open与新shop服务竞争：旧repair先提交后新服务正常替代；新服务先提交时旧repair重试受角色版本阻断，最终current指针保留新服务。正常夹具使用实际当前角色版本，原回放保存精确命令，未用empty expected掩盖校验。

## 独立实际执行

- `node --experimental-strip-types --test backend/test/single-repair.test.mjs`：exit0，**21/21**（约228ms）。覆盖实际单修/原O/报价失效、6个修理写点和5个open写点回滚、真实穿脱/出售两序、迟写notFound、原open关闭/移动/重放及新增expected竞争。临时执行日志保存于 `/tmp/st17-02-final-independent-tests.log`，不将实现者或根会话的106/168套件算成本次独立重跑。
- `node tools/check-all.cjs --typescript /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript --type-project backend/tsconfig.json`：exit0、PASS。
- 同命令选定 `tools/tsconfig.models.json`：exit0、PASS。仅选定类型项目，不是全七阶段。
- SHA检查：冻结spec及全部5票完整文件SHA256与plan-accepted-check.json **6/6匹配**。固定HEAD精确匹配，4bbe184祖先检查exit0，源工作树干净。

静态复查单修服务、真实传输协调器、修理open授权/当前context/位置/TTL、原O优先、价格重算/完整目标版本、限定穿戴或本人背包、满耐久零收费、差额J/原子资产提交及评分事实保留；未发现其余可行动合入问题。读取对应source-of-truth、单件修理合同、冻结spec/02票及02实现证据。

候选价只作local-test、allWorn未实现；Cocos面板、全故事联合/两轴最终评审、SDK/真实网络设备/正式发布域仍归03–05及后续平台门禁。本次未重复168相关回归、全7、Creator、最大容量或设备，不推送、不修改代码/Git。根会话负责FF、执行记录和清理。
