/**
 * 成就海报的「绘制指令」。
 *
 * 三套主题共用一套 750×1200 版式骨架，只换配色与构图：
 *   editorial  纸感编辑（默认）：左对齐、大数字、细线分栏
 *   night      墨色夜景：深底暖白、线框徽章
 *   split      双色块：上半品牌色实底反白，下半纸白
 *
 * 指令只描述画什么，不碰 Canvas API —— 页面负责渲染，node 里可直接断言。
 *
 * op 类型：
 *   rect   { x, y, w, h, fill, radius? }
 *   circle { x, y, r, fill }
 *   ring   { x, y, r, stroke, lineWidth }
 *   line   { x1, y1, x2, y2, stroke, lineWidth? }
 *   text   { x, y, text, size, color, align?, weight? }
 */

const WIDTH = 750
const HEIGHT = 1200
const THEMES = ['editorial', 'night', 'split']
const MARGIN = 64

const PALETTES = {
  editorial: {
    bg: '#FBF8F3', ink: '#1F1B16', sub: '#8C8175', line: 'rgba(31,27,22,0.12)',
    soft: '#F1EAE0', accent: '#FF6B4A', onAccent: '#FFFFFF'
  },
  night: {
    bg: '#14110E', ink: '#F7F2EA', sub: '#A89A88', line: 'rgba(247,242,234,0.18)',
    soft: '#221C16', accent: '#FF8A66', onAccent: '#14110E'
  },
  split: {
    bg: '#FBF8F3', ink: '#1F1B16', sub: '#8C8175', line: 'rgba(31,27,22,0.12)',
    soft: '#F1EAE0', accent: '#FF6B4A', onAccent: '#FFFFFF'
  }
}

function num(v, fallback) {
  const n = Number(v)
  return isFinite(n) ? n : fallback
}

function text(x, y, str, size, color, opts) {
  const o = opts || {}
  return {
    type: 'text', x: x, y: y, text: String(str),
    size: size, color: color, align: o.align || 'left',
    weight: o.weight || 'normal'
  }
}

/**
 * 印刷颗粒：用固定种子生成小点，代替图片纹理。
 * 图片 drawImage 在旧版 canvas 上偶发不回调（实测会卡死导出），
 * 纯指令画点没有这个风险。
 */
