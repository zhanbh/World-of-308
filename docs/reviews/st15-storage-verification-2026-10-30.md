# ST15-05 结果存储整改验证

2026-10-30。基线8cbbda3，隔离分支fix/st15-terminal-result-storage。沿已批准05任务实施，冻结spec/issues与既有2026-10-29日志/hash不改。无Jira、推送、MR、安装或云操作。

当前实现为[单文档gzip原结果](../backend/combat-result-storage-v2.md)，完整原事件JSON无损压缩，稳定ref、每32事件公开页、原O/全部资产同事务；既有schema1旧页继续查询。中间256页词典包虽使原499页通过，但与8改块组合仍可能W34，因此未交付该方案；first/codec/oracle等未带gzip的本日文件仅保留中间探索证据。

| 真实公开submit夹具 | 在用/改写CP | 逻辑页/事件 | 唯一R/W | get/set/调用 | 最终写集UTF-8 |
| --- | --- | --- | --- | --- | --- |
| 全未来效果 | 8/8 | 1/少量 | 42/33 | 44/34/78 | 326808B |
| 原全部到期 | 8/2 | 499/15964 | 42/27 | 44/28/72 | 494256B |
| 60%到期、40%未来分布六效果块 | 8/8 | 300/9589 | 42/33 | 44/34/78 | 458997B |

三域均真实从active提交为completed，8敌/13槽/7磨损/100格/6节点邮件/pending与双持有保持。提交前只读基线另31get；查询和回放不混入提交调用数。单物理结果文档全部到期452338B、混合273225B。历史原499页W525/570调用/3763879B红灯保持原样。本次为MemoryStore，不是微信SDK实测。

独立结果oracle来自git show 8cbbda3:backend/src/challenge/challenge-service.ts，原源SHA256 b5a9d612d9d4ed9f2fc1ce57a51aea26a163f654d977c2b06d09afd02d5d1109。工具[verify-st15-storage-oracle.mjs](../../tools/verify-st15-storage-oracle.mjs)只在临时旧模块删除结果页预检及提交预算检查两行，以便旧schema1读取全部结果，未改变身份/版本/模拟/随机数/查询。日志记录精确被移除行；finally移除临时模块，不进入运行实现。

新旧公开查询数组逐字段deepEqual，原全部到期15964事件规范JSON SHA256为77db52dae3ba239c23019c65ffcb80a06d905b748c4d5668844bfbd6cdd2e6a6；混合9589事件为71058cfce9be759954268f989784ab7ec5e2a6463f69b2929ffa4b7513972d48。两域均注入提交丢响应，原O重放成功且完整数据库快照不变。[最终oracle日志](st15-storage-gzip-oracle-2026-10-30.log)。正常原O及旧结果页授权未绕过。

有界codec测试覆盖32768事件（1024逻辑页）与最大转义身份、uint64十进制串、有理数、null/布尔/数字/嵌套数组对象完整往返；无精度转换。格式/截断gzip/base64/长度/事件数损坏与实际33MiB解压炸弹均拒绝；流式上限32MiB，并受1MiB最终物理文档限制。公共查询验证schema1旧页与错误账号/操作/ref/损坏压缩数据拒绝。[codec日志](st15-storage-gzip-codec-2026-10-30.log)。该合成codec数据不冒充真实战斗结果。

固定代码 `bf6c5ccf94088187085872fce5e4a87e9d39d83b` 的最终全量门禁已完成：7/7，tooling7/shared230/backend694，Node24.22.1/TypeScript5.8.2；日志为 [最终七阶段](st15-storage-check-all-2026-10-30.log)。全部到期28个实际set与混合34个实际set共62个故障点均整笔回滚通过，包含重复角色写、压缩结果、CP、六邮件、持有与资产/O/J；混合域submit/leave两种OCC顺序通过。原结果丢响应恢复、旧schema1兼容与无损oracle分别沿上列证据，不以重复执行增加覆盖数量。

两轴独立报告绑定同一代码SHA：[Standards](st15-storage-standards-review-2026-10-30.md)、[Spec](st15-storage-spec-review-2026-10-30.md)。Spec为0项发现；Standards唯一P3历史文档顶部状态提示已由根修正，并经原评审者独立复核关闭。两位评审者各自执行codec/storage专项2/2，未独立重跑完整七阶段或长故障循环；不将作者日志代签为独立全量通过。

容量夹具不是自然战斗可达性证明。固定1结果写已消除多包+8改块的W34组合；任意高熵1024页数据不保证压缩至1MiB，正式发布内容包络、运行时压缩支持、查询全解压成本、SDK事务/重试/计费与真机仍需独立验证。保留所有字节/调用保护，越限整笔CONFIG_NOT_READY拒绝，不截断事件、不异步补奖、不宣称ST15整体生产Done。
