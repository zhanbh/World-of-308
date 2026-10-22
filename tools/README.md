# 本地统一检查

当前工具合同：Node **24.x**、本地 TypeScript **5.8.2**。不下载依赖，不使用隐式 `npx`，不创建云环境。版本变更需同步工具校验与验证记录。检查时会打印实际Node补丁版本、TS版本和编译器路径。

## 运行

Node 24在PATH时：

```powershell
$env:WORLD308_TYPESCRIPT = 'C:/ProgramData/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript'
npm run check:all
```

本机默认Node为22，需要显式使用已装的24，不必改系统全局配置：

```powershell
$taskNode = 'C:/Users/bohan.zhan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
& $taskNode tools/check-all.cjs --typescript 'C:/ProgramData/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript'
```

路径只是在本机发现的安装位置，换机器显式传当地已有路径，不下载、不回退到系统任意编译器。`--typescript`优先于`WORLD308_TYPESCRIPT`；支持TypeScript包目录、其bin/tsc路径及已有Creator根目录。路径作为独立参数传递，不通过shell拼接执行。

`--toolchain-only`仅检查工具并打印版本，明确标注checks not run；`--type-project <tsconfig>`只执行指定项目的真实tsc语义检查，不代表全量检查。两者互斥。非法参数、缺工具、版本不符或检查失败均非零退出。

旧入口仍可用：两个客户端模型检查支持显式本地TS/Creator参数或同一环境变量；后端`check-types.cjs`也支持该环境变量及原有tsc路径参数。它们共享同一TS版本校验，不再回退下载。

## 覆盖与限制

统一入口执行7组，失败后继续收集其他组结果，最终任一失败均返回非零：

1. 工具公开CLI契约测试：缺工具/错误版本、路径含空格、无包管理回退、真实语义类型错误与互斥参数。
2. shared及backend严格类型检查。
3. shared精确值及公开编解码合同测试。
4. client纯模型、平台无关LoginCoordinator及其导入的纯依赖严格类型检查，独立tsconfig不依赖Creator生成目录；ES2022用于检查共享协议实际语言特性，不代表Cocos真机已验证。
5. backend历史回归与新增v2登录/交接/调用方组合测试，保留原断言。
6. client现有战斗/动作模型回归及语法转译检查。
7. client现有UI模型回归。

转译/模型执行与真实类型检查分开，不把transpileModule当类型通过。Cocos展示脚本在模型检查中只有转译覆盖，**不表示Cocos场景完整类型检查、构建、SDK或Note20 Ultra通过**。shared独立测试套件已纳入统一入口。

旧49项后端及客户端模型仍含与当前规格不同的规则，工具通过只证明本次工具修改未破坏旧实现，不代表v2业务通过。迁移责任见[清单](../docs/design/e01-protocol-migration-inventory-v1.md)。

没有依赖安装、锁文件或可再分发TS拷贝：直接复用已有Creator的完整本地包，并运行精确版本校验。未来改用npm依赖时再提交精确版本/锁文件方案，不偷偷回退联网。真实SDK/微信构建/资源安全/真机是独立后续门禁。
