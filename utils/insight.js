/**
 * AI 洞察：把「记录」变成「现在该做什么」。
 *
 * 和教练的通用回复不同，这里每条结论都能指回具体数据：
 *   risk        连续 ≥3 天、今天还没打卡的习惯（断签风险）
 *   weakHabit   近 4 周完成率最低的习惯（需要拆小）
 *   bestWeekday 最近 4 周里完成率最高的星期几（可利用的节奏）
 *   overload    今天剩余待办的总时长（排不下就该挪）
 *   next        最该做的下一件事：高优先级待办 > 风险习惯 > 最弱习惯
 *
 * 纯函数，不引用 wx；同一份数据永远得到同一结论，方便断言。
 */
const hb = require('./habit.js')
const R = require('./record.js')

const WD = ['日', '一', '二', '三', '四', '五', '六']
const WINDOW = 28          // 观察窗口：4 周
const RISK_STREAK = 3      // 连续 3 天以上才值得提醒
const OVERLOAD_MIN = 240   // 今天剩余待办超过 4 小时算过载
const OVERLOAD_COUNT = 5

function rate(done, total) {
  return total ? Math.round((done * 100) / total) : 0
}

/**
 * @param {Array} habits 习惯列表（建议只传未暂停的）
 * @param {object} recs  { habitId: record }
 * @param {Array} tasks  全部待办
 * @param {Date} now
 */
function analyze(habits, recs, tasks, now) {
  const list = (habits || []).filter(function (h) { return !h.archived })
  const records = recs || {}
  const today = now || new Date()
  const todayK = hb.dateKey(today)

  // ── 近 4 周：每个习惯的完成天数 + 每天整体的星期分布 ──
  const perHabit = []
  const wdDone = [0, 0, 0, 0, 0, 0, 0]
  const wdDays = [0, 0, 0, 0, 0, 0, 0]

  list.forEach(function (h) {
    const rec = records[h.id] || {}
    let done = 0
    for (let i = 0; i < WINDOW; i++) {
      const d = hb.shiftDays(today, -i)
      if (R.isMarked(rec[hb.dateKey(d)])) done++
    }
    perHabit.push({ id: h.id, name: h.name, done: done, pct: rate(done, WINDOW) })
  })

  for (let i = 0; i < WINDOW; i++) {
    const d = hb.shiftDays(today, -i)
    const wd = d.getDay()
    wdDays[wd]++
    if (!list.length) continue
    let done = 0
    list.forEach(function (h) {
      if (R.isMarked((records[h.id] || {})[hb.dateKey(d)])) done++
    })
    if (done > 0) wdDone[wd]++
  }

  // ── 风险：连续 ≥3 天、今天还没打卡，取连续最长的那一个 ──
  let risk = null
  list.forEach(function (h) {
    const rec = records[h.id] || {}
    if (R.isMarked(rec[todayK])) return
    const streak = hb.streak(rec, today)
    if (streak >= RISK_STREAK && (!risk || streak > risk.streak)) {
      risk = { id: h.id, name: h.name, streak: streak }
    }
  })

  // ── 最弱习惯：完成率最低且低于一半；至少 3 天完成记录才下结论，
  //     避免刚建两天的习惯被当成「最弱」批评 ──
  let weakHabit = null
  if (perHabit.length > 1) {
    perHabit.forEach(function (p) {
      if (p.done < 3) return
      if (p.pct < 50 && (!weakHabit || p.pct < weakHabit.pct)) weakHabit = p
    })
  }

  // ── 最佳星期：至少观察 4 个样本才下结论 ──
  let bestWeekday = null
  for (let i = 0; i < 7; i++) {
    if (wdDays[i] < 4) continue
    const pct = rate(wdDone[i], wdDays[i])
    if (pct > 0 && (!bestWeekday || pct > bestWeekday.pct)) {
      bestWeekday = { wd: '周' + WD[i], pct: pct }
    }
  }

  // ── 今天剩余待办 ──
  const openTasks = (tasks || []).filter(function (t) {
    return t.status !== 'done' && t.date === todayK
  })
  let openMinutes = 0
  openTasks.forEach(function (t) { openMinutes += Number(t.durationMin) || 0 })

  const overload = (openMinutes >= OVERLOAD_MIN || openTasks.length >= OVERLOAD_COUNT)
    ? { count: openTasks.length, minutes: openMinutes }
    : null

  // ── 下一件事：优先级高的待办 > 风险习惯 > 最弱习惯 ──
  let next = null
  const ranked = openTasks.slice().sort(function (a, b) {
    const pa = Number(a.priority) || 2
    const pb = Number(b.priority) || 2
    if (pa !== pb) return pb - pa
    const ta = a.startTime || '99:99'
    const tb = b.startTime || '99:99'
    return ta < tb ? -1 : 1
  })

  if (ranked.length) {
    const t = ranked[0]
    next = {
      kind: 'task', id: t.id, name: t.title,
      reason: '今天优先级最高的一件待办'
    }
  } else if (risk) {
    next = {
      kind: 'habit', id: risk.id, name: risk.name,
      reason: '「' + risk.name + '」已经连续 ' + risk.streak + ' 天，今晚做一点就能保住'
    }
  } else if (weakHabit) {
    next = {
      kind: 'habit', id: weakHabit.id, name: weakHabit.name,
      reason: '「' + weakHabit.name + '」近 4 周完成率 ' + weakHabit.pct + '%，先做最小的一步'
    }
  }

  // ── 展示用短句，最多 3 条 ──
  const lines = []
  if (risk) lines.push('「' + risk.name + '」连续 ' + risk.streak + ' 天，今天还没打卡')
  if (overload) lines.push('今天还剩 ' + overload.count + ' 件事、约 ' + overload.minutes + ' 分钟，考虑挪走 1 件')
  // 风险习惯已经占了一条，不要再重复说它完成率低
  if (weakHabit && (!risk || weakHabit.id !== risk.id)) {
    lines.push('「' + weakHabit.name + '」近 4 周完成率 ' + weakHabit.pct + '%，可以拆小一点')
  }
  if (bestWeekday) lines.push(bestWeekday.wd + '是你最容易完成的一天（' + bestWeekday.pct + '%）')

  return {
    todayK: todayK,
    next: next,
    risk: risk,
    weakHabit: weakHabit,
    bestWeekday: bestWeekday,
    overload: overload,
    lines: lines.slice(0, 3)
  }
}

module.exports = {
  WINDOW: WINDOW,
  analyze: analyze
}
