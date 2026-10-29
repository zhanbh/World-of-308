# ST15-05 合并核验

2026-10-29。checks-only 独立核验完成，root 已确认并执行 fast-forward：`main` 从 `b064c8d3f2f8f97945174db0225bd000ecafce89` 前进至 `0639c097fd8f2da0465ace41e16a06ee127d1dd7`。合并执行者为 root；本核验者未执行 Git 修改。合并后重新读取根目录 HEAD，确认实际提交为上述完整 SHA。

独立检查确认基点为目标提交祖先，差异限于 13 个显式文件。源 worktree 的 tracked 文件保持干净，唯一未跟踪例外是 root 所有的 `docs/reviews/st15-05-check-all.log`。冻结 spec 与五个 issue 的完整字节 SHA 均符合 `plan-validation-2026-10-29.json`，并与根目录对应文件相同；spec/05 正文 SHA 另行重算匹配。历史 declared revision 本来错误，本次不声明其匹配，也未改写冻结正文。体力语义沿用户独立裁决：completed/looting 仍 unsettled，回城才 settled。

独立核验者在固定源提交使用已有 Cocos TypeScript 路径执行：

```bash
WORLD308_TYPESCRIPT=/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript node --test backend/test/joint-terminal-acceptance.test.mjs
```

实际结果 exit 0，5/5 通过，0 失败、0 cancelled，总计 207085.646ms。包括 34 个实际 set 故障点（含重复角色写）、正常/到期域、真实 DropCoordinator/TerminalCoordinator/MailService 消费、六节点领取与原结果重放、来源 stub、防半通关的两种 OCC 提交顺序。曾收到停止重复穷举的指示，但读取会话时该完整套件已经正常完成；不存在把中断结果记作通过的情况。随后按指示以 `--test-name-pattern='real pending|terminal submit versus leave'` 单独执行消费者/OCC，实际 2/2 通过，exit 0，6449.987ms。

正常 8 CP 块域独立测得提交唯一 R42/W33，44 get / 34 set，共 78 次应用 Store 调用，最终写集 327198B。另有只读基线 31 次 get，不能把整个请求称为 78 次。最大到期压力域历史 R42/W525、570 调用、3763879B 仍未通过预算；当前测试确认 CONFIG_NOT_READY 且全 Store 不变。拒绝保护通过不等于合法最大域可以完成，发布继续 **BLOCKED**。

root 在相同固定源码上执行获批的全量七阶段检查；本核验者读取其 [日志](st15-05-check-all.log)，确认 `SUMMARY: 7/7 checks passed.`。该全量执行者是 root，本核验者未重复执行全量。`git diff --check` 仅报告保存的原始 preflight 日志第 18/20 行尾随空白，不影响源码或测试。

结论：固定提交具备本次合并资格，root FF 已落地；这不代表 ST15-05 全部验收完成、最大预算通过或最终 Spec/Standards review 通过。另一评审发现的较早 slice 玩家死亡后尾伤杀 Boss 的既有集成问题仍需独立修复与验证，不由本合并记录宣布关闭。SDK、真实数据库/费用、Cocos 构建与设备验收仍为 GAP。未操作 Jira、push、安装、云资源或 GUI；根目录 execution.json 的 root 修改未被覆盖。