function grainOps(color, count) {
  let seed = 20261027
  const rnd = function () {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  const ops = []
  for (let i = 0; i < count; i++) {
    ops.push({
      type: 'rect',
      x: Math.round(rnd() * (WIDTH - 2)),
      y: Math.round(rnd() * (HEIGHT - 2)),
      w: 2, h: 2,
      fill: color
    })
  }
  return ops
}

/** 数字宽度粗估：等宽感，避免单位压在大数字上 */
function numberWidth(value, size) {
  const s = String(value)
  let units = 0
  for (let i = 0; i < s.length; i++) units += s[i] === '1' ? 0.42 : 0.6
  return units * size
}

/** 单字符宽度粗估：ASCII 半角约 0.56em，中文/全角 1em */
function charWidth(ch) {
  return ch.charCodeAt(0) < 256 ? 0.56 : 1
}

function textWidth(str, size) {
  const s = String(str || '')
  let w = 0
  for (let i = 0; i < s.length; i++) w += charWidth(s[i]) * size
  return w
}

/**
 * 按宽度折行，最多 maxLines 行；放不下时最后一行补省略号。
 * 海报原来直接 slice(0, 26)，长句会在半截断掉，这里改成量宽折行。
 */
function wrapText(str, size, maxWidth, maxLines) {
  const s = String(str || '')
  const max = Math.max(1, maxLines || 1)
  const lines = []
  let cur = ''
  let w = 0
  let i = 0

  for (; i < s.length; i++) {
    const ch = s[i]
    if (ch === '\n') {
      lines.push(cur)
      cur = ''
      w = 0
      if (lines.length >= max) { i++; break }
      continue
    }
    const cw = charWidth(ch) * size
    if (w + cw > maxWidth && cur) {
      lines.push(cur)
      cur = ''
      w = 0
      if (lines.length >= max) break
    }
    cur += ch
    w += cw
  }

  if (lines.length < max && cur) lines.push(cur)

  if (i < s.length && lines.length) {
    let last = lines[lines.length - 1]
    let lw = textWidth(last, size)
    while (last && lw + size > maxWidth) {
      lw -= charWidth(last[last.length - 1]) * size
      last = last.slice(0, -1)
    }
    lines[lines.length - 1] = last + '…'
  }

  return lines
}

/** 选一个能放进 maxLines 的字号；都不行就按最小号截断 */
function fitLines(str, maxWidth, maxLines, sizes) {
  const txt = String(str || '')
  const list = sizes || [24, 22, 20]
  for (let i = 0; i < list.length; i++) {
    const lines = wrapText(txt, list[i], maxWidth, maxLines + 1)
    if (lines.length <= maxLines) return { size: list[i], lines: lines }
  }
  const size = list[list.length - 1]
  return { size: size, lines: wrapText(txt, size, maxWidth, maxLines) }
}

/** 导出 2x 时把整套指令等比放大，坐标与字号一起乘 */
function scaleConfig(cfg, factor) {
  const k = Number(factor)
  if (!cfg || !isFinite(k) || k === 1) return cfg

  const keys = ['x', 'y', 'w', 'h', 'r', 'x1', 'y1', 'x2', 'y2', 'size', 'lineWidth', 'radius']
  const ops = (cfg.ops || []).map(function (op) {
    const o = Object.assign({}, op)
    keys.forEach(function (key) {
      if (typeof o[key] === 'number') o[key] = Math.round(o[key] * k * 100) / 100
    })
    return o
  })

  return {
    width: Math.round(cfg.width * k),
    height: Math.round(cfg.height * k),
    theme: cfg.theme,
    ops: ops
  }
}

/**
 * @param {object} userData { nickname, stats:{totalCheckins,bestStreak,activeDays} }
 * @param {object} achievement { icon, name, desc }
 * @param {string} theme editorial | night | split
 */
function buildPosterConfig(userData, achievement, theme) {
  const t = THEMES.indexOf(theme) >= 0 ? theme : 'editorial'
  const P = PALETTES[t]
  const u = userData || {}
  const a = achievement || {}
  const stats = u.stats || {}

  const nickname = String(u.nickname || '我')
  const total = num(stats.totalCheckins, 0)
  const best = num(stats.bestStreak, 0)
  const active = num(stats.activeDays, 0)
  const name = String(a.name || '成就')
  const desc = String(a.desc || '')
  const icon = String(a.icon || '🏅')

  const ops = []
  const isSplit = t === 'split'
  const isNight = t === 'night'

  // 背景
  ops.push({ type: 'rect', x: 0, y: 0, w: WIDTH, h: HEIGHT, fill: P.bg })
  if (isSplit) {
    ops.push({ type: 'rect', x: 0, y: 0, w: WIDTH, h: 440, fill: P.accent })
  }

  // 印刷颗粒：低对比、固定种子，像纸面而不是贴图
  ops.push.apply(ops, grainOps(isNight ? 'rgba(247,242,234,0.05)' : 'rgba(31,27,22,0.045)', 220))

  const heroColor = isSplit ? P.onAccent : P.ink
  const labelColor = isSplit ? 'rgba(255,255,255,0.72)' : P.sub
  // split 的色带只到 440，标题/统计/署名都在纸白区，必须用墨色
  const titleColor = P.ink
  const bodyColor = P.sub
  const subColor = isSplit ? 'rgba(255,255,255,0.7)' : P.sub

  // 顶部色条（非 split）
  if (!isSplit) {
    ops.push({ type: 'rect', x: 0, y: 0, w: WIDTH, h: 8, fill: P.accent })
  }

  // 栏目名
  ops.push(text(MARGIN, 120, '日常打卡 · 2026', 22, labelColor, { weight: 'bold' }))

  // 大数字 + 单位
  const heroSize = 168
  const heroText = String(best)
  ops.push(text(MARGIN, 320, heroText, heroSize, heroColor, { weight: 'bold' }))
  const unitX = MARGIN + numberWidth(heroText, heroSize) + 14
  ops.push(text(unitX, 320, '天', 40, labelColor, { weight: 'bold' }))

  ops.push(text(MARGIN, 380, '连续打卡', 26, subColor))

  // 成就名与描述
  ops.push(text(MARGIN, 490, name, 48, titleColor, { weight: 'bold' }))
  // 描述避开右侧徽章，最多两行；长句自动降字号
  const descMax = WIDTH - MARGIN - 150 - 76 - 24
  const descFit = fitLines(desc, descMax, 2)
  descFit.lines.forEach(function (ln, i) {
    ops.push(text(MARGIN, 540 + i * descFit.size * 1.5, ln, descFit.size, bodyColor))
  })

  // 徽章（右侧圆形，描边环 + 图标）
  const badgeY = t === 'split' ? 250 : 230
  ops.push({ type: 'ring', x: WIDTH - 150, y: badgeY, r: 76, stroke: isSplit ? 'rgba(255,255,255,0.6)' : P.accent, lineWidth: 3 })
  ops.push(text(WIDTH - 150, badgeY + 30, icon, 72, isSplit ? P.onAccent : P.ink, { align: 'center' }))

  // 分隔线
  ops.push({ type: 'line', x1: MARGIN, y1: 600, x2: WIDTH - MARGIN, y2: 600, stroke: P.line, lineWidth: 1 })

  // 三栏统计
  const cols = [
    { label: '累计打卡', value: total },
    { label: '最长连续', value: best },
    { label: '活跃天数', value: active }
  ]
  const colWidth = (WIDTH - MARGIN * 2) / 3
  cols.forEach(function (c, i) {
    const cx = MARGIN + colWidth * i
    ops.push(text(cx, 690, String(c.value), 56, titleColor, { weight: 'bold' }))
    ops.push(text(cx, 726, c.label, 22, bodyColor))
  })

  // 署名
  ops.push({ type: 'line', x1: MARGIN, y1: 800, x2: WIDTH - MARGIN, y2: 800, stroke: P.line, lineWidth: 1 })
  ops.push(text(MARGIN, 860, '—— ' + nickname, 26, titleColor))

  // 二维码占位
  const qr = 160
  const qrX = WIDTH - MARGIN - qr
  const qrY = 960
  // 先画一圈描边底，再叠内容，避免二维码像一块空白
  ops.push({ type: 'rect', x: qrX - 3, y: qrY - 3, w: qr + 6, h: qr + 6, fill: P.line })
  ops.push({ type: 'rect', x: qrX, y: qrY, w: qr, h: qr, fill: isNight ? P.soft : '#F3EADF', radius: 16 })
  ops.push(text(qrX + qr / 2, qrY + qr / 2 + 6, '小程序码', 20, P.sub, { align: 'center' }))

  ops.push(text(MARGIN, 1030, '扫码一起打卡', 24, titleColor))
  ops.push(text(MARGIN, 1070, '每天一点点，攒成一段连续', 20, subColor))

  return { width: WIDTH, height: HEIGHT, theme: t, ops: ops }
}

/** 2D context 渲染（调试/预览用） */
function renderOps(ctx, config) {
  const ops = (config && config.ops) || []

  ops.forEach(function (op) {
    if (op.type === 'rect') {
      if (typeof ctx.beginPath === 'function') {
        ctx.beginPath()
        if (op.radius && typeof ctx.roundRect === 'function') ctx.roundRect(op.x, op.y, op.w, op.h, op.radius)
        else if (typeof ctx.rect === 'function') ctx.rect(op.x, op.y, op.w, op.h)
      }
      ctx.fillStyle = op.fill
      ctx.fill()
    } else if (op.type === 'circle') {
      ctx.beginPath()
      ctx.arc(op.x, op.y, op.r, 0, Math.PI * 2)
      ctx.fillStyle = op.fill
      ctx.fill()
    } else if (op.type === 'ring') {
      ctx.beginPath()
      ctx.arc(op.x, op.y, op.r, 0, Math.PI * 2)
      ctx.strokeStyle = op.stroke
      ctx.lineWidth = op.lineWidth || 2
      ctx.stroke()
    } else if (op.type === 'line') {
      ctx.beginPath()
      ctx.moveTo(op.x1, op.y1)
      ctx.lineTo(op.x2, op.y2)
      ctx.strokeStyle = op.stroke
      ctx.lineWidth = op.lineWidth || 1
      ctx.stroke()
    } else if (op.type === 'text') {
      ctx.fillStyle = op.color
      ctx.font = (op.weight === 'bold' ? 'bold ' : '') + op.size + 'px sans-serif'
      ctx.textAlign = op.align || 'left'
      if (typeof ctx.fillText === 'function') ctx.fillText(op.text, op.x, op.y)
    }
  })
}

/** 旧式 CanvasContext（canvas-id + createCanvasContext），不查节点 */
function renderOpsLegacy(ctx, config) {
  const ops = (config && config.ops) || []

  ops.forEach(function (op) {
    if (op.type === 'rect') {
      ctx.setFillStyle(op.fill)
      ctx.fillRect(op.x, op.y, op.w, op.h)
    } else if (op.type === 'circle') {
      ctx.setFillStyle(op.fill)
      ctx.beginPath()
      ctx.arc(op.x, op.y, op.r, 0, Math.PI * 2)
      ctx.fill()
    } else if (op.type === 'ring') {
      ctx.setStrokeStyle(op.stroke)
      ctx.setLineWidth(op.lineWidth || 2)
      ctx.beginPath()
      ctx.arc(op.x, op.y, op.r, 0, Math.PI * 2)
      ctx.stroke()
    } else if (op.type === 'line') {
      ctx.setStrokeStyle(op.stroke)
      ctx.setLineWidth(op.lineWidth || 1)
      ctx.beginPath()
      ctx.moveTo(op.x1, op.y1)
      ctx.lineTo(op.x2, op.y2)
      ctx.stroke()
    } else if (op.type === 'text') {
      ctx.setFillStyle(op.color)
      ctx.setFontSize(op.size)
      ctx.setTextAlign(op.align || 'left')
      ctx.fillText(op.text, op.x, op.y)
    }
  })
}

/**
 * 周报海报：用同一套版式骨架，把「连续天数」换成「本周完成率」。
 * @param {object} userData { nickname }
 * @param {object} review   utils/review.js 的返回值
 * @param {string} theme
 */
function buildWeeklyConfig(userData, review, theme) {
  const t = THEMES.indexOf(theme) >= 0 ? theme : 'editorial'
  const P = PALETTES[t]
  const u = userData || {}
  const r = review || {}

  const nickname = String(u.nickname || '我')
  const avg = num(r.avgPct, 0)
  const best = r.bestDay || { pct: 0, wd: '—' }
  const worst = r.worstDay || { pct: 0, wd: '—' }

  const ops = []
  const isSplit = t === 'split'
  const isNight = t === 'night'

  ops.push({ type: 'rect', x: 0, y: 0, w: WIDTH, h: HEIGHT, fill: P.bg })
  if (isSplit) ops.push({ type: 'rect', x: 0, y: 0, w: WIDTH, h: 440, fill: P.accent })
  ops.push.apply(ops, grainOps(isNight ? 'rgba(247,242,234,0.05)' : 'rgba(31,27,22,0.045)', 220))

  const heroColor = isSplit ? P.onAccent : P.ink
  const labelColor = isSplit ? 'rgba(255,255,255,0.72)' : P.sub
  const titleColor = P.ink
  const bodyColor = P.sub

  if (!isSplit) ops.push({ type: 'rect', x: 0, y: 0, w: WIDTH, h: 8, fill: P.accent })

  ops.push(text(MARGIN, 120, '日常打卡 · 本周回顾', 22, labelColor, { weight: 'bold' }))

  const heroText = String(avg)
  ops.push(text(MARGIN, 320, heroText, 168, heroColor, { weight: 'bold' }))
  ops.push(text(MARGIN + numberWidth(heroText, 168) + 10, 320, '%', 56, labelColor, { weight: 'bold' }))
  ops.push(text(MARGIN, 380, '本周完成率', 26, isSplit ? 'rgba(255,255,255,0.7)' : P.sub))

  ops.push(text(MARGIN, 490, '这一周的你', 48, titleColor, { weight: 'bold' }))
  ops.push(text(MARGIN, 540, '待办 ' + num(r.tasksDone, 0) + '/' + num(r.tasksTotal, 0) + ' 完成 · 最好 ' + best.wd + ' ' + num(best.pct, 0) + '%', 24, bodyColor))

  ops.push({ type: 'ring', x: WIDTH - 150, y: t === 'split' ? 250 : 230, r: 76, stroke: isSplit ? 'rgba(255,255,255,0.6)' : P.accent, lineWidth: 3 })
  ops.push(text(WIDTH - 150, t === 'split' ? 280 : 260, '✓', 64, isSplit ? P.onAccent : P.ink, { align: 'center' }))

  ops.push({ type: 'line', x1: MARGIN, y1: 600, x2: WIDTH - MARGIN, y2: 600, stroke: P.line, lineWidth: 1 })

  const cols = [
    { label: '本周天数', value: 7 },
    { label: '最好一天', value: best.pct + '%' },
    { label: '最易断', value: worst.wd }
  ]
  const colWidth = (WIDTH - MARGIN * 2) / 3
  cols.forEach(function (c, i) {
    const cx = MARGIN + colWidth * i
    ops.push(text(cx, 690, String(c.value), i === 2 ? 40 : 56, titleColor, { weight: 'bold' }))
    ops.push(text(cx, 726, c.label, 22, bodyColor))
  })

  ops.push({ type: 'line', x1: MARGIN, y1: 800, x2: WIDTH - MARGIN, y2: 800, stroke: P.line, lineWidth: 1 })
  // 建议原来是硬截 26 字，长句直接断掉；改成量宽折行，最多两行
  const insightFit = fitLines(String(r.insight || ''), WIDTH - MARGIN * 2, 2)
  insightFit.lines.forEach(function (ln, i) {
    ops.push(text(MARGIN, 860 + i * insightFit.size * 1.5, ln, insightFit.size, titleColor))
  })

  const qr = 160
  const qrX = WIDTH - MARGIN - qr
  const qrY = 960
  ops.push({ type: 'rect', x: qrX - 3, y: qrY - 3, w: qr + 6, h: qr + 6, fill: P.line })
  ops.push({ type: 'rect', x: qrX, y: qrY, w: qr, h: qr, fill: isNight ? P.soft : '#F3EADF', radius: 16 })
  ops.push(text(qrX + qr / 2, qrY + qr / 2 + 6, '小程序码', 20, P.sub, { align: 'center' }))
  ops.push(text(MARGIN, 1030, '扫码一起打卡', 24, titleColor))
  ops.push(text(MARGIN, 1070, '—— ' + nickname, 24, bodyColor))

  return { width: WIDTH, height: HEIGHT, theme: t, ops: ops }
}

module.exports = {
  WIDTH: WIDTH,
  HEIGHT: HEIGHT,
  THEMES: THEMES,
  buildPosterConfig: buildPosterConfig,
  buildWeeklyConfig: buildWeeklyConfig,
  renderOps: renderOps,
  renderOpsLegacy: renderOpsLegacy,
  wrapText: wrapText,
  fitLines: fitLines,
  textWidth: textWidth,
  scaleConfig: scaleConfig
}
