# E01本地实施任务图

2026-10-22。粒度及依赖已由用户确认；任务交付状态仍draft，不虚称accepted或已完成。

[源规格](spec.md) · [E01故事前置](../enablers.md#e01-协议配置与检查基础)

| 编号 | 任务 | 硬依赖 |
| --- | --- | --- |
| [01](issues/01-repeatable-checks.md) | 检查入口与迁移清单 | 无 |
| [02](issues/02-exact-value-codecs.md) | 精确值与编码校验 | 01 |
| [03](issues/03-session-contracts.md) | 登录与会话协议 | 02 |
| [04](issues/04-simulation-contracts.md) | 输入与恢复协议 | 02 |
| [05](issues/05-asset-contracts.md) | 资产服务协议 | 02 |
| [06](issues/06-release-fixtures.md) | 配置与合法样本 | 02 |
| [07](issues/07-integrate-verify.md) | 联合验收与迁移交接 | 03, 04, 05, 06 |

顺序：01→02→{03,04,05,06}→07。并列表示逻辑上无硬依赖，不自动授权多Agent或worktree；当前可按同一会话顺序实现。03～06共享值/信封时先沿02冻结接口，不互相偷偷mock未定合同。

本地计划检查验证：唯一artifact/编号、源正文hash、implements覆盖E01、依赖存在且无环、正文Blocked by与frontmatter一致、所有任务有可检验AC与证据要求。按AGENTS.md不执行Jira同步/回填或为此安装组件；以本地只读检查完成同等计划约束，不称Jira gate已运行。

状态区分：用户确认了计划图；任务产物未验收；本次只发布本地文档，不改业务代码、安装依赖或操作云资源。

## 实施进度（2026-10-22）

后续已获用户开工授权，01～07已完成本地实现与验证，两轴独立评审发现的4项问题已修复复核。draft表示尚未人工接受/合并；各票据implementation_status记录实际实施情况。当前统一检查7/7组通过，共享107项；不代表正式在线闭环或真机验收。没有安装依赖或操作云资源。

最终入口：[交付与交接](../../../reviews/e01-07-integration-verification-2026-10-22.md)。plan-check.json是开工前的历史计划检查快照，其中implementation_started=false不作为当前实施状态；源spec及其hash保留不改。
