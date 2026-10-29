/**
 * 一条打卡记录的归一化。
 *
 * 存储里有两种形态：
 *   旧： true
 *   新： { type: 'simple', value: true }
 *       { type: 'timer', duration: 1500, completedAt: '2026-10-26T14:00:00.000Z' }
 *
 * 为什么不在读的时候各写各的判断：`record[k]` 对对象永远是真值，
 * 一旦引入 `{ type:'simple', value:false }` 这种被取消的记录，
 * 各处 `!!record[k]` 就会把「取消」读成「完成」。统一从这里过。
 *
 * 纯函数，不引用 wx，可以直接在 node 里单测。
 */

const TYPE_SIMPLE = 'simple'
const TYPE_TIMER = 'timer'

/** 普通打卡。传入时刻就记下来，便于以后做「几点完成」的分析 */
function makeSimple(completedAt, note) {
  const r = { type: TYPE_SIMPLE, value: true }
  if (completedAt) r.completedAt = String(completedAt)
  const n = String(note || '').trim().slice(0, 60)
  if (n) r.note = n
  return r
}

function makeTimer(duration, completedAt) {
  return {
    type: TYPE_TIMER,
    duration: Math.max(0, Math.round(Number(duration) || 0)),
    completedAt: completedAt || new Date().toISOString()
  }
}

/**
 * 归一化任意一条记录。认不出来返回 null。
 *
 * - `true` → simple（老数据迁移）
 * - 合法 timer → 原样（数值规整）
 * - `{ value:false }` / `false` / null / 脏值 → null
 */
function normalizeRecord(raw) {
  if (raw === true) return makeSimple()
  if (!raw || typeof raw !== 'object') return null

  if (raw.type === TYPE_TIMER) {
    const d = Number(raw.duration)
    if (!isFinite(d) || d < 0) return null
    return {
      type: TYPE_TIMER,
      duration: Math.round(d),
      completedAt: raw.completedAt ? String(raw.completedAt) : ''
    }
  }

  if (raw.value === false) return null
  const out = raw.completedAt ? makeSimple(raw.completedAt) : makeSimple()
  if (raw.note) out.note = String(raw.note).trim().slice(0, 60)
  return out
}

/** 这条记录算不算「完成」 */
function isMarked(raw) {
  return normalizeRecord(raw) !== null
}

/** 'simple' / 'timer' / ''（未完成或脏值） */
function recordType(raw) {
  const r = normalizeRecord(raw)
  return r ? r.type : ''
}

module.exports = {
  TYPE_SIMPLE: TYPE_SIMPLE,
  TYPE_TIMER: TYPE_TIMER,
  makeSimple: makeSimple,
  makeTimer: makeTimer,
  normalizeRecord: normalizeRecord,
  isMarked: isMarked,
  recordType: recordType
}
