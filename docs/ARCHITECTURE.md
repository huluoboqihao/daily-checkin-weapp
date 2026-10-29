# 架构说明

## 分层

```
pages/            界面与交互（今日 / 统计 / 习惯 / 导入）
services/ai.js    AI 能力的统一入口：云函数 or 本地兜底
utils/            纯逻辑，不引用 wx，可被 node 直接测试
cloudfunctions/   genHabits / parseTasks / aiAgent，只推理不存储
models/           icon-clf.onnx 与内联权重
```

## 数据流

1. 页面调用 `store` 读写本地存储；
2. 需要 AI 时调用 `services/ai.js`，它负责选择云端或本地实现；
3. 云端只返回文本或动作，动作由页面调用 `store` 落地；
4. 打卡数据始终只有本机一份事实源。

## 数据模型

- `habits`：`{ id, name, icon, color, type, targetSeconds, archived, order, createdAt }`
- `records`：`{ habitId: { 'YYYY-MM-DD': { type, value, completedAt, note? } } }`
- `tasks`：`{ id, title, date, startTime, durationMin, location, priority, status }`
- `achievement_unlocks`：`{ 成就 id: 达成日期 }`
- `timer_state`：`{ habitId, targetSeconds, dateKey, accumulated, startedAt, running }`
- `schema_version`：当前为 2

## AI 三级兜底

```
端侧模型：wx.createInferenceSession → JS 前向 → 关键词规则
生成/解析/指令：云函数 DeepSeek → 本地规则
教练：wx.cloud.extend.AI 流式 → 本地教练逐字输出
```

## 成就

- 长期指标：累计打卡、最长连续、活跃天数、习惯数、待办完成；
- 周期指标：历史最好一周/一月的打卡次数与活跃天数；
- 解锁状态持久化，指标回落不退回。

## 隐私边界

- 教练上下文只带聚合数字，习惯名替换为「某个习惯」；
- AI 指令需要把当前习惯名与完成状态发到云函数（未配置时不发）；
- 截图 OCR 默认关闭，只有配置 `ocrProxy` 且用户选图后才上传。
