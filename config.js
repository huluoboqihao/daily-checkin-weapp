/**
 * 运行期开关。所有 AI 能力默认走本地确定性引擎，
 * 填了 cloudEnv 或 aiProxy 才切到真实模型。
 *
 *   cloudEnv   微信云开发环境 ID（形如 xxx-1a2b3c）。填了才会 wx.cloud.init。
 *   aiProxy    开发期本机代理地址，例如 http://127.0.0.1:8787（仅模拟器可用）。
 *   modelPath  端侧推理模型路径，空表示不用模型、走规则兜底。
 */
module.exports = {
  cloudEnv: '',
  aiProxy: '',
  modelPath: '',
  llmModel: 'deepseek-chat',
  // 本地 OCR 服务（开发用）：node tools/ocr-service/server.js
  // 生产环境换成云函数 OCR 地址，接口保持 POST /ocr {image}
  // 默认留空：发版时不会带着 127.0.0.1 去真机上请求，界面会提示「未配置」
  ocrProxy: ''
}
