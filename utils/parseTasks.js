/**
 * 从一段文字里抽「待办」。云端有模型时走模型，没有时用这里的规则兜底。
 *
 * 纯函数，不引用 wx，node 里可直接断言。
 *
 * 设计原则：
 * - 宁可漏，不要瞎猜：时间不明确就留空，让用户在草稿页补；
 * - 每条都带 evidence（原文片段），用户能核对为什么抽出这条；
 * - 相对时间（明天/周五）以传入的 today 为基准换算成绝对日期。
 */

const WEEK = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 }
const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }

function pad(n) { return n < 10 ? '0' + n : '' + n }

function dateKey(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

function shift(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() + n)
  return x
}

/** 'YYYY-MM-DD' + 'HH:mm' → 分钟数；缺时间返回 -1 */
function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''))
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1
}

/**
 * 解析日期短语。返回 { key, text } 或 null。
 * 支持：今天/明天/后天、周X/星期X/下周一、10月30日、2026-10-30。
 */
function parseDate(text, today) {
  const s = String(text || '')
  const base = today || new Date()

  let m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (m) {
    return { key: m[1] + '-' + pad(Number(m[2])) + '-' + pad(Number(m[3])), text: m[0] }
  }

  m = /(\d{1,2})月(\d{1,2})[日号]?/.exec(s)
  if (m) {
    const d = new Date(base.getFullYear(), Number(m[1]) - 1, Number(m[2]))
    return { key: dateKey(d), text: m[0] }
  }

  if (/后天/.test(s)) return { key: dateKey(shift(base, 2)), text: '后天' }
  if (/明天|明日/.test(s)) return { key: dateKey(shift(base, 1)), text: '明天' }
  if (/今天|今日/.test(s)) return { key: dateKey(base), text: '今天' }

  m = /(下)?(?:周|星期)([一二三四五六日天])/.exec(s)
  if (m) {
    const target = WEEK[m[2]]
    const cur = base.getDay()
    let diff = (target - cur + 7) % 7
    if (diff === 0) diff = 7
    if (m[1]) diff += 7
    return { key: dateKey(shift(base, diff)), text: m[0] }
  }

  return null
}

/** 解析时间短语。返回 { hhmm, text } 或 null */
function parseTime(text) {
  const s = String(text || '')
  let m = /(\d{1,2})[:：](\d{2})/.exec(s)
  if (m) {
    const h = Number(m[1])
    const mi = Number(m[2])
    if (h >= 0 && h <= 23 && mi >= 0 && mi <= 59) {
      return { hhmm: pad(h) + ':' + pad(mi), text: m[0] }
    }
  }

  // 「10 点 20」这种几点几分
  m = /(上午|下午|晚上|中午|早上)?\s*(\d{1,2})\s*[点时](\d{1,2})\s*分?/.exec(s)
  if (m) {
    let h = Number(m[2])
    const mi = Number(m[3])
    const ampm2 = m[1] || ''
    if ((ampm2 === '下午' || ampm2 === '晚上') && h < 12) h += 12
    if (ampm2 === '中午' && h < 11) h += 12
    if (h >= 0 && h <= 23 && mi >= 0 && mi <= 59) {
      return { hhmm: pad(h) + ':' + pad(mi), text: m[0].trim() }
    }
  }

  m = /(上午|下午|晚上|中午|早上)?\s*(\d{1,2})\s*[点时]/.exec(s)
  if (m) {
    let h = Number(m[2])
    const ampm = m[1] || ''
    if ((ampm === '下午' || ampm === '晚上') && h < 12) h += 12
    if (ampm === '中午' && h < 11) h += 12
    if (h >= 0 && h <= 23) {
      return { hhmm: pad(h) + ':00', text: m[0].trim() }
    }
  }

  return null
}

/** 地点：在XXX / @XXX / 地点:XXX，到动词或标点为止 */
const LOC_RE = /(?:在|地点[:：]?|@)\s*([\u4e00-\u9fa5A-Za-z0-9]{2,8}?)(?=[，,。；;\s]|开|交|发|写|见|去|买|做|取|参加|复|回|$)/

function parseLocation(text) {
  const s = String(text || '')
  const m = LOC_RE.exec(s)
  if (!m) return null
  const name = m[1].replace(/[前后里上下]$/, '')
  if (!name || name.length < 2) return null
  return { name: name, text: m[0] }
}

