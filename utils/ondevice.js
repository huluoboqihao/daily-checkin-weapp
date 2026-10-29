/**
 * 端侧模型：习惯名称 → 推荐图标。
 *
 * 模型来自 utils/iconModel.js（自动生成）：
 *   字符 n-gram（单字 + 二字）哈希到 256 维 → 逻辑回归 → 9 类图标。
 *
 * 三层推理，逐级兜底：
 *   1. wx.createInferenceSession 跑 ONNX（真正的端侧推理）；
 *   2. 机型/基础库不支持时，用同一套权重在 JS 里做一次矩阵乘；
 *   3. 连权重都不可用时，回落关键词规则，保证页面始终有结果。
 */
const model = require('./iconModel.js')

const DIM = 256
const EMOJIS = model.labels || ['💧', '🏃', '📖', '🧘', '🥗', '💪', '🌙', '✍', '✅']
const LABEL_COUNT = EMOJIS.length

const RULES = [
  { keys: ['水', '喝', '茶', '咖啡'], emoji: '💧' },
  { keys: ['跑', '走', '步', '运动'], emoji: '🏃' },
  { keys: ['读', '书', '学习', '单词', '背'], emoji: '📖' },
  { keys: ['冥想', '呼吸', '拉伸', '瑜伽'], emoji: '🧘' },
  { keys: ['吃', '早餐', '蔬菜', '水果'], emoji: '🥗' },
  { keys: ['练', '力量', '俯卧撑', '深蹲', '健身'], emoji: '💪' },
  { keys: ['睡', '早起', '熬夜', '作息'], emoji: '🌙' },
  { keys: ['写', '日记', '复盘', '记账', '周报'], emoji: '✍' }
]

let cachedWeights = null

function base64ToBytes(b64) {
  if (typeof wx !== 'undefined' && typeof wx.base64ToArrayBuffer === 'function') {
    return new Uint8Array(wx.base64ToArrayBuffer(b64))
  }
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'))
  }
  throw new Error('no base64 decoder')
}

/** 权重文件：W[256×9] 然后 b[9]，float32 小端 */
function getWeights() {
  if (cachedWeights) return cachedWeights
  try {
    const bytes = base64ToBytes(model.weightsBase64)
    const f32 = new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4))
    const w = f32.slice(0, DIM * LABEL_COUNT)
    const b = f32.slice(DIM * LABEL_COUNT, DIM * LABEL_COUNT + LABEL_COUNT)
    cachedWeights = { w: w, b: b }
  } catch (e) {
    cachedWeights = null
  }
  return cachedWeights
}

function fnv1a(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** 名称 → 256 维 L2 归一化特征（与训练脚本逐位一致） */
function preprocessName(name) {
  const s = String(name || '').replace(/\s+/g, '')
  const data = new Float32Array(DIM)

  for (let i = 0; i < s.length; i++) {
    data[fnv1a(s[i]) % DIM] += 1
    if (i + 1 < s.length) data[fnv1a(s[i] + s[i + 1]) % DIM] += 1
  }

  let norm = 0
  for (let i = 0; i < DIM; i++) norm += data[i] * data[i]
  norm = Math.sqrt(norm)
  if (norm > 0) {
    for (let i = 0; i < DIM; i++) data[i] /= norm
  }

  return { data: data, shape: [1, DIM] }
}

function argmax(logits) {
  let best = 0
  let index = 0
  for (let i = 0; i < logits.length; i++) {
    const v = Number(logits[i])
    if (i === 0 || (isFinite(v) && v > best)) {
      best = isFinite(v) ? v : 0
      index = i
    }
  }
  return { index: index, score: best }
}

/** 纯 JS 前向：不依赖推理会话，任何环境都能跑 */
function predictJS(name) {
  const w = getWeights()
  if (!w) return fallbackEmoji(name)

  const vec = preprocessName(name).data
  let best = 0
  let index = 0

  for (let c = 0; c < LABEL_COUNT; c++) {
    let score = w.b[c]
    for (let i = 0; i < DIM; i++) score += w.w[i * LABEL_COUNT + c] * vec[i]
    if (c === 0 || score > best) {
      best = score
      index = c
    }
  }

  return EMOJIS[index]
}

function fallbackEmoji(name) {
  const text = String(name || '')
  for (let i = 0; i < RULES.length; i++) {
    if (RULES[i].keys.some(function (k) { return text.indexOf(k) >= 0 })) return RULES[i].emoji
  }
  return '✅'
}

function writeEmbeddedModel() {
  return new Promise(function (resolve) {
    try {
      const fs = wx.getFileSystemManager()
      const path = wx.env.USER_DATA_PATH + '/icon-clf.onnx'
      try {
        fs.accessSync(path)
        resolve(path)
        return
      } catch (e) {
        // 不存在，写一份
      }
      fs.writeFileSync(path, model.onnxBase64, 'base64')
      resolve(path)
    } catch (e) {
      resolve(null)
    }
  })
}

/**
 * 加载端侧推理会话。path 可覆盖内置模型；失败返回 null（上层会用 JS 前向）。
 */
function loadModel(path) {
  return new Promise(function (resolve) {
    if (typeof wx === 'undefined' || typeof wx.createInferenceSession !== 'function') {
      resolve(null)
      return
    }

    const source = path || model.onnxBase64
    const prepare = path ? Promise.resolve(path) : writeEmbeddedModel()

    prepare.then(function (modelPath) {
      if (!modelPath) return resolve(null)

      let settled = false
      function done(v) {
        if (settled) return
        settled = true
        resolve(v)
      }

      try {
        const session = wx.createInferenceSession({
          model: modelPath,
          precisionLevel: 4,
          allowNPU: false,
          allowQuantize: true
        })
        if (session.onLoad) session.onLoad(function () { done(session) })
        if (session.onError) session.onError(function () { done(null) })
        setTimeout(function () { done(null) }, 5000)
      } catch (e) {
        done(null)
      }
    })
  })
}

/**
 * 预测图标：优先 ONNX 会话，其次 JS 前向，最后规则。
 * 始终返回 Promise<string>。
 */
function predictEmoji(name, session) {
  const fallback = function () { return predictJS(name) }

  if (!session || typeof session.run !== 'function') {
    return Promise.resolve(fallback())
  }

  const input = preprocessName(name)

  try {
    return Promise.resolve(session.run({
      data: input.data.buffer,
      shape: input.shape
    })).then(function (res) {
      let logits = res && res.data
      if (!logits) return fallback()
      if (logits instanceof Float32Array) {
        // 已经是浮点
      } else if (logits instanceof ArrayBuffer) {
        logits = new Float32Array(logits)
      } else if (logits.buffer) {
        logits = new Float32Array(logits.buffer)
      } else {
        return fallback()
      }
      const r = argmax(logits)
      return EMOJIS[r.index] || fallback()
    }).catch(function () {
      return fallback()
    })
  } catch (e) {
    return Promise.resolve(fallback())
  }
}

module.exports = {
  DIM: DIM,
  EMOJIS: EMOJIS,
  preprocessName: preprocessName,
  predictJS: predictJS,
  fallbackEmoji: fallbackEmoji,
  loadModel: loadModel,
  predictEmoji: predictEmoji
}
