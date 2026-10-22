# E01 独立规格轴评审（首次快照）

2026-10-22。评审者：独立规格轴 Agent `/root/review_spec`。基线 `ab195410928f3f887f928d87e56d5d4ad61f71e5`，分支 `feat/e01-repeatable-checks`；实现位于未提交工作区，**不在该 HEAD 中**。执行 `git diff <基线> --stat` 识别4个已跟踪改动，另实际读取新增源码；不以空的提交区间diff冒充实现已提交。此处保留发现时状态，修复后应另记复核。

## Spec

1. **[P1] 原结果未关联被查询的操作ID。** `shared/src/protocol/asset-v2.ts:225` 仅检查外层requestId。最小反例：operation.get查询A，响应同requestId但found.result.operationId=B，decodeAssetResponse仍返回B。会把另一意图的结果用于结束A的未知状态。违反API§1“结果未知先查原ID”及R13“本账号原意图结果”。应比对嵌套回执ID并增加负测。

2. **[P1] 控制响应可串入另一挑战。** `shared/src/protocol/scene-wire.ts:47` 只关联command/controlSeq。已实际复现scene.ready请求challengeId=A，响应同controlSeq但committed.data.state.challengeId=B时仍通过。违反04“调用方可完整验证……恢复公开消息”及恢复合同绑定当前场景的要求。至少关联challengeId；ready、恢复等各命令还应按其语义核对场景/票据信息，不能把resume合法推进代次一概拒绝。

3. **[P2] 创角/选角缺少可消费的原结果协议。** `shared/src/protocol/session-v2.ts:61` 已支持C02/C03请求，但没有相应响应解析器；`asset-v2.ts:177` 的原结果注册也排除两者。任何character.create/select回执在operation.get均因未支持命令而拒绝。违反05“按API v2覆盖……原operation结果”和API C02/C03/R13。补严格响应与注册即可，无需实现初始化事务。

未发现需扩展为业务服务、完整数值表或真实SDK才能解决的上述问题。规格轴共3项，最高P1；不据此作整包通过声明。

## 实际阅读与运行证据

阅读：源spec、source-of-truth索引、03/04/05票据、API相关条款、批准4A合同；exact-values/public-codec、session-v2、asset-schema/asset-v2、scene-v2/scene-wire、release-v1及工具入口；组合/场景wire测试、资产与release相关测试段。其它测试和fixture文件仅做目录/引用扫描，不声称逐行审阅全部美术或历史业务源码。

用现有Node24.19.0直接导入共享模块的只读反例输出为 `wrong operation accepted: B`、`wrong challenge accepted: B`、`character original receipt: INVALID_UNION`。未修改实现、安装依赖或联网；未宣称运行全套回归。

关键源码SHA-256（首次快照，大小写不影响摘要值）：

| 文件 | SHA-256 |
| --- | --- |
| shared/src/protocol/asset-v2.ts | 68B210B4B8F64BDE605A7FE32CB2EB7D798C1223837A402324224194D7207A6C |
| shared/src/protocol/scene-wire.ts | 6ED9B5BA2924A2C6BF5C41EC750D2949B7461568B571EBD7B64BB424D89E180F |
| shared/src/protocol/session-v2.ts | B077E3B186B8C8D5E83989C6ACBFAECFA6787FDBA4EE8E79D7CDC2785207D9A5 |
| shared/src/protocol/scene-v2.ts | 276E4546868A86E295BCA72A5F36E3FF088A92068EC7DF519EE1577EC095877F |
| shared/src/config/release-v1.ts | AABD749CCD9877F986D28F7767EDCC50A135DF07984FA658546CE1B394D92DED |

## 修复后独立复核

同日对主实现者修复另做只读Node24断言，保留以上首次发现不变。实际结果：

- operation.get(A)携带B的已提交整理回执抛出OPERATION_MISMATCH；同一回执改为A后可正常读取。
- scene.ready(A)携带B状态抛出RESPONSE_MISMATCH；正确A状态、ready正常推进后的checkpointRevision=4（请求为3）仍可读取，未把合法推进误拒绝。
- character.create与character.select各构造一份合法committed原回执，经operation.get(A)成功消费；前者包含初始化引用，后者包含角色游玩代次和旅店锚点。未运行任何创角事务。

输出：`independent fix recheck: operation mismatch rejected; cross-challenge ready rejected; both character receipts accepted; valid controls retained`。这3项发现在下列工作区快照上已闭合，不代表真实微信/资产事务或全部业务验收通过；最终统一回归由主实现者另记录。

| 修复文件 | SHA-256 |
| --- | --- |
| shared/src/protocol/asset-v2.ts | 869328B309915AD64DBDFEB8E2B96C2E4642B13C809F636EB7594822F46C6A06 |
| shared/src/protocol/scene-wire.ts | 15C9F89B137AB87A7454823826072E38150DC07C785B89A81E0150F43457EE36 |
| shared/src/protocol/session-v2.ts | C2993DD04DD6EE84C525FECBC64035B9BBE81C377CD2E61733EE8519B81589FD |

### 最终类型修正快照

主实现者的最终tsc发现CharacterResponse公共头的command推断过宽。独立再读`session-v2.ts:155`，确认其改为显式`ResponseBase & Pick<CharacterResponse, 'command'>`类型注解（替代原对象内的字面量断言），字段值、校验分支及返回行为未改变。最终session源码SHA-256为`A66EFBB247691FC3246397B04332E3A9D381B6BDBA2C9F0685ED779933772E8F`；以上修复反例的运行结论继续适用。未重复全量回归，最终7/7组、共享107项等机器结果由主实现者的联合验收记录提供，不将其伪称为本评审者独立执行。
