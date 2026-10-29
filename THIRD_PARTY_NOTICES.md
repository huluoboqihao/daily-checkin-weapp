# 第三方资源说明

本项目为微信小程序，代码以 MIT 许可开放。以下列出运行、构建、测试与材料制作中使用的主要第三方资源。

| 资源 | 用途 | 许可 / 条款 | 是否随作品分发 |
|---|---|---|---|
| 微信小程序平台与基础库 | 运行环境、界面、本地存储、端侧推理接口 | 微信平台服务协议 | 否 |
| Node.js | 运行自检与云函数测试 | MIT | 否 |
| DeepSeek API | 可选云端生成/解析/对话 | DeepSeek 用户协议 | 否（仅云函数调用） |
| ONNX Runtime / `wx.createInferenceSession` | 端侧模型推理 | 随微信基础库提供 | 否 |
| miniprogram-automator | 开发期 UI 回归测试 | MIT | 否 |
| GitHub Actions | CI | GitHub 服务条款 | 否 |
| python-docx / Pillow / pypdf / pypdfium2 | 报告与材料制作 | MIT / MIT-CMU / BSD-3-Clause / BSD-3-Clause | 否 |
| 系统字体与 Word | 文档排版 | 随系统/软件授权 | 否 |

## 自有内容

- `models/icon-clf.onnx` 与 `utils/iconModel.js`：团队用合成数据训练的逻辑回归模型，随 MIT 代码开放；
- 项目内背景、分类插图与空状态图：团队制作/生成，不含第三方图库素材；
- 预设习惯、示例记录、文案：团队编写。

## 未包含

- 不包含账号密码、AppSecret、API 密钥、真实个人数据；
- 不包含无权再分发的第三方图片、字体或数据集。
