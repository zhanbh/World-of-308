# ST18-02 独立合入核验

2026-11-02；独立merger核验固定源码 `099e088291891e28ac768cb0d4af2b1f7d8baa8b`，比较基点 `d33b6b1`，结论 **READY：仅ST18-02本地交付**。

## 独立检查

- 核对AGENTS、当前真相源、已批准ST18 spec/02任务、任务图和批准记录；spec及5项任务全文SHA256共6/6与accepted-check匹配，未修改冻结正文。
- 源码核验：
  - 11/12失败降级至+10并更新强化AP；13–20失败将装备生命周期置为`destroyed`、位置置为`retired{reason:'destroyed', sourceRef:itemId}`，彻底移除角色装备栏或背包引用，保留原`sourceKey`与来源定位审计。
  - 主动使用角色绑定纪念品计入报价材料并原子扣除配置数量，成功与失败均消耗；非本角色绑定、账号绑定或数量不足时直接拒绝，零扣款。
  - 损毁材料与纪念品返还先填充背包已有同模板堆叠（上限20），再占用空格新建堆叠，溢出余量生成单附件30天有效角色邮件，由既有`MailService`统一消费领取；不增设虚假余额。
  - 穿戴装备损毁同笔同步有效战斗属性、装备版本、固有评分与排行榜；适用套装损毁同步将角色scope持有汇总减一；非套装不读写持有表；背包装备损毁不改变穿戴评分。
  - 钱包、背包、装备、记忆、角色、账号写栅栏、邮件、原O/J同事务原子提交；11个物理写点逐点注入故障，MemoryStore整笔回滚无残留。

## 独立实跑

在主干合并源码执行：

```text
node --experimental-strip-types --test backend/test/enhancement-high.test.mjs backend/test/enhancement-low.test.mjs backend/test/single-repair.test.mjs backend/test/equipment-v2.test.mjs
62/62 pass, 0 fail
git diff --check d33b6b1..099e088: exit 0
```

测试包含高段新增8项、低段强化24项、修理21项、装备穿脱9项（合计62项独立抽检）；作者112项关联测试全绿。实测满100格损毁与邮件溢出样本：唯一读取14、写入11、set调用11、事务总调用25、序列化写集28023字节、最大单文档15930字节。

未运行全七阶段、Creator、设备、云或部署；这些沿后续任务与GAP。无阻断发现，代码commit已合入主干；03–05未启动，未push。
