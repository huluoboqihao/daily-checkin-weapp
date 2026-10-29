# 日常打卡

[![selftest](https://github.com/deathofy/daily-checkin-weapp/actions/workflows/selftest.yml/badge.svg)](https://github.com/deathofy/daily-checkin-weapp/actions/workflows/selftest.yml)

一个原生微信小程序：今天要做什么、坚持了多久、拿到了什么成就。
AI 能力全部有本地降级，不配云环境也能完整跑。

## 功能

- **今日**：打卡/取消、连续天数、本周条、成就徽章、今日待办与「接下来」、过期待办区。
- **统计**：每个习惯的近 30 天日历与环比、近 7 天回顾、AI 洞察、成就墙、生成成就海报（三套主题、2× 导出）。
- **救援**：20 点后连续要断时出现「今晚别断」卡，一键最低限度完成。
- **习惯**：推荐习惯一键添加；可编辑名称/图标/颜色/打卡方式、暂停归档、上下排序。
- **待办**：独立新建、长按编辑时长/地点/优先级、完成计入统计与成就、可转成习惯。
- **计时**：离开页面自动暂停并落盘，回来可继续；页面前台到点提醒。
- **打卡备注**：长按已完成的习惯，记一句「今天怎么样」。
- **显示**：深色模式、标准/大/特大三档字号，四个页面共用。
- **AI**
  - 从截图或文字导入待办：本地规则兜底，自动标出时间/地点冲突，并给出「改到 HH:mm」的一键改期建议；
  - AI 帮我定：一句描述生成 1–3 个可执行习惯；
  - AI 教练：基于统计的流式对话，本地回复会引用真实洞察；
  - AI 指令：一句话操作打卡（如「把读书打卡」），云端只回动作、客户端落地；
  - AI 洞察：从近 4 周记录算出断签风险、最弱习惯、最佳星期、今日过载与下一件事；
  - 端侧图标建议：输入习惯名时本地推荐 emoji。
  - 以上能力共用 `services/ai.js` 一个入口（`genHabits / parseTasks / callAgent / streamCoach`）。

## 运行

```powershell
# 纯本地：不需要任何配置
# 用微信开发者工具打开此目录即可

# 截图 OCR 需要可用的 OCR 服务（可选）
# 把 config.js 的 ocrProxy 指到服务地址，接口为 POST /ocr {image}

# 自检（251 项）
npm test
npm run test:cloud
```

## 接入真实模型（可选）

1. `config.js` 填 `cloudEnv: '<你的云开发环境 ID>'`；
2. 部署 `cloudfunctions/genHabits`、`cloudfunctions/parseTasks` 与 `cloudfunctions/aiAgent`；
3. 在云函数环境变量里配置 `DEEPSEEK_API_KEY`（**Key 永远不进前端**）；
4. 想用微信内置模型时，把 `config.js` 的 `llmModel` 换成云开发里已启用的模型，
   客户端走的是 `wx.cloud.extend.AI.createModel('cloudbase')`。

没配云环境时，界面会标注「本地示例」「本地规则」，不会把兜底结果说成模型输出。

## 端侧模型（内置，不联网）

`models/icon-clf.onnx` + `utils/iconModel.js`：习惯名称 → 图标。

- 特征：汉字单字 + 二字 n-gram，FNV-1a 哈希到 256 维，L2 归一化；
- 模型：9 类逻辑回归（256×9 权重 + 偏置），ONNX 文件约 9.2 KB；
- 推理：优先 `wx.createInferenceSession` 跑 ONNX；机型不支持时用同一套权重在 JS 里前向；两者都不可用才回落关键词规则；
- 训练数据是合成的 536 条中文习惯短语，同分布留出集准确率 1.0，真实长尾表达仍需更多数据。

重新训练：训练脚本当前未随仓库分发；重新训练后需同步重写 `utils/iconModel.js` 与 `models/icon-clf.onnx`。

## 设计要点

- `utils/` 全部是纯函数（不引用 `wx`），所以日期、计时、解析、绘制指令都能在 node 里断言。
- 打卡记录兼容两代结构：旧的 `true` 与新的 `{ type, value }` / `{ type:'timer' }`。
- Agent 的数据主权：云端只拿快照推理并返回动作，存储永远只有本机一份。
- 计时状态落盘：离开页面自动暂停，回来可继续；跨天作废，避免把昨天的计时算进今天。
- 存储有 `schema_version`，启动时做一次轻量迁移，新增字段不用在读取处到处兜底。

## 目录

```
app.js / app.json / config.js
pages/index      今日：打卡、待办、反馈、AI 指令
pages/stats      统计：30 天日历、AI 洞察、成就、海报
pages/habits     习惯管理：AI 推荐、编辑/暂停/排序、端侧图标
pages/import     导入：文字/截图解析、冲突与改期
utils/           纯逻辑（habit/record/timer/insight/aiSuggest/poster/coach/agent/ondevice）
services/ai.js   云与本地两种后端的统一入口
cloudfunctions/  genHabits、parseTasks、aiAgent
tools/selftest.js 全量自检（251 项）
docs/            AI 使用、架构、测试说明
.github/         CI：每次 push 跑自检
```

## 已知边界

- 真实模型对话需要配置云开发环境与 `DEEPSEEK_API_KEY`；未配置时全部走本地确定性引擎，界面会标注「本地规则」。
- 截图 OCR 需要 `config.ocrProxy` 指向可用服务；默认留空，未配置时不会发请求。
- 习惯的周频率（每周 N 次）尚未实现；当前周期能力体现在成就（单周/单月）上。
- 海报里的二维码仍是占位，正式小程序码需要服务端 `getwxacode`。
