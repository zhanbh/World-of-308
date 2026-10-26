# ST12-01 独立合入核验

2026-10-26。核验者为独立merger，未参与实现。集成`feat-1.0.0`由`08be54e`以`git merge --ff-only feat/st12-01-melee`合入至 **`e99b1b9475c5e556ecc470ee0335059e99c396ec`**；初始实现`dfd002c5f9d8abcd765dc67894efe227fdea028a`，严格runtime修复`e99b1b9`。未推送。此报告后续文档提交不改变已验证代码。

## 来源、范围与实际纵切

按UTF-8正文、CRLF正规为LF、剥离frontmatter独立重算：spec SHA256为`26fc51d20aa68ff91e7cc72c0a9768ece64c0359710e36dd363d02f2577cebd7`；01票据为`62be806566077548f9dc3a78e665dd9cb5fd90dcb5712d2c111ee3fcf9865f11`。均与accepted_revision一致，实施分支未修改accepted正文。

实际diff连接既有ChallengeService真实开房/提交、schema7 CP、profile6显式无奖励配置、公开proof及MovementCoordinator恢复，不是另设假人伤害入口。检查真实MemoryStore写失败、并发及丢响应测试；测试传输实际调用服务，无假成功业务handler。未越界实现02远程/冲锋、03清场、04/05 Boss、06 Cocos联调。

## 发现与关闭

发现1项阻塞：原`validateMonsterRuntime`用`if(m.action)`，会接受false、0、空串，且该校验同时用于私有CP与公开monsterRuntime。独立在初始实现复现三者均被接受，暂缓合入并退回实施者。修复为非null即严格验证；实施者补真实CP/公开恢复负测。merger在修复HEAD复核false、0、空串、undefined、数组、true均拒绝，null仍合法；17项专项通过。该问题已关闭，未修改来源规则或降低断言。

独立额外变体：开局受控至tick3、tick4十字斩、敌起手12tick，逐tick JSON序列化恢复40次，对照整段推进，完整事件序列、怪物runtime、玩家HP/控制、targets、移动及四技能状态全部一致。已有同刻过杀、同刻击退不得撤销到期命中、有理节点提前控制等专项也实际运行通过。

## 实际执行证据

Node24.22.1、既有TypeScript5.8.2，无安装或下载。

- 在实施worktree执行joint/service/client专项 **17/17**；独立backend及client模型真实tsc通过。
- 在合入后的集成目录执行`node tools/check-all.cjs --typescript <已有Creator TypeScript包>`，退出0，**7/7**；tooling7、shared174、backend harness573次。完整当前代码证据见[合入全量日志](st12-01-merged-check-all.log)。实施者旧全量日志保持历史原貌；修复后本报告重新验证，未冒用旧日志覆盖新代码。
- 在集成目录执行`node backend/test/fixtures/monster-demo.mjs`：5怪、HP999500、敌伤害5、CP revision2；baseline R12/W0、commit R12/W7；公开1页/5788 UTF-8 bytes，原操作replay=true。
- `git diff --check`通过，合入前双方工作区干净。

结论：**ST12-01可本地合入，当前无未关闭阻塞项**。这是逐票独立merger验证，不代替整包完成后的两轴code-review。真实SDK、微信、Note20 Ultra、Cocos构建/可玩验收及8怪+912效果联合上界仍是GAP；本地候选AP、防端K、控制时长不当正式平衡参数。旧Node模块类型警告未作为失败，也未通过修改Creator package掩盖。
