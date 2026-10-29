/**
 * 断签救援：当天 20:00 之后、还有习惯没打卡、且其中有人正连着 ≥3 天，
 * 就给一条「最低限度」提示。纯函数，node 可测。
 */
const hb = require('./habit.js')
const R = require('./record.js')

const RESCUE_HOUR = 20
const MIN_STREAK = 3

/**
 * @param {Array} habits [{id,name}]
 * @param {object} recs { habitId: record }
 * @param {Date} now
 * @returns {null|{habitId,habitName,streak,pending,message}}
 */
function rescueState(habits, recs, now) {
  const list = habits || []
  const records = recs || {}
  const current = now || new Date()

  if (current.getHours() < RESCUE_HOUR) return null

  const todayK = hb.dateKey(current)
  const pending = []

  list.forEach(function (h) {
    const rec = records[h.id] || {}
    if (R.isMarked(rec[todayK])) return
    const streak = hb.streak(rec, current)
    if (streak >= MIN_STREAK) pending.push({ habit: h, streak: streak })
  })

  if (!pending.length) return null

  pending.sort(function (a, b) { return b.streak - a.streak })
  const top = pending[0]

  return {
    habitId: top.habit.id,
    habitName: top.habit.name,
    streak: top.streak,
    pending: pending.length,
    message: '连续 ' + top.streak + ' 天别断在今晚，「' + top.habit.name + '」做 2 分钟也算'
  }
}

module.exports = { rescueState: rescueState, RESCUE_HOUR: RESCUE_HOUR, MIN_STREAK: MIN_STREAK }
