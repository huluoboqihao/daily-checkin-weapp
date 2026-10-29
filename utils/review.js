/**
 * 本周回顾的纯逻辑：最近 7 天的完成率、最好/最差的一天、待办完成数。
 * 不引用 wx，node 可测。
 */
const hb = require('./habit.js')
const R = require('./record.js')

const WD = ['日', '一', '二', '三', '四', '五', '六']

/**
 * @param {Array} habits [{id,name}]
 * @param {object} recs   { habitId: record }
 * @param {Array} tasks   全部待办
 * @param {Date} now
 */
function weekReview(habits, recs, tasks, now) {
  const today = now || new Date()
  const list = habits || []
  const records = recs || {}
  const days = []

  for (let i = 6; i >= 0; i--) {
    const d = hb.shiftDays(today, -i)
    const key = hb.dateKey(d)
    let done = 0

    list.forEach(function (h) {
      if (R.isMarked((records[h.id] || {})[key])) done++
    })

    const total = list.length
    days.push({
      key: key,
      label: (d.getMonth() + 1) + '/' + d.getDate(),
      wd: '周' + WD[d.getDay()],
      done: done,
      total: total,
      pct: total ? Math.round((done * 100) / total) : 0
    })
  }

  let sum = 0
  days.forEach(function (x) { sum += x.pct })
  const avgPct = Math.round(sum / days.length)

  let best = days[0]
  let worst = days[0]
  days.forEach(function (x) {
    if (x.pct > best.pct) best = x
    if (x.pct < worst.pct) worst = x
  })

  // 最近 7 天到期的待办完成情况
  const from = days[0].key
  const to = days[days.length - 1].key
  const weekTasks = (tasks || []).filter(function (t) {
    return t.date && t.date >= from && t.date <= to
  })
  const tasksDone = weekTasks.filter(function (t) { return t.status === 'done' }).length

  let insight
  if (!list.length) {
    insight = '先加一个习惯，下周就能看到趋势'
  } else if (avgPct >= 80) {
    insight = '这周很稳，保持节奏就好'
  } else if (list.length && worst.pct <= 34) {
    insight = worst.wd + '最容易断，试试把那天目标减半'
  } else {
    insight = '完成率 ' + avgPct + '%，挑最空的一天补上就能拉回来'
  }

  return {
    from: from,
    to: to,
    avgPct: avgPct,
    days: days,
    bestDay: best,
    worstDay: worst,
    tasksTotal: weekTasks.length,
    tasksDone: tasksDone,
    insight: insight
  }
}

module.exports = { weekReview: weekReview, WD: WD }
