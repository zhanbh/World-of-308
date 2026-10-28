---
artifact_kind: implementation-ticket
artifact_id: ticket:warrior-loop-st14-04
status: accepted
revision: "0b71b596809e98cebf6bc3fc101a0bfbdb7045ee9fce0db712a2d12b2502978d"
accepted_revision: "0b71b596809e98cebf6bc3fc101a0bfbdb7045ee9fce0db712a2d12b2502978d"
derived_from:
  - artifact_id: spec:warrior-loop-st14
    revision: "185485034092276f09746a8100b3501bb015bfbc7d04a56625cad3fbb74f3d12"
    path: docs/stories/warrior-loop/st14/spec.md
implements: [ST14]
blocked_by: [3]
approval_kind: human
approval_evidence: "好的，开始"
---
# ST14-04 Cocos 死亡复活 HUD、状态机与视觉交互

依赖 03。交付：在客户端战斗场景接入完整的死亡复活交互弹窗与视觉反馈。

- 死亡触发复活 HUD：居中展示 10.0 秒平滑倒计时进度条与倒计时数字。
- 实时展示当前角色背包内复活纹章存量（如 `复活纹章: 10`）以及本局剩余复活次数（特殊本展示 `剩余复活: x/3`）。
- 提供【立即复活】与【放弃退出】交互按钮；无纹章或达上限时复活按钮置灰并提示原因。
- 点击【立即复活】：发送请求，收到成功响应后播放起死金色光环、全满血蓝刷新、职业技能 CD 重置；
- 点击【放弃退出】或倒计时归零：触发渐隐转场，退出挑战返回副本大门。
- 错误与未知状态容错：网络延迟或未知响应保持 HUD 提示，不冲掉新场景，确保离线 Cocos 构建与纯模型测试双绿。

测试边界、共同负测、真实依赖及平台GAP遵循本包只读spec；验收记录进入execution，不以批准代替验证。
