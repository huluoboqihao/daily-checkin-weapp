/**
 * 待办的冲突检测。纯函数，node 可测。
 *
 * 先规则、后 AI：规则负责「解释为什么冲突」，AI 只负责给最小改动建议。
 * 这里不调用模型，也不修改数据 —— 只返回问题清单。
 */
const P = require('./parseTasks.js')

const BUFFER_SAME = 15       // 同地点两件事之间至少留 15 分钟
const BUFFER_CROSS = 30      // 换地点至少留 30 分钟
const DAY_MAX_ITEMS = 6      // 一天最多几件
const DAY_MAX_MINUTES = 300  // 一天计划总时长上限

function todayKey(now) {
  return P.dateKey(now || new Date())
}

function normTitle(s) {
  return String(s || '')
    .replace(/[\s，,。；;：:、·\-—_]/g, '')
    .toLowerCase()
}

function interval(task) {
  if (!task || !task.startTime) return null
  const start = P.toMinutes(task.startTime)
  if (start < 0) return null
  const dur = Math.max(15, Number(task.durationMin) || 30)
  return { start: start, end: start + dur }
}

/**
 * @param {Array} tasks  [{id,title,date,startTime,durationMin,location,priority,status}]
 * @param {object} opts { now, extraTasks }
 * @returns {Array} [{ id, type, severity, message, otherId? }]
 */
function detect(tasks, opts) {
  const o = opts || {}
  const now = o.now || new Date()
  const tKey = todayKey(now)
  const list = (tasks || []).concat(o.extraTasks || []).filter(function (t) {
    return t && t.status !== 'done'
  })

  const out = []

  // 1) 截止异常
  list.forEach(function (t) {
    if (t.date && t.date < tKey) {
      out.push({ id: t.id, type: 'deadline', severity: 'high', message: '日期已经过去了' })
    }
  })

  // 2) 同日时间重叠 / 间隔不足
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]
      const b = list[j]
      if (!a.date || a.date !== b.date) continue

      const ia = interval(a)
      const ib = interval(b)
      if (!ia || !ib) continue

      if (ia.start < ib.end && ib.start < ia.end) {
        out.push({
          id: a.id, otherId: b.id, type: 'overlap', severity: 'high',
          message: '和「' + b.title + '」时间重叠'
        })
        continue
      }

      const gap = ia.start < ib.start ? ib.start - ia.end : ia.start - ib.end
      const samePlace = (a.location || '') === (b.location || '')
      const buffer = samePlace ? BUFFER_SAME : BUFFER_CROSS
      if (gap >= 0 && gap < buffer) {
        out.push({
          id: a.id, otherId: b.id, type: 'tight', severity: 'warn',
          message: (samePlace ? '两件事之间只有 ' : '换地点只剩 ') + gap + ' 分钟'
        })
      }
    }
  }

  // 3) 单日过载
  const byDate = {}
  list.forEach(function (t) {
    if (!t.date) return
    if (!byDate[t.date]) byDate[t.date] = { n: 0, min: 0 }
    byDate[t.date].n++
    byDate[t.date].min += Math.max(0, Number(t.durationMin) || 0)
  })
  Object.keys(byDate).forEach(function (d) {
    const b = byDate[d]
    if (b.n > DAY_MAX_ITEMS || b.min > DAY_MAX_MINUTES) {
      list.filter(function (t) { return t.date === d }).forEach(function (t) {
        out.push({
          id: t.id, type: 'overload', severity: 'warn',
          message: '这天已经排了 ' + b.n + ' 件 / ' + b.min + ' 分钟'
        })
      })
    }
  })

  // 4) 重复
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]
      const b = list[j]
      if (normTitle(a.title) !== normTitle(b.title)) continue
      if (a.date && b.date && a.date !== b.date) continue
      out.push({
        id: a.id, otherId: b.id, type: 'duplicate', severity: 'warn',
        message: '和「' + b.title + '」重复'
      })
    }
  }

  // 同一任务多条提示只保留最严重的一条
  const rank = { high: 2, warn: 1 }
  const kept = {}
  out.forEach(function (c) {
    const prev = kept[c.id]
    if (!prev || rank[c.severity] > rank[prev.severity]) kept[c.id] = c
  })

  return Object.keys(kept).map(function (k) { return kept[k] })
}

