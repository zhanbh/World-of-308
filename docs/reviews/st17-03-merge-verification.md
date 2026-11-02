# ST17-03 独立合入核验

2026-11-02。固定源码 `4b7191357519021a7b7862aae07b1e558069e2c5`，基线 `def983ee550b61d3c92397b8fd7748dcb1a79c7c`。独立merger只读审核实现，不操作生产代码或Git；结论 **READY，可合入ST17-03**，不是全ST17或发布验收。

## 范围与检查

已读取AGENTS、source-of-truth、冻结ST17规格/03票、当前单修合同/03全修增量、实现报告与生产差异。按AC17-4/5/6审核：服务器依固定wear7选择完整当前穿戴集合并包含满耐久项；背包/金库及其余6槽不修。报价同时绑定目标模式、全实例版本、角色/钱包/上下文/配置；空/全满合法0费，不改资产版本。余额差1、后序坏件/缺价/版本溢出不得产生前缀资产提交；实际全部安全递增/属性/文档预算在asset set之前。

确认沿02授权/TTL/原O/J且不另建修理体系；原结果先于当前资格/报价，single/all同名空间和持久pending保持；确认刷新最低版本与close/rebind代次守卫仍在。钱包/角色/账号各一次修订，statsVersion仅实际属性变化推进，评分/达到时间/equipmentVersion和ranking不写。shared DTO明确single/all互斥、集合/版本一致和0费全修空集，旧single形状兼容。

## 独立实际执行

- `node --experimental-strip-types --test backend/test/all-worn-repair.test.mjs`：exit0，**14/14**，约277ms。含12实际写点回滚、后序业务拒绝无资产前缀、真实单修/穿脱/非目标出售与全修OCC各双序、成功丢响应/持久原ID、notFound迟写、close/rebind/旧版本刷新，以及协议集合反例。
- `node tools/check-all.cjs --typescript /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript --type-project backend/tsconfig.json`：exit0/PASS。
- 同命令选定 `tools/tsconfig.models.json`：exit0/PASS。这两项是选定类型项目，不是全七阶段。
- 独立实际重测普通all view R19/W0/19调用/5445B响应，7件事务R21/W12/33调用/14448B、maxDoc3002B；长ID/16词条真实view75909B，真实7件写97623B/maxDoc12858B；codec-only最大标量/32属性89203B明确非自然/生产历史。与报告一致。仅新all view有界128KiB，旧single仍解析后64KiB，不扩大其他query或旧终局预算。
- 固定HEAD匹配，基线祖先检查exit0，冻结spec/5票完整SHA **6/6匹配**，工作树干净。

未发现本片其余可行动合入阻塞。未重复实现者112/184整套回归、全七阶段、Creator、CP压力、SDK/设备/正式价格验证；这些证据与缺口分列，不以本片READY替代04面板/05全故事门禁。报告由独立merger产生，根会话负责FF与执行状态；未push、Jira、安装或外部发布。
