# 原战斗结果物理存储 v2

2026-10-30。此合同只改变存储映射，沿用[大崩与连续战斗合同](earth-combat-contract-v1.md)的完整事件、公开每页32条/最多1024页、稳定actionResultsRef及原O重放。历史结果不得依当前配置重算；eventId、时间、有理数、伤害字符串、顺序和所有可选字段逐项保留。

新combatResults schemaVersion=2每操作一个包，包键仍loginKey('combatResults',[accountId,operationId,0])。字段为id、schemaVersion、accountId、operationId、actionResultsRef、pageIndex（固定0）、totalPages及packed。packed含encoding='gzip-json-v1'、eventCount、decodedBytes及data（完整原事件数组JSON经标准gzip再base64编码）。使用Node24内置CompressionStream/DecompressionStream，不安装库；不把十进制资源串转换成数值、不删除重复事件或eventId、不依现行配置重算历史。

每包最终JSON UTF-8≤1048576B；≤32768事件，原JSON UTF-8≤33554432B（1024×32KiB公开页载荷的保守总上界）。packed字段严格匹配；base64长度/字符/规范往返、格式、事件数与声明解压长度均校验。流式解压每块累计字节，超过声明或32MiB立即cancel拒绝，实际长度须等于声明；UTF-8严格解码、JSON数组长度校验后，所查32行仍经严格parseActionResultsPage逐字段校验且≤32768B。每次查询需完整解压包，不把整个包作为公开响应；该CPU/内存成本及真实云运行时支持仍需平台验证，不设置无界跨账号缓存。

查询先授权账号并读取simulation.submit原O，校验原操作已committed与原ref，再定位包，校验包键、账号、操作、ref、页号/总页数和包字节上界。仅最后公开页可不足32，唯一空页允许0行。schema1结果仍按原每页键读取，不迁移、不重新生成。包和所有CP/资产/O/J仍同一事务；丢响应读取同原O，结果不重抽。结果固定1物理写，包字节仍进入既有终局R44/W33/80调用/1.5MiB强制保护；无法压入上界时整笔拒绝。

实测同499页及60%到期/40%未来、8块全变化混合压力夹具见[2026-10-30验证](../reviews/st15-storage-verification-2026-10-30.md)。夹具来自合成CP容量配置，尚未证明自然可达。固定1结果写消除了多包与8改块的W34反例；任意1024页高熵值组合并不自动保证gzip≤1MiB，完整可发布内容包络仍需正式发布器/SDK验证，不能用压缩比例推导全域通过。
