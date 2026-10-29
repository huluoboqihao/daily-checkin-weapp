/**
 * 成就定义与判定
 *
 * 纯函数，不引用 wx，可以直接在 node 里单测。
 *
 * 成就写成「一条规则 + 一个指标」，而不是一堆 if：
 *   { id, name, desc, icon, metric, target }
 * metric 取四种之一（见下表），数值全部由 habit.js 的 aggregate() 给出。
 * 加新成就只是往数组里加一行，不用改判定逻辑。
 *
 * ── 为什么成就要持久化，而不是每次从记录里重算 ──
 *
 * 指标是**派生**出来的：用户删掉一个习惯，「累计打卡次数」就会回落。
 * 纯派生的话，已经拿到手的成就会退回未解锁 —— 明明做到过却显示没做到，
 * 这比从来不给成就还伤人。所以 store.js 里存一份 unlocks，
 * 一旦达成就永久保留（`applyUnlocks` 负责把这份状态并进来）。
 */

/**
 * metric 的四种取值：
 *   totalCheckins  所有习惯的打卡次数之和
 *   bestStreak     历史最长连续天数（任一习惯）—— 注意是历史最长，不是当前
 *   activeDays     有任意打卡的天数（多个习惯同一天只算一天）
 *   habitCount     当前跟踪的习惯数
 */
const ACHIEVEMENTS = [
  { id: 'first',   name: '第一步',     desc: '完成第一次打卡',       icon: '🎯', metric: 'totalCheckins', target: 1 },
  { id: 't10',     name: '小有坚持',   desc: '累计打卡 10 次',       icon: '🌱', metric: 'totalCheckins', target: 10 },
  { id: 't50',     name: '习惯成形',   desc: '累计打卡 50 次',       icon: '🌿', metric: 'totalCheckins', target: 50 },
  { id: 't100',    name: '打卡达人',   desc: '累计打卡 100 次',      icon: '🔥', metric: 'totalCheckins', target: 100 },
  { id: 't365',    name: '一年之约',   desc: '累计打卡 365 次',      icon: '🏆', metric: 'totalCheckins', target: 365 },

  { id: 's3',      name: '三日之诺',   desc: '连续打卡 3 天',        icon: '✨', metric: 'bestStreak',    target: 3 },
  { id: 's7',      name: '坚持一周',   desc: '连续打卡 7 天',        icon: '🥉', metric: 'bestStreak',    target: 7 },
  { id: 's21',     name: '21 天养成',  desc: '连续打卡 21 天',       icon: '🥈', metric: 'bestStreak',    target: 21 },
  { id: 's30',     name: '满月',       desc: '连续打卡 30 天',       icon: '🥇', metric: 'bestStreak',    target: 30 },
  { id: 's100',    name: '百日',       desc: '连续打卡 100 天',      icon: '👑', metric: 'bestStreak',    target: 100 },

  { id: 'd7',      name: '一周有痕',   desc: '累计活跃 7 天',        icon: '📅', metric: 'activeDays',    target: 7 },
  { id: 'd30',     name: '月度常客',   desc: '累计活跃 30 天',       icon: '🗓', metric: 'activeDays',    target: 30 },

  { id: 'h3',      name: '三线并进',   desc: '同时跟踪 3 个习惯',    icon: '🧩', metric: 'habitCount',    target: 3 },
  { id: 'h5',      name: '五事并行',   desc: '同时跟踪 5 个习惯',    icon: '🎪', metric: 'habitCount',    target: 5 },

  // 一次性待办也计入成就，做了不该白做
  { id: 'k10',     name: '待办清道夫', desc: '完成 10 件待办',       icon: '🧹', metric: 'tasksDone',     target: 10 },

  // 周/月周期成就：不是每天都要打卡，按自然周/月结算
  // 措辞用「单周 / 单月」：达成一次就永久保留，不是每周每月重置
  { id: 'w5',      name: '单周五次',   desc: '单周打卡 5 次',        icon: '📅', metric: 'bestWeekCheckins',    target: 5,  period: '每周' },
  { id: 'w15',     name: '单周十五次', desc: '单周打卡 15 次',       icon: '🗂', metric: 'bestWeekCheckins',    target: 15, period: '每周' },
  { id: 'w4d',     name: '一周四天',   desc: '单周活跃 4 天',        icon: '🌈', metric: 'bestWeekActiveDays',  target: 4,  period: '每周' },
  { id: 'm20',     name: '单月二十次', desc: '单月打卡 20 次',       icon: '🌙', metric: 'bestMonthCheckins',   target: 20, period: '每月' },
  { id: 'm60',     name: '月度六十次', desc: '单月打卡 60 次',       icon: '🌟', metric: 'bestMonthCheckins',   target: 60, period: '每月' },
  { id: 'm10d',    name: '月度十天',   desc: '单月活跃 10 天',       icon: '📆', metric: 'bestMonthActiveDays', target: 10, period: '每月' }
]

/**
 * 按统计数据算出每条成就的进度。
 *
 * 达成的判定是 `progress >= target` —— **正好等于就算达成**。
 * 写成 `>` 的话「连续 7 天」要第 8 天才给，用户会觉得这软件在耍他。
 */
function evaluate(stats) {
  const s = stats || {}

  return ACHIEVEMENTS.map(function (a) {
    const progress = Math.max(0, Number(s[a.metric]) || 0)
    const target = a.target > 0 ? a.target : 1
    return Object.assign({}, a, {
      period: a.period || '累计',
      progress: progress,
      unlocked: progress >= a.target,
      // 封顶 100，进度条不该画出去
      pct: Math.min(100, Math.round((progress * 100) / target))
    })
  })
}

/**
 * 下一个最可能拿到的成就。
 *
 * 这是成就区里**最有用的一条**：只列已解锁的徽章没什么推动力，
 * 「再坚持两天就能拿到」才有。所以按完成度挑，完成度相同就挑差得少的。
 */
function nextUp(list) {
  let best = null
  ;(list || []).forEach(function (a) {
    if (a.unlocked) return
    if (!best) { best = a; return }
    if (a.pct > best.pct) { best = a; return }
    if (a.pct === best.pct && (a.target - a.progress) < (best.target - best.progress)) {
      best = a
    }
  })
  return best
}

function unlockedCount(list) {
  let n = 0
  ;(list || []).forEach(function (a) { if (a.unlocked) n++ })
  return n
}

function unlockedList(list) {
  return (list || []).filter(function (a) { return a.unlocked })
}

/**
 * 把持久化的解锁状态并进来。
 *
 * 已记录为解锁的，无论当前指标掉了多少，都保持解锁 ——
 * 这就是持久化的意义所在（见文件头）。同时带上达成日期，
 * 界面上写「达成于 X」。
 *
 * 注意日期是 **App 发现它的那天**，不是真正达成的那天
 *（那几天没打开小程序就会偏）。所以措辞用「达成于」而不是「完成于」。
 */
function applyUnlocks(list, unlocks) {
  const u = unlocks || {}
  return (list || []).map(function (a) {
    if (!u[a.id]) return a
    return Object.assign({}, a, {
      unlocked: true,
      pct: 100,
      unlockedAt: u[a.id]
    })
  })
}

module.exports = {
  ACHIEVEMENTS: ACHIEVEMENTS,
  evaluate: evaluate,
  nextUp: nextUp,
  unlockedCount: unlockedCount,
  unlockedList: unlockedList,
  applyUnlocks: applyUnlocks
}
