# 本工程任务追踪约定

依据根目录 `AGENTS.md`，本工程只使用仓库Markdown/JSON，不创建或同步任何Jira单据，不要求Jira key、SP或外部排期。

- 业务故事：`docs/stories/warrior-loop/`，稳定ST编号；技术前置E01/E02、联合验收VT01独立标识。
- 实施功能包：在已选故事目录下创建功能子目录，包含派生的 `spec.md`、任务图 `README.md` 与 `issues/NN-topic.md`。当前E01包为 `docs/stories/warrior-loop/e01/`。
- spec frontmatter包含稳定artifact_id、正文spec_hash及本地stories slug；hash只计算frontmatter之后的UTF-8正文，不含frontmatter。
- ticket使用 `artifact_kind: implementation-ticket`、稳定artifact_id/revision、derived_from源hash/path、implements本地slug与数字blocked_by。编号不重用，正文阻塞项与机器字段一致。
- 发布为draft；用户确认粒度/依赖记录为plan_approval，不将计划批准伪装实施验收。实际实施、测试、独立评审与完成状态分别附证据。
- 开工前本地计划检查必须覆盖源hash、story覆盖、ID唯一、依赖存在/无环及验收内容；不因技能默认Jira工具缺失而联网安装或阻塞本地检查。没有运行外部gate不得声称其通过。
- 既定图发生任务合并/拆分或硬依赖变化时重新展示差异并确认；文字勘误不自动重编号或重建故事。

从 `docs/backend/source-of-truth.md` 获取玩法和工程合同；任务只派生工作范围，不反写或偷偷放宽源规格。