/** 去掉日期/时间/地点后的标题；太短就回退原文首句 */
function cleanTitle(text) {
  const raw = String(text || '')
  let s = raw
    .replace(/(\d{4}-\d{1,2}-\d{1,2})/g, ' ')
    .replace(/(\d{1,2}月\d{1,2}[日号]?)/g, ' ')
    .replace(/(今天|明天|后天|今日|明日)/g, ' ')
    .replace(/(下)?(?:周|星期)[一二三四五六日天]/g, ' ')
    .replace(/(上午|下午|晚上|中午|早上)?\s*\d{1,2}\s*[点时](\d{1,2})\s*分?/g, ' ')
    .replace(/(上午|下午|晚上|中午|早上)?\s*\d{1,2}\s*[点时](半)?/g, ' ')
    .replace(/(\d{1,2})[:：]\d{2}/g, ' ')
    .replace(LOC_RE, ' ')
    .replace(/[，,。；;：:、]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // 时间后的「前」、句首的「把/请/帮我」都是残留语气词
    .replace(/^(前|之前|以前)\s*/, '')
    .replace(/^(把|请|帮我|麻烦)\s*/, '')
    .replace(/[了吧呀啊哦]$/, '')
    .trim()

  // 「实验报告交」这种把动词甩在后面的，改成「交实验报告」
  const tailVerb = /^(.{2,20}?)(交|发|写|做|买|取|开|参加)$/.exec(s)
  if (tailVerb) s = tailVerb[2] + tailVerb[1]

  if (s.length < 2) {
    // 兜底只用原文去掉日期时间，不碰地点/动词，保证标题可读
    s = raw
      .replace(/(\d{4}-\d{1,2}-\d{1,2})/g, ' ')
      .replace(/(\d{1,2}月\d{1,2}[日号]?)/g, ' ')
      .replace(/(今天|明天|后天|今日|明日)/g, ' ')
      .replace(/(下)?(?:周|星期)[一二三四五六日天]/g, ' ')
      .replace(/(上午|下午|晚上|中午|早上)?\s*\d{1,2}\s*[点时](\d{1,2})\s*分?/g, ' ')
    .replace(/(上午|下午|晚上|中午|早上)?\s*\d{1,2}\s*[点时](半)?/g, ' ')
      .replace(/(\d{1,2})[:：]\d{2}/g, ' ')
      .replace(/^(前|之前|以前)\s*/, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  if (s.length > 24) s = s.slice(0, 24)
  return s
}

function looksLikeTask(line) {
  if (!line || line.length < 2) return false
  if (/^(哈哈|好的|收到|谢谢|嗯|ok)/i.test(line)) return false
  const action = /(交|发|写|做|买|取|约|开|参加|准备|提交|预约|打|去|看|读|背|跑|练|复|回|确认|提醒)/
  const timeish = /(今天|明天|后天|周|星期|\d{1,2}[:：]\d{2}|\d{1,2}[点时]|\d{1,2}月\d{1,2}日)/
  return action.test(line) || timeish.test(line)
}

/**
 * @param {string} text 聊天/通知原文
 * @param {Date} today 基准日（默认今天）
 * @returns {{tasks:Array, source:string}}
 */
function parseText(text, today) {
  const base = today || new Date()
  const lines = String(text || '')
    .split(/[\n\r]+/)
    .map(function (x) { return x.trim() })
    .filter(Boolean)

  const tasks = []
  const seen = {}

  lines.forEach(function (line) {
    if (!looksLikeTask(line)) return

    const date = parseDate(line, base)
    const time = parseTime(line)
    const loc = parseLocation(line)
    const title = cleanTitle(line) || line.slice(0, 20)

    if (!title || title.length < 2) return
    if (seen[title + (date ? date.key : '')]) return
    seen[title + (date ? date.key : '')] = true

    const confidence = (date ? 0.5 : 0.3) + (time ? 0.25 : 0) + (loc ? 0.15 : 0) + 0.1

    tasks.push({
      title: title,
      date: date ? date.key : '',
      startTime: time ? time.hhmm : '',
      durationMin: /小时|钟头/.test(line) ? 60 : 30,
      location: loc ? loc.name : '',
      priority: 2,
      confidence: Math.min(0.9, Math.round(confidence * 100) / 100),
      evidence: line.slice(0, 40)
    })
  })

  return { tasks: tasks.slice(0, 10), source: 'fallback' }
}

/** 校验模型返回的 tasks 数组，剔除脏值，补齐默认字段 */
function normalizeTasks(raw, today) {
  const list = Array.isArray(raw) ? raw : []
  const base = today || new Date()
  const out = []

  list.forEach(function (t) {
    if (!t || typeof t !== 'object') return
    const title = String(t.title || '').trim().slice(0, 24)
    if (!title) return

    let date = String(t.date || t.dueDate || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const d = parseDate(date || '', base)
      date = d ? d.key : ''
    }

    let startTime = String(t.startTime || '').trim()
    if (startTime && !/^\d{1,2}:\d{2}$/.test(startTime)) {
      const tm = parseTime(startTime)
      startTime = tm ? tm.hhmm : ''
    }

    const dur = Number(t.durationMin)
    out.push({
      title: title,
      date: date,
      startTime: startTime,
      durationMin: isFinite(dur) && dur > 0 ? Math.min(480, Math.round(dur)) : 30,
      location: String(t.location || '').trim().slice(0, 12),
      priority: [1, 2, 3].indexOf(Number(t.priority)) >= 0 ? Number(t.priority) : 2,
      confidence: Math.max(0, Math.min(1, Number(t.confidence) || 0.5)),
      evidence: String(t.evidence || '').slice(0, 40)
    })
  })

  return out.slice(0, 10)
}

module.exports = {
  pad: pad,
  dateKey: dateKey,
  toMinutes: toMinutes,
  parseDate: parseDate,
  parseTime: parseTime,
  parseLocation: parseLocation,
  cleanTitle: cleanTitle,
  parseText: parseText,
  normalizeTasks: normalizeTasks
}
