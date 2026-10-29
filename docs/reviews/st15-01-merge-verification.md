# ST15-01 独立合入核验

2026-10-29。独立 merger；固定基点 `dbb2839`，实施提交 `b0a6046`，`git diff dbb2839...b0a6046`。已确认包含集成最新基点，实施 HEAD 干净后核验；随后 `feat-1.0.0` 以 `--ff-only` 合入。仅 01，本文件不把 02～05 标为已完成。

## Spec

对照只读 spec、01 ticket、source-of-truth 与地面拾取合同检查：真实 simulation.submit 的普攻击杀生成固定来源；collect 以已确认 CP 距离授权；材料整源合堆和装备延迟物化；来源、背包、实例、适用角色持有、J/O/A 栅栏同笔；关闭/切房失效及已提交原回执保持。源码、夹具、17 项专项与预算观测相符，无阻塞发现。

独立变体通过：精确 32000 milli-pixel 可拾取，32001 拒绝；满20格、两个匹配19/20堆而来源3，总余量不足时全回滚、地面不扣除。独立校验 plan-validation 固定的 spec 与全部五票 full-file SHA256 均匹配。旧 frontmatter 重复 revision 仍是已旁置说明的历史声明错误，不能据此声称原 hash 匹配。

## Standards

遵守根 AGENTS：本地文档、无 Jira/安装/云/外部发布；字段/API/状态/预算与新增合同联动。新掉落纯规划与现有服务事务边界明确，未使用成功假 handler。未发现文档硬约束违反。`collectDrop` 较密集是可维护性判断项，当前没有据此要求范围外重构；不把工具已执行的类型/语法检查重复列作人工发现。

## 独立执行与集成

已有 Node24.22.1 / Creator TypeScript5.8.2。初次默认沙箱 check-all 因 spawn EPERM 失败，不当通过证据；允许本地子进程后重新执行，日志 [merger-check-all](st15-01-merger-check-all.log) 为 7/7，tooling7/shared227/backend656，含实际严格类型检查。ff 后根目录专项再次17/17，见[集成专项](st15-01-merged-specialized.log)。`git diff --check dbb2839 b0a6046` 通过。

预算观测对应当前代码：2块 CP 材料 R12/W5，实际 get14/set5；装备实例额外R1/W1，适用套装持有再R1/W1。读写点与来源固定及每写点故障测试已复核；不宣称当前小夹具替代终局R44/W33或满100格最坏字节联合验证。

## 保留边界

仅显式 local-test-drops 资产授权，不是正式掉率发布。Boss终局、即时金币经验、跨级邮件、通关装备路由、Cocos掉落/胜利HUD、全局联合预算仍由02～05接续。微信SDK/真实数据库/手机性能手感待验；客户端 MODULE_TYPELESS_PACKAGE_JSON 警告保留，未为测试改 Creator package。未推送、未删除工作树。