/** 某天的时间负载，用于「今天会不会太满」 */
function dayLoad(tasks, date) {
  const items = (tasks || []).filter(function (t) { return t.date === date && t.status !== 'done' })
  let minutes = 0
  items.forEach(function (t) { minutes += Math.max(0, Number(t.durationMin) || 0) })
  return { count: items.length, minutes: minutes, over: items.length > DAY_MAX_ITEMS || minutes > DAY_MAX_MINUTES }
}

/**
 * 把没有时间的待办塞进 08:00–22:00 的空档。确定性兜底，AI 不可用时用。
 * 返回新的 tasks（不改原数组），每项带 startTime 建议。
 */
function fillSlots(tasks, date) {
  const day = (tasks || []).filter(function (t) { return t.date === date })
  const fixed = day.filter(function (t) { return !!t.startTime }).map(function (t) {
    const iv = interval(t)
    return { start: iv.start, end: iv.end }
  }).sort(function (a, b) { return a.start - b.start })

  const free = []
  let cursor = 8 * 60
  fixed.forEach(function (iv) {
    if (iv.start - cursor >= 30) free.push({ start: cursor, end: iv.start })
    cursor = Math.max(cursor, iv.end)
  })
  if (22 * 60 - cursor >= 30) free.push({ start: cursor, end: 22 * 60 })

  let fi = 0
  let cursorMin = free.length ? free[0].start : 0

  return day.map(function (t) {
    if (t.startTime) return t
    const dur = Math.max(15, Number(t.durationMin) || 30)
    while (fi < free.length && cursorMin + dur > free[fi].end) {
      fi++
      if (fi < free.length) cursorMin = free[fi].start
    }
    if (fi >= free.length) return t
    const start = cursorMin
    cursorMin += dur + 10
    return Object.assign({}, t, {
      startTime: P.pad(Math.floor(start / 60)) + ':' + P.pad(start % 60),
      suggested: true
    })
  })
}

/**
 * 给一个冲突的任务找一个最近的空档（同一天，08:00–22:00）。
 * 返回 { startTime } 或 null。
 */
function suggestMove(task, tasks, date) {
  const dur = Math.max(15, Number(task.durationMin) || 30)
  const others = (tasks || []).filter(function (t) {
    return t.date === date && t.id !== task.id && t.status !== 'done'
  })

  const busy = others.map(interval).filter(Boolean).sort(function (a, b) { return a.start - b.start })

  // 候选起点：早上 8 点、每个日程结束 + 缓冲、每个日程开始前留出时长 + 缓冲
  const candidates = [8 * 60]
  busy.forEach(function (iv) {
    candidates.push(iv.end + BUFFER_SAME)
    candidates.push(iv.start - dur - BUFFER_SAME)
  })

  const fits = candidates.filter(function (start) {
    if (start < 8 * 60 || start + dur > 22 * 60) return false
    return busy.every(function (iv) {
      return start + dur + BUFFER_SAME <= iv.start || start >= iv.end + BUFFER_SAME
    })
  })

  if (!fits.length) return null

  const original = interval(task)
  const target = original ? original.start : 9 * 60
  fits.sort(function (a, b) { return Math.abs(a - target) - Math.abs(b - target) })

  const start = fits[0]
  return { startTime: P.pad(Math.floor(start / 60)) + ':' + P.pad(start % 60) }
}

module.exports = {
  BUFFER_SAME: BUFFER_SAME,
  BUFFER_CROSS: BUFFER_CROSS,
  normTitle: normTitle,
  interval: interval,
  detect: detect,
  dayLoad: dayLoad,
  fillSlots: fillSlots,
  suggestMove: suggestMove
}
