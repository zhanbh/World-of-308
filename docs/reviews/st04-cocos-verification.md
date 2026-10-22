# ST04 Cocos 背包界面验证

2026-10-23，接续本地ST04逻辑交付；分支feat/st04-inventory，底座5bbcaa5。

## 实际交付

Prototype增加B键/右上背包按钮及Esc关闭；InventoryPanel实际创建Cocos节点、遮罩、5列100格滚动视图（初始20格，其他锁定）、正倒序按钮和3个快捷位。数据及变更只经InventoryCoordinator，不写UIStateModel中的原型背包。面板阻止新的移动/攻击输入，不暂停怪物、残留技能或冷却推进。

加载、空态、错误、提交中与未知状态分开；提交时写按钮变暗且拒绝重复提交，未知时才显示确认/继续操作按钮。读取可取消，迟到连接不会自动开包。关闭/失焦/隐藏/画布外释放都会取消手势和按钮按压；拖动只做预览，松手时重验原格身份和背包版本。

## 实际检查与证据

- 已安装Cocos Creator3.8.8的Web Mobile构建成功，CLI退出36为该版本成功码；输出client/build/web-mobile-inventory/index.html。完整本机日志在临时目录，入库只保留无账号元数据的构建摘要/文件SHA。
- 真实Cocos声明下的Prototype/InventoryPanel及导入依赖严格类型检查通过，配置tools/tsconfig.cocos-inventory.json；不同于仅transpileModule。
- 统一7组检查通过，实际计数见最终snapshot及原始本地测试日志；新增纯手势6项和隔离预览2项纳入backend回归。
- ego-browser本机Cocos浏览器实测：B打开后显示5/20；正序后3/20、合并2堆，生命/法力各8、矿石7；真实鼠标拖入生命快捷位、清空、重新绑定成功，倒序后格17/18/19且快捷绑定不变。
- CDP触屏模拟在启动前开启后验证：250ms长按法力药拖入第二位数量8；先滑动只滚动，scroll约76.77且没有新增绑定。此项是浏览器触屏模拟，不称手机实机。
- 鼠标移出画布再松手、返回后释放：gesture=idle，第三快捷位仍null。Esc后isOpen=false，B重开后两药仍8；正序恢复显示3堆。
- 网络延迟1200ms下B发起连接、Esc取消，等待原网络返回后connecting=false/open=false；再B可正常打开。

画面：[实际Cocos画布](st04-cocos-ui.png)；结构化最终状态：[浏览器状态](st04-cocos-browser-state.json)。画面由Cocos绘制完成事件直接捕获canvas像素，未用静态HTML稿替代或修图。浏览器工具常规截图在本机超时，采用实际画布捕获；不声称完成浏览器窗口外区域的视觉验收。

## 复核与修复

- 构建后首次实际开包发现mask被原项目裁掉：已启用engine模块mask，采用3.8.8的GRAPHICS_RECT并重新构建。
- 引擎3.8.8源码的鼠标模拟触摸没有设置simulate标志：已按浏览器真实pointerType区分，防止鼠标被误当长按/滚动；微信触摸路径保留。
- 独立只读复核指出画布外松手/失焦按压可能残留（P2）：已用取消epoch、主指针取消、返回时buttons=0及按钮状态清理闭环，经静态复核和浏览器边界测试确认。
- 缩窄滚动按钮避免与首列重叠，格间4px空隙不选物品；仅激活可见行，开包临时隐藏性能浮层，关闭后恢复，不让浮层覆盖整理按钮。

## 仍未完成的门禁

本机实际Cocos交互已验证，不再标“尚未接面板”。正式微信可信传输/存储适配、真实SDK事务、Note20 Ultra与其他真机触达/性能、长时弱网和最终美术仍未验收；无云资源、依赖安装或外部issue操作。全故事保持wholeStoryDone=false。

试玩为显式localhost+inventoryPreview=1 opt-in，使用真实Login/Character/Inventory服务的隔离临时夹具；不伪装正式登录或真实玩家资产，不打包后端身份/内存Store到游戏。预览服务重启时随机命名空间隔离旧待决请求。本轮未提交/推送。
