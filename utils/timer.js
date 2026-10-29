/**
 * 计时打卡的纯逻辑。不引用 wx，可以直接在 node 里单测。
 *
 * 时间差一律走时间戳，不用「时 + 分」相加 —— 那样跨天就错，
 * 23:50 开始、00:10 结束会被算成负数。
 */

/** 两个时刻之间的秒数（向下取整，负数归零） */
function calcDuration(startAt, endAt) {
  const a = startAt instanceof Date ? startAt.getTime() : Number(startAt)
  const b = endAt instanceof Date ? endAt.getTime() : Number(endAt)
  if (!isFinite(a) || !isFinite(b)) return 0
  return Math.max(0, Math.floor((b - a) / 1000))
}

/** 时长是否达标。目标为 0 视为不需要计时 */
function isDurationMet(seconds, targetSeconds) {
  const s = Number(seconds) || 0
  const t = Number(targetSeconds) || 0
  if (t <= 0) return true
  return s >= t
}

/** 秒 → 'mm:ss'（超过一小时用 'h:mm:ss'） */
function formatClock(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = m < 10 ? '0' + m : '' + m
  const ss = sec < 10 ? '0' + sec : '' + sec
  return h > 0 ? h + ':' + mm + ':' + ss : mm + ':' + ss
}

/** 已过时间占目标的百分比，封顶 100 */
function progressPct(seconds, targetSeconds) {
  const t = Number(targetSeconds) || 0
  if (t <= 0) return 100
  const pct = Math.round(((Number(seconds) || 0) * 100) / t)
  return Math.max(0, Math.min(100, pct))
}

/**
 * 计时状态（毫秒存储，秒输出）：
 *   { habitId, name, targetSeconds, dateKey, accumulated, startedAt, running }
 *
 * 离开页面时暂停并落盘，回来能接着走；跨天则作废，避免把昨天的计时算进今天。
 */
function elapsedOf(state, now) {
  const s = state || {}
  const base = Math.max(0, Number(s.accumulated) || 0)
  const started = s.running ? Number(s.startedAt) || 0 : 0
  const t = now instanceof Date ? now.getTime() : Number(now)
  const live = started && isFinite(t) ? Math.max(0, t - started) : 0
  return Math.floor((base + live) / 1000)
}

function pause(state, now) {
  const s = Object.assign({}, state || {})
  if (!s.running) return s
  const t = now instanceof Date ? now.getTime() : Number(now)
  const started = Number(s.startedAt) || 0
  if (started && isFinite(t)) s.accumulated = Math.max(0, Number(s.accumulated) || 0) + Math.max(0, t - started)
  s.running = false
  s.startedAt = 0
  return s
}

function resume(state, now) {
  const s = Object.assign({}, state || {})
  if (s.running) return s
  const t = now instanceof Date ? now.getTime() : Number(now)
  s.running = true
  s.startedAt = isFinite(t) ? t : Date.now()
  return s
}

module.exports = {
  calcDuration: calcDuration,
  isDurationMet: isDurationMet,
  formatClock: formatClock,
  progressPct: progressPct,
  elapsedOf: elapsedOf,
  pause: pause,
  resume: resume
}
