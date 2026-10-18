# 微信小游戏首次构建与导入 v1

2026-10-17。用户提供项目AppID并授权操作Cocos Dashboard和微信开发者工具。已配置AppID `wxa68f1165ec1284fa`、Prototype启动场景与横屏，独立导入 `client/build/wechatgame`。微信开发者工具 Stable 2.02.2608070 已成功加载游戏，预览上传成功并生成二维码。未上传正式发布版本，未开通新的云服务。手机10分钟性能验收尚未完成。

## 包体问题与解决

第一次直接构建包含未使用引擎模块和全部本地资源，预览报80051：source size14516KB超过主包4MB。去掉未使用的动画、骨骼、物理、音视频等模块，保留2D/UI/Graphics及依赖；启用脚本压缩。使用Cocos小游戏分包，将internal/main设为分包。此版本Creator仍把内置resources输出到assets，故构建后再通过脚本将完整Bundle移到subpackages/resources，保持配置、图片与资源路径，入口index.js改为微信分包执行的game.js，同时同步game.json和src/settings.json的分包清单。没有缩放或重绘图片。

最终本地保守检查：主包1,592,110字节（约1.52MiB），总构建10,710,172字节（约10.21MiB）。开发者工具预览显示代码包10419KB，上传成功；这不是启动速度或手机内存结论。

## 重建方式

必须执行完整流程，避免仅在Cocos点击重新构建后遗漏内置资源包后处理：

```sh
node client/tools/build-wechat.cjs /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator
```

构建配置为 `client/build-configs/wechatgame.json`。该命令依次调用已安装Creator、资源分包后处理和大小/AppID检查；不安装额外依赖。Creator 3.8.8本机已观察到CLI构建完成返回36。

已有最新构建时可单独执行：

```sh
node client/tools/finalize-wechat-build.cjs
node client/tools/check-wechat-build.cjs
```

后处理可重复运行，不覆盖已有冲突目录，不改动源资源。大小检查验证AppID、横屏、resources分包和4MiB主包预算，防止原始80051问题回归；平台实际校验仍以微信预览结果为准。

开发者工具导入目录必须是 `client/build/wechatgame`，不是源码client目录。选择不使用云服务，仅运行本地原型。模拟器成功启动后点击预览生成新的临时二维码；本次二维码会过期，不把它作为永久链接或提交素材保存。

模型回归与TypeScript检查通过。最终微信模拟器可显示房间、角色与准备界面；工具显示0错误，仍有一个引擎初始化警告，未把警告冒充全部清零。下一步手机扫码，检查跑步交替、多点触控、技能段数与重试，并在Note20 Ultra进行三怪战斗10分钟性能记录。

参考：[Cocos 3.8小游戏分包](https://docs.cocos.com/creator/3.8/manual/zh/editor/publish/subpackage.html)、[Asset Bundle加载](https://docs.cocos.com/creator/3.8/manual/zh/asset/bundle.html)。当前配置以本地Creator类型声明、构建产物及微信预览成功为证据。
