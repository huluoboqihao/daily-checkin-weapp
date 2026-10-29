/**
 * 打卡逻辑自检
 *
 *   node tools/selftest.js
 *
 * 重点测日期。日期逻辑错了很难发现 ——
 * 界面上永远显示一个看着挺合理的数字，用户不会察觉，
 * 只有跨月、跨年、闰年那几天才会暴露。所以这里把边界都钉死。
 */

const path = require('path')
const h = require(path.join(__dirname, '..', 'utils', 'habit.js'))
const ach = require(path.join(__dirname, '..', 'utils', 'achievement.js'))
const presets = require(path.join(__dirname, '..', 'utils', 'presets.js'))
const R = require(path.join(__dirname, '..', 'utils', 'record.js'))
const T = require(path.join(__dirname, '..', 'utils', 'timer.js'))
const S = require(path.join(__dirname, '..', 'utils', 'aiSuggest.js'))
const P = require(path.join(__dirname, '..', 'utils', 'poster.js'))
const C = require(path.join(__dirname, '..', 'utils', 'coach.js'))
const A = require(path.join(__dirname, '..', 'utils', 'agent.js'))
const O = require(path.join(__dirname, '..', 'utils', 'ondevice.js'))
const PT = require(path.join(__dirname, '..', 'utils', 'parseTasks.js'))
const SC = require(path.join(__dirname, '..', 'utils', 'schedule.js'))
const RV = require(path.join(__dirname, '..', 'utils', 'review.js'))
const RE = require(path.join(__dirname, '..', 'utils', 'rescue.js'))
const OC = require(path.join(__dirname, '..', 'utils', 'ocr.js'))

let failed = 0

function check(label, ok, detail) {
  if (ok) {
    console.log('  ok    ' + label + (detail ? '  ' + detail : ''))
  } else {
    failed++
    console.log('  FAIL  ' + label + (detail ? '  ' + detail : ''))
  }
}

/** 造一条记录：从 today 往前，把 offset 天都标成已打卡 */
function rec(today, offsets) {
  const r = {}
  offsets.forEach(function (o) {
    r[h.dateKey(h.shiftDays(today, -o))] = true
  })
  return r
}

// ── 日期基础 ────────────────────────────────────────

console.log('\n日期基础')

const d1 = new Date(2026, 0, 5) // 2026-01-05
check('dateKey 补零', h.dateKey(d1) === '2026-01-05', h.dateKey(d1))

// 跨月
check('1月31日 +1 → 2月1日',
  h.dateKey(h.shiftDays(new Date(2026, 0, 31), 1)) === '2026-02-01',
  h.dateKey(h.shiftDays(new Date(2026, 0, 31), 1)))

// 跨年
check('12月31日 +1 → 次年1月1日',
  h.dateKey(h.shiftDays(new Date(2026, 11, 31), 1)) === '2027-01-01',
  h.dateKey(h.shiftDays(new Date(2026, 11, 31), 1)))

check('1月1日 −1 → 上年12月31日',
  h.dateKey(h.shiftDays(new Date(2026, 0, 1), -1)) === '2025-12-31',
  h.dateKey(h.shiftDays(new Date(2026, 0, 1), -1)))

// 闰年：2026 不是闰年，2月28日 +1 应该是 3月1日
check('平年 2月28日 +1 → 3月1日',
  h.dateKey(h.shiftDays(new Date(2026, 1, 28), 1)) === '2026-03-01',
  h.dateKey(h.shiftDays(new Date(2026, 1, 28), 1)))

// 2024 是闰年，2月28日 +1 应该是 2月29日
check('闰年 2月28日 +1 → 2月29日',
  h.dateKey(h.shiftDays(new Date(2024, 1, 28), 1)) === '2024-02-29',
  h.dateKey(h.shiftDays(new Date(2024, 1, 28), 1)))

check('闰年 2月29日 +1 → 3月1日',
  h.dateKey(h.shiftDays(new Date(2024, 1, 29), 1)) === '2024-03-01')

// 时分秒必须归零，否则夏令时地区会算出 23/25 小时的一天
const dirty = new Date(2026, 5, 15, 23, 59, 59)
check('带时分秒的输入也要正确跨天',
  h.dateKey(h.shiftDays(dirty, 1)) === '2026-06-16',
  h.dateKey(h.shiftDays(dirty, 1)))

// ── 连续天数 ────────────────────────────────────────

console.log('\n连续天数')

const today = new Date(2026, 9, 2) // 2026-10-02

check('空记录 → 0', h.streak({}, today) === 0)

check('今天打了 → 1', h.streak(rec(today, [0]), today) === 1)

check('今天+前两天 → 3', h.streak(rec(today, [0, 1, 2]), today) === 3)

// 关键行为：今天还没打卡，要从昨天数起，不能显示 0
check('今天没打、昨天起连打 3 天 → 3（不是 0）',
  h.streak(rec(today, [1, 2, 3]), today) === 3,
  'streak=' + h.streak(rec(today, [1, 2, 3]), today))

// 中间断了就停
check('中间断了一天 → 只数到断点',
  h.streak(rec(today, [0, 1, 3, 4]), today) === 2,
  'streak=' + h.streak(rec(today, [0, 1, 3, 4]), today))

check('今天没打且昨天也没打 → 0',
  h.streak(rec(today, [2, 3]), today) === 0)

// 跨月：9月29、30 + 10月1、2 应该算连续 4 天
const crossMonth = {}
;['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'].forEach(function (k) {
  crossMonth[k] = true
})
check('跨月连续 → 4', h.streak(crossMonth, today) === 4,
  'streak=' + h.streak(crossMonth, today))

// 跨年
const crossYear = {}
;['2025-12-30', '2025-12-31', '2026-01-01'].forEach(function (k) { crossYear[k] = true })
check('跨年连续 → 3', h.streak(crossYear, new Date(2026, 0, 1)) === 3,
  'streak=' + h.streak(crossYear, new Date(2026, 0, 1)))

// ── 完成率 ──────────────────────────────────────────

console.log('\n完成率')

const r7 = h.completionRate(rec(today, [0, 2, 4, 6]), 7, today)
check('7 天内打了 4 天 → 57%', r7.done === 4 && r7.pct === 57,
  r7.done + '/' + r7.total + ' = ' + r7.pct + '%')

check('全勤 → 100%', h.completionRate(rec(today, [0, 1, 2]), 3, today).pct === 100)

check('全没打 → 0%', h.completionRate({}, 7, today).pct === 0)

// ── 日历网格 ────────────────────────────────────────

console.log('\n日历网格')

// 2026-10-02 是周五。取 3 周，最后一列的周五应该是今天
const weeks = h.calendarWeeks(rec(today, [0, 1]), 3, today)

check('返回 3 列（3 周）', weeks.length === 3)
check('每列 7 天', weeks.every(function (w) { return w.length === 7 }))

// 每列第一格必须是周一
let mondayOk = true
weeks.forEach(function (w) {
  const d = new Date(w[0].key.replace(/-/g, '/'))
  if (d.getDay() !== 1) mondayOk = false
})
check('每列从周一开始', mondayOk, '首列 ' + weeks[0][0].key + ' 末列 ' + weeks[2][6].key)

check('最后一列包含今天', weeks[2].some(function (c) { return c.isToday }))
check('今天这一天标记正确', weeks[2].some(function (c) { return c.isToday && c.done }))

// 未来的日期要标出来（渲染时画成空的）
const hasFuture = weeks.some(function (w) {
  return w.some(function (c) { return c.future })
})
check('未来日期有 future 标记', hasFuture)

// ── summarize ───────────────────────────────────────

console.log('\n汇总')

const sum = h.summarize(rec(today, [0, 1, 2, 5]), today)
check('连续天数正确', sum.streak === 3, sum.streak)
check('七天完成率正确', sum.week.done === 4, sum.week.done + '/7')
check('累计次数正确', sum.total === 4, sum.total)

// ── 边界 ────────────────────────────────────────────

console.log('\n边界')

// 空记录不能崩
try {
  const e = h.summarize({}, today)
  check('空记录不崩', e.streak === 0 && e.total === 0)
} catch (e) {
  check('空记录不崩', false, e.message)
}

// 只打了很久以前的一天，连续应该是 0
check('只打了 100 天前 → 连续 0', h.streak(rec(today, [100]), today) === 0)

// 记录里混入脏数据（值为 false / 杂键）不应影响统计
const dirtyRec = rec(today, [0, 1])
dirtyRec['not-a-date'] = true
dirtyRec['2026-10-03'] = false
check('脏数据不影响连续天数', h.streak(dirtyRec, today) === 2,
  'streak=' + h.streak(dirtyRec, today))

// ── 历史最长连续（和「当前连续」是两回事） ──────────

console.log('\n历史最长连续')

check('空记录 → 0', h.longestStreak({}) === 0 && h.longestStreak(null) === 0)
check('只有一天 → 1', h.longestStreak(rec(today, [5]), today) === 1)
check('连着 3 天 → 3', h.longestStreak(rec(today, [0, 1, 2]), today) === 3)

// ★ 这两个函数的区别，用错了成就判定会一直错而界面上看不出来：
// 当前连续取**最近那段**，历史最长取**最大的那段**。
// 用户断过一次之后，两者就不一样了。
const broken = rec(today, [0, 1, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
check('断过之后：当前连续只有最近那 2 天',
  h.streak(broken, today) === 2, '当前 ' + h.streak(broken, today))
check('断过之后：历史最长保留之前那 10 天',
  h.longestStreak(broken, today) === 10, '最长 ' + h.longestStreak(broken, today))
check('历史最长 >= 当前连续（恒成立）',
  h.longestStreak(broken, today) > h.streak(broken, today))

// 今天没打卡时，当前连续从昨天数起，但历史最长不受影响
check('今天没打，历史最长照样算',
  h.longestStreak(rec(today, [1, 2, 3, 4]), today) === 4)

// 跨月跨年
const lm = {}
;['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'].forEach(function (k) {
  lm[k] = true
})
check('跨月连续 → 5', h.longestStreak(lm, today) === 5, h.longestStreak(lm, today))

const ly = {}
;['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02'].forEach(function (k) { ly[k] = true })
check('跨年连续 → 4', h.longestStreak(ly, today) === 4, h.longestStreak(ly, today))

// 脏数据：非日期键和值为 false 都要忽略
const dirtyLong = rec(today, [0, 1, 2])
dirtyLong['not-a-date'] = true
dirtyLong['2026-13-99'] = true
dirtyLong['2026-10-09'] = false
check('脏数据混进来不影响结果', h.longestStreak(dirtyLong, today) === 3,
  '最长 ' + h.longestStreak(dirtyLong, today))

// ── 多习惯汇总 ──────────────────────────────────────

console.log('\n多习惯汇总')

const h2 = [{ id: 'A' }, { id: 'B' }, { id: 'C' }]
const recs = {
  A: rec(today, [0, 1, 2]),                    // 3 次，连续 3
  B: rec(today, [0, 5]),                       // 2 次
  C: {}                                        // 0 次
}
const agg = h.aggregate(h2, recs, today)

check('累计次数是所有习惯之和', agg.totalCheckins === 5, agg.totalCheckins + ' 次')
check('习惯数正确', agg.habitCount === 3)
// 同一天多个习惯都打卡，活跃天数只算一天 —— 这是最常见的算错点
check('活跃天数不重复计同一天', agg.activeDays === 4,
  'A 和 B 今天都打了，但今天只算一天 → ' + agg.activeDays + ' 天')
check('bestStreak 取各习惯最大值', agg.bestStreak === 3, agg.bestStreak)
check('今天已完成的习惯数', agg.todayDone === 2, agg.todayDone + ' 个')
check('今天完成率', agg.todayPct === 67, agg.todayPct + '%')

const aggEmpty = h.aggregate([], {}, today)
check('没有习惯时不崩、除零不产生 NaN',
  aggEmpty.habitCount === 0 && aggEmpty.todayPct === 0 && aggEmpty.totalCheckins === 0)

// 空记录的习惯不能把 bestStreak 拉低
check('空记录的习惯不影响 bestStreak',
  h.aggregate([{ id: 'X' }, { id: 'Y' }], { X: rec(today, [0, 1]) }, today).bestStreak === 2)

// 周/月周期指标：today = 2026-10-02（周五），本周从 09-28 起，本月从 10-01 起
check('本周打卡次数按周一起算', agg.weekCheckins === 4, agg.weekCheckins + ' 次')
check('本周活跃天数去重', agg.weekActiveDays === 3, agg.weekActiveDays + ' 天')
check('本月打卡次数按 1 号起算', agg.monthCheckins === 3, agg.monthCheckins + ' 次')
check('本月活跃天数去重', agg.monthActiveDays === 2, agg.monthActiveDays + ' 天')
check('历史最好一周取最大值', agg.bestWeekCheckins === 4 && agg.bestWeekActiveDays === 3,
  agg.bestWeekCheckins + ' 次 / ' + agg.bestWeekActiveDays + ' 天')
check('历史最好一月取最大值', agg.bestMonthCheckins === 3 && agg.bestMonthActiveDays === 2,
  agg.bestMonthCheckins + ' 次 / ' + agg.bestMonthActiveDays + ' 天')

// 近 30 天日历：范围外留空、今天标记正确
const g30 = h.dayGrid(rec(today, [0, 1]), 30, today)
const flat30 = g30.reduce(function (a, w) { return a.concat(w) }, [])
check('30 天网格按周对齐、每行 7 格',
  g30.length >= 5 && g30.every(function (w) { return w.length === 7 }), g30.length + ' 周')
check('30 天网格只有 30 天在范围内',
  flat30.filter(function (c) { return c.inRange }).length === 30,
  flat30.filter(function (c) { return c.inRange }).length + ' 天')
check('今天格标记正确且已打卡',
  flat30.filter(function (c) { return c.isToday })[0].done === true &&
  flat30.filter(function (c) { return c.isToday })[0].key === '2026-10-02')
check('范围外格子有日期但不计入',
  flat30.some(function (c) { return !c.inRange && c.day > 0 }))

check('周成就按历史最好一周结算', (function () {
  const e = ach.evaluate({ bestWeekCheckins: 5 })
  const w = e.filter(function (a) { return a.id === 'w5' })[0]
  return !!w && w.unlocked && w.period === '每周'
})())

check('月成就按历史最好一月结算', (function () {
  const e = ach.evaluate({ bestMonthActiveDays: 10 })
  const m = e.filter(function (a) { return a.id === 'm10d' })[0]
  return !!m && m.unlocked && m.period === '每月'
})())

// ── 成就判定 ────────────────────────────────────────

console.log('\n成就判定')

const evals = ach.evaluate({ totalCheckins: 10, bestStreak: 6, activeDays: 3, habitCount: 2 })

function findEval(id) {
  return evals.filter(function (a) { return a.id === id })[0]
}

// 边界：正好等于目标就算达成。写成 > 的话「连续 7 天」要第 8 天才给
const t10 = findEval('t10')
check('正好等于目标 → 已解锁', t10.unlocked === true, '累计 10 / 目标 ' + t10.target)
check('正好达成时进度 100%', t10.pct === 100, t10.pct + '%')

const s7 = findEval('s7')
check('差一不算解锁', s7.unlocked === false, '连续 6 / 目标 ' + s7.target)
check('差一的进度是 86%', s7.pct === 86, s7.pct + '%')

check('进度不超过 100%（进度条不该画出去）',
  findEval('t10').progress === 10 && findEval('t10').pct <= 100)
check('超额完成时 pct 封顶 100', (function () {
  const e = ach.evaluate({ totalCheckins: 9999, bestStreak: 0, activeDays: 0, habitCount: 0 })
  return e.filter(function (a) { return a.id === 't10' })[0].pct === 100
})())

check('缺指标时按 0 处理，不崩', (function () {
  const e = ach.evaluate({})
  return e.length === ach.ACHIEVEMENTS.length && e.every(function (a) { return a.progress === 0 })
})())

// 这组数据下应该是 first(累计1) / t10(累计10) / s3(连续3) 三条
check('解锁数正确', ach.unlockedCount(evals) === 3, ach.unlockedCount(evals) + ' 个')

// nextUp 要挑「最接近拿到」的那个
const nxt = ach.nextUp(evals)
check('nextUp 挑的是完成度最高的未解锁项', nxt && nxt.pct === 86, nxt ? nxt.name + ' ' + nxt.pct + '%' : 'null')
check('nextUp 不会挑已解锁的', !!nxt && !nxt.unlocked)

check('全部解锁时 nextUp 返回 null', (function () {
  const allIn = ach.evaluate({
    totalCheckins: 99999, bestStreak: 99999, activeDays: 99999, habitCount: 99999, tasksDone: 99999,
    weekCheckins: 99999, weekActiveDays: 99999, monthCheckins: 99999, monthActiveDays: 99999,
    bestWeekCheckins: 99999, bestWeekActiveDays: 99999, bestMonthCheckins: 99999, bestMonthActiveDays: 99999
  })
  return ach.nextUp(allIn) === null
})())

check('空列表 nextUp 返回 null', ach.nextUp([]) === null && ach.nextUp(null) === null)

// 每个成就的定义都要完整，缺字段会在界面上显示成空白
check('每条成就字段完整', ach.ACHIEVEMENTS.every(function (a) {
  return a.id && a.name && a.desc && a.icon && a.metric && a.target > 0
}), ach.ACHIEVEMENTS.length + ' 条')

check('成就 id 不重复', (function () {
  const seen = {}
  for (let i = 0; i < ach.ACHIEVEMENTS.length; i++) {
    const id = ach.ACHIEVEMENTS[i].id
    if (seen[id]) return false
    seen[id] = true
  }
  return true
})())

check('每条成就用的都是已知指标', (function () {
  const known = {
    totalCheckins: 1, bestStreak: 1, activeDays: 1, habitCount: 1, tasksDone: 1,
    weekCheckins: 1, weekActiveDays: 1, monthCheckins: 1, monthActiveDays: 1,
    bestWeekCheckins: 1, bestWeekActiveDays: 1, bestMonthCheckins: 1, bestMonthActiveDays: 1
  }
  return ach.ACHIEVEMENTS.every(function (a) { return !!known[a.metric] })
})())

check('待办完成计入成就', (function () {
  const e = ach.evaluate({ tasksDone: 10 })
  const k = e.filter(function (a) { return a.id === 'k10' })[0]
  return !!k && k.unlocked
})())

// ── 成就持久化（把解锁记录并回来） ──────────────────

console.log('\n成就持久化')

const locked = ach.evaluate({ totalCheckins: 3, bestStreak: 1, activeDays: 1, habitCount: 1 })
const l10 = locked.filter(function (a) { return a.id === 't10' })[0]
check('指标不够时是未解锁', l10.unlocked === false)

// ★ 持久化的意义：指标掉下来了，但已经记录为解锁的仍然保持解锁
const merged = ach.applyUnlocks(locked, { t10: '2026-09-01' })
const m10 = merged.filter(function (a) { return a.id === 't10' })[0]
check('已记录解锁的，指标回落也保持解锁', m10.unlocked === true)
check('带上达成日期', m10.unlockedAt === '2026-09-01', m10.unlockedAt)
check('并回来后进度按 100% 显示', m10.pct === 100)

const m3 = merged.filter(function (a) { return a.id === 's3' })[0]
check('没记录过的仍按指标算', m3.unlocked === false, 's3 未解锁')

check('空 unlocks 不改变任何东西',
  ach.applyUnlocks(locked, {}).every(function (a, i) { return a.unlocked === locked[i].unlocked }))

// ── 预设习惯库 ──────────────────────────────────────

console.log('\n预设习惯库')

const allPresets = presets.allItems()
check('预设非空', allPresets.length >= 18, allPresets.length + ' 条')

// ⚠️ 功能性约束：habits 页的 add() 有 12 字上限，超了会被拦下来、点了没反应
const tooLong = allPresets.filter(function (p) { return p.name.length > 12 })
check('预设名字都不超过 12 个字（否则加不上）', tooLong.length === 0,
  tooLong.map(function (p) { return p.name + '(' + p.name.length + ')' }).join(', ') || '最长 ' +
    Math.max.apply(null, allPresets.map(function (p) { return p.name.length })) + ' 字')

check('每条预设都有图标和颜色',
  allPresets.every(function (p) { return !!p.icon && /^#[0-9a-f]{6}$/i.test(p.color) }))

check('预设名字全局不重复', (function () {
  const seen = {}
  for (let i = 0; i < allPresets.length; i++) {
    if (seen[allPresets[i].name]) return false
    seen[allPresets[i].name] = true
  }
  return true
})())

check('每个类别都有内容', presets.CATEGORIES.every(function (c) {
  return c.key && c.name && c.items.length >= 4
}), presets.CATEGORIES.map(function (c) { return c.name + c.items.length }).join(' '))

// 用户明确要的三类必须在
const catKeys = presets.CATEGORIES.map(function (c) { return c.key })
check('学习 / 工作 / 健身三类都在',
  ['study', 'work', 'fitness'].every(function (k) { return catKeys.indexOf(k) >= 0 }),
  catKeys.join(','))

check('预设用的图标都在 store.ICONS 里（否则改图标时选不到）', (function () {
  const icons = require(path.join(__dirname, '..', 'utils', 'store.js')).ICONS
  const missing = allPresets.filter(function (p) { return icons.indexOf(p.icon) < 0 })
  return missing.length === 0
})())

// 首装种子
check('种子习惯都能在预设里找到', presets.seedHabits().length === presets.SEED_NAMES.length,
  presets.SEED_NAMES.length + ' 个')
check('种子覆盖多个类别', (function () {
  const cats = {}
  presets.seedHabits().forEach(function (p) { cats[p.category] = true })
  return Object.keys(cats).length >= 3
})(), '覆盖 ' + (function () {
  const cats = {}
  presets.seedHabits().forEach(function (p) { cats[p.category] = true })
  return Object.keys(cats).length
})() + ' 类')

// markAdded：按名字判断，用户手打过的同名习惯也要算「已有」
const marked = presets.markAdded(presets.CATEGORIES, ['早起', '跑步 3 公里'])
const lifeCat = marked.filter(function (c) { return c.key === 'life' })[0]
const fitCat = marked.filter(function (c) { return c.key === 'fitness' })[0]
check('已存在的同名习惯被标为已添加',
  lifeCat.items.filter(function (i) { return i.name === '早起' })[0].added === true)
check('未存在的标为未添加',
  lifeCat.items.filter(function (i) { return i.name === '记账' })[0].added === false)
check('跨类别也能正确标记',
  fitCat.items.filter(function (i) { return i.name === '跑步 3 公里' })[0].added === true)

check('空名单时全部标为未添加',
  presets.markAdded(presets.CATEGORIES, []).every(function (c) {
    return c.items.every(function (i) { return i.added === false })
  }))

check('markAdded 不改动原数据', presets.CATEGORIES[3].items[0].added === undefined)

// ── 预置打卡记录 ────────────────────────────────────

console.log('\n预置打卡记录')

check('记录条数和种子习惯数一一对应',
  presets.SEED_RECORDS.length === presets.SEED_NAMES.length,
  presets.SEED_RECORDS.length + ' / ' + presets.SEED_NAMES.length)

check('偏移量都是合法的非负整数',
  presets.SEED_RECORDS.every(function (list) {
    return list.every(function (o) { return Number.isInteger(o) && o >= 0 && o < 400 })
  }))

// 同一个偏移量写两遍不会出 bug，但说明数据是手滑写重了
check('同一条里没有重复的偏移量', presets.SEED_RECORDS.every(function (list) {
  const seen = {}
  for (let i = 0; i < list.length; i++) {
    if (seen[list[i]]) return false
    seen[list[i]] = true
  }
  return true
}))

check('每条习惯都铺了记录（否则首屏会有空白格）',
  presets.SEED_RECORDS.every(function (l) { return l.length >= 5 }),
  presets.SEED_RECORDS.map(function (l) { return l.length }).join(','))

// 造出播种后应该长成的样子，验证演示状态
const seedToday = new Date(2026, 9, 2)
const seedRecs = {}
presets.SEED_RECORDS.forEach(function (offsets, i) {
  const rec = {}
  offsets.forEach(function (o) {
    rec[h.dateKey(h.shiftDays(seedToday, -o))] = true
  })
  seedRecs['h' + i] = rec
})
const seedList = presets.SEED_NAMES.map(function (n, i) { return { id: 'h' + i, name: n } })
const seedAgg = h.aggregate(seedList, seedRecs, seedToday)
const seedEv = ach.evaluate(seedAgg)

// 首屏别是三条零
check('预置数据下今日有进度', seedAgg.todayDone >= 4 && seedAgg.todayPct >= 60,
  seedAgg.todayDone + '/' + seedAgg.habitCount + ' = ' + seedAgg.todayPct + '%')

// ★ 这组数据存在的意义之一：界面上能直观看到两个 streak 函数的区别。
// 读书那条断了两天，当前连续是 0，但历史最长有 19 天
const brokenOne = seedList.filter(function (x) {
  const rec = seedRecs[x.id]
  return h.longestStreak(rec) > h.streak(rec, seedToday)
})
check('存在「历史最长 > 当前连续」的习惯（否则看不出两个 streak 的区别）',
  brokenOne.length > 0,
  brokenOne.length ? brokenOne.map(function (x) { return x.name }).join('、') +
    '（最长 ' + h.longestStreak(seedRecs[brokenOne[0].id]) +
    ' / 当前 ' + h.streak(seedRecs[brokenOne[0].id], seedToday) + '）' : '找不到')

check('有习惯正在连着（当前连续 > 0）',
  seedList.some(function (x) { return h.streak(seedRecs[x.id], seedToday) > 0 }),
  '最长当前连续 ' + Math.max.apply(null, seedList.map(function (x) {
    return h.streak(seedRecs[x.id], seedToday)
  })) + ' 天')

const seedUnlocked = ach.unlockedCount(seedEv)
check('预置数据下已解锁若干成就（不是全锁着）', seedUnlocked >= 6,
  seedUnlocked + ' / ' + seedEv.length + ' 个')

check('也留了没解锁的（成就墙要有奔头）', seedUnlocked < seedEv.length,
  '还剩 ' + (seedEv.length - seedUnlocked) + ' 个没解锁')

// 今日页那条「下一个成就」的进度条要有东西可推，不能是 0%
check('下一个成就的进度已经过半', (function () {
  const n = ach.nextUp(seedEv)
  return n && n.pct >= 50
})(), (function () {
  const n = ach.nextUp(seedEv)
  return n ? n.name + ' ' + n.progress + ' / ' + n.target + '（' + n.pct + '%）' : 'null'
})())

// 这条钉住的是「演示状态」本身：改 SEED_RECORDS 的数字会让它失败，
// 那是提醒你不是改错了数字，而是把演示状态改掉了
check('下一个成就是「21 天养成」，差 2 天（改动示例数据会让这条失败）',
  (function () {
    const n = ach.nextUp(seedEv)
    return !!n && n.id === 's21'
  })(),
  (function () {
    const n = ach.nextUp(seedEv)
    return n ? n.id + ' ' + n.name : 'null'
  })())

check('累计次数落在合理区间（不至于把所有成就都解锁了）',
  seedAgg.totalCheckins >= 60 && seedAgg.totalCheckins < 100,
  seedAgg.totalCheckins + ' 次')

// ── 记录结构兼容（任务 1）────────────────────────────

console.log('\n记录结构兼容')

const legacy = {}
legacy[h.dateKey(today)] = true
const normalized = {}
Object.keys(legacy).forEach(function (k) { normalized[k] = R.normalizeRecord(legacy[k]) })

check('旧 true 归一化成 simple',
  R.normalizeRecord(true).type === 'simple' && R.normalizeRecord(true).value === true)

check('归一化前后 streak 不变',
  h.streak(legacy, today) === h.streak(normalized, today),
  h.streak(legacy, today) + ' / ' + h.streak(normalized, today))

check('计时记录也算完成', R.isMarked(R.makeTimer(1500, '2026-10-02T00:00:00Z')) === true)

check('普通打卡能记住完成时刻',
  R.normalizeRecord(R.makeSimple('2026-10-27T09:30:00.000Z')).completedAt === '2026-10-27T09:30:00.000Z')

check('老数据没有完成时刻也不会补假时间',
  R.normalizeRecord(true).completedAt === undefined)

check('显式取消的记录不算完成', R.isMarked({ type: 'simple', value: false }) === false)

const mixed = {
  a: { '2026-09-30': true, '2026-10-01': R.makeSimple(), '2026-10-02': R.makeTimer(60) },
  b: { '2026-10-02': { type: 'simple', value: false } }
}
const mixedAgg = h.aggregate([{ id: 'a' }, { id: 'b' }], mixed, today)
check('新旧混合 aggregate 不崩且计数正确', mixedAgg.totalCheckins === 3 && mixedAgg.todayDone === 1,
  'total=' + mixedAgg.totalCheckins + ' today=' + mixedAgg.todayDone)

// ── 计时打卡（任务 2）────────────────────────────

console.log('\n计时打卡')

const crossMidnight = T.calcDuration(new Date(2026, 9, 2, 23, 50), new Date(2026, 9, 3, 0, 10))
check('跨天计时算对（23:50 → 次日 00:10 = 1200 秒）', crossMidnight === 1200, crossMidnight + ' 秒')

check('结束早于开始 → 0',
  T.calcDuration(new Date(2026, 9, 2, 12, 0), new Date(2026, 9, 2, 11, 0)) === 0)

check('差 1 秒不达标', T.isDurationMet(1799, 1800) === false)
check('正好达标', T.isDurationMet(1800, 1800) === true)
check('目标为 0 视为不需要计时', T.isDurationMet(0, 0) === true)

check('formatClock 补零', T.formatClock(65) === '01:05', T.formatClock(65))
check('formatClock 超过一小时', T.formatClock(3661) === '1:01:01', T.formatClock(3661))
check('progressPct 封顶 100', T.progressPct(4000, 1800) === 100)

// ── AI 建议（任务 3）────────────────────────────

console.log('\nAI 建议')

check('数组外形能解析', S.parseSuggestions('[{"name":"晨跑","icon":"🏃","color":"#4a9e6f"}]').length === 1)
check('围栏 + 对象外形能解析',
  S.parseSuggestions('```json\n{"habits":[{"name":"读书"}]}\n```').length === 1)
check('非法输入返回空数组', S.parseSuggestions('随便说说').length === 0)
check('名称截断到 12 字',
  S.parseSuggestions('[{"name":"一二三四五六七八九十一二三四五"}]')[0].name.length === 12)
check('mock 稳定且不超过 3 条', (function () {
  const a = S.mockSuggestions('想健身')
  const b = S.mockSuggestions('想健身')
  return JSON.stringify(a) === JSON.stringify(b) && a.length > 0 && a.length <= 3
})())
check('prompt 带 JSON 约束', S.buildSuggestPrompt('x').system.indexOf('JSON') >= 0)

// ── 成就海报（任务 4）────────────────────────────

console.log('\n成就海报')

const posterInput = {
  nickname: '我',
  stats: { totalCheckins: 90, bestStreak: 21, activeDays: 30 }
}
const posterAch = { icon: '🥈', name: '21 天养成', desc: '连续打卡 21 天' }
const posterCfg = P.buildPosterConfig(posterInput, posterAch, 'editorial')

const TYPES = ['rect', 'circle', 'ring', 'line', 'text']

function inBounds(cfg, op) {
  if (op.type === 'rect') {
    return op.x >= 0 && op.y >= 0 && op.x + op.w <= cfg.width && op.y + op.h <= cfg.height
  }
  if (op.type === 'circle' || op.type === 'ring') {
    return op.x - op.r >= 0 && op.x + op.r <= cfg.width && op.y - op.r >= 0 && op.y + op.r <= cfg.height
  }
  if (op.type === 'line') {
    return op.x1 >= 0 && op.x2 <= cfg.width && op.y1 >= 0 && op.y2 <= cfg.height
  }
  return op.x >= 0 && op.x <= cfg.width && op.y >= 0 && op.y <= cfg.height
}

P.THEMES.forEach(function (theme) {
  const cfg = P.buildPosterConfig(posterInput, posterAch, theme)

  check('主题「' + theme + '」指令合法', cfg.ops.length > 0 &&
    cfg.ops.every(function (op) { return TYPES.indexOf(op.type) >= 0 }), cfg.ops.length + ' 条')

  check('主题「' + theme + '」坐标不越界',
    cfg.ops.every(function (op) { return inBounds(cfg, op) }))

  check('主题「' + theme + '」画布 750×1200', cfg.width === 750 && cfg.height === 1200)

  check('主题「' + theme + '」带印刷颗粒', cfg.ops.length > 220, cfg.ops.length + ' 条指令')
})

check('未知主题回落到纸感',
  P.buildPosterConfig(posterInput, posterAch, 'nope').theme === 'editorial')

// 周报海报：同一套骨架，换成完成率
const weeklyInput = {
  avgPct: 74,
  tasksDone: 3,
  tasksTotal: 5,
  bestDay: { pct: 100, wd: '周五' },
  worstDay: { pct: 40, wd: '周三' },
  insight: '这周很稳，保持节奏就好'
}

P.THEMES.forEach(function (theme) {
  const cfg = P.buildWeeklyConfig({ nickname: '我' }, weeklyInput, theme)
  check('周报主题「' + theme + '」指令合法', cfg.ops.length > 220 &&
    cfg.ops.every(function (op) { return TYPES.indexOf(op.type) >= 0 }), cfg.ops.length + ' 条')
  check('周报主题「' + theme + '」坐标不越界',
    cfg.ops.every(function (op) { return inBounds(cfg, op) }))
})

check('renderOps 能画出所有文字', (function () {
  let texts = 0
  const ctx = {
    beginPath: function () {},
    rect: function () {},
    arc: function () {},
    moveTo: function () {},
    lineTo: function () {},
    fill: function () {},
    stroke: function () {},
    fillText: function () { texts++ },
    set fillStyle(v) {},
    set font(v) {},
    set textAlign(v) {},
    set strokeStyle(v) {},
    set lineWidth(v) {}
  }
  P.renderOps(ctx, posterCfg)
  const expected = posterCfg.ops.filter(function (op) { return op.type === 'text' }).length
  return texts === expected && expected > 0
})())

// ── AI 教练上下文（任务 5）──────────────────────

console.log('\nAI 教练')

const coachStats = { totalCheckins: 90, bestStreak: 21, activeDays: 30, todayDone: 5, habitCount: 6 }
const coachCtx = C.buildCoachContext(coachStats)

check('上下文包含四项统计',
  coachCtx.indexOf('90') >= 0 && coachCtx.indexOf('21') >= 0 &&
  coachCtx.indexOf('30') >= 0 && coachCtx.indexOf('5/6') >= 0,
  coachCtx)

check('「坚持不下去」引用连续天数',
  C.buildCoachReply('我坚持不下去了', coachStats).indexOf('21') >= 0)

check('「建议」引用累计次数',
  C.buildCoachReply('有什么建议吗', coachStats).indexOf('90') >= 0)

check('默认回复不是空话', C.buildCoachReply('你好', coachStats).length > 10)

// ── Agent 动作（任务 6）─────────────────────────

console.log('\nAgent 动作')

const agentSnap = {
  habits: [{ id: 'a', name: '读书', done: false }, { id: 'b', name: '喝水', done: true }],
  stats: { todayDone: 1, habitCount: 2, totalCheckins: 10, bestStreak: 3 }
}

check('applyActions 翻转状态并更新今日完成数', (function () {
  const r = A.applyActions(agentSnap, [{ type: 'toggle', habitId: 'a' }])
  return r.changed.length === 1 && r.snapshot.habits[0].done === true && r.snapshot.stats.todayDone === 2
})())

check('未知动作被忽略', (function () {
  const r = A.applyActions(agentSnap, [{ type: 'nope' }, null])
  return r.changed.length === 0 && r.snapshot.habits[0].done === false
})())

check('mock 能按习惯名给出动作', (function () {
  const r = A.mockAgent('把读书打卡', agentSnap)
  return r.actions.length === 1 && r.actions[0].habitId === 'a'
})())

check('习惯名带后缀也能匹配（读书 30 分钟）', (function () {
  const snap2 = {
    habits: [{ id: 'x', name: '读书 30 分钟', done: false }, { id: 'y', name: '喝够 8 杯水', done: false }],
    stats: {}
  }
  const r = A.mockAgent('把读书打卡', snap2)
  return r.actions.length === 1 && r.actions[0].habitId === 'x'
})())

check('别名命中不会误伤另一个习惯', (function () {
  const snap2 = {
    habits: [{ id: 'x', name: '读书 30 分钟', done: false }, { id: 'y', name: '喝够 8 杯水', done: false }],
    stats: {}
  }
  return A.findHabit('喝水打卡', snap2.habits).id === 'y'
})())

check('mock 列表回复带完成标记', (function () {
  const r = A.mockAgent('有哪些习惯', agentSnap)
  return r.reply.indexOf('✓') >= 0 && r.reply.indexOf('○') >= 0
})())

check('mock 统计回复带数字', (function () {
  const r = A.mockAgent('今天完成得怎么样', agentSnap)
  return r.reply.indexOf('1/2') >= 0 && r.reply.indexOf('10') >= 0
})())

// ── 端侧推理（任务 7）───────────────────────────

console.log('\n端侧推理')

const vec = O.preprocessName('喝水')
check('预处理是 1×256', vec.data.length === 256 && O.DIM === 256 && vec.shape[1] === 256)

let vnorm = 0
for (let i = 0; i < vec.data.length; i++) vnorm += vec.data[i] * vec.data[i]
check('特征做 L2 归一化', Math.abs(Math.sqrt(vnorm) - 1) < 1e-4)

check('模型：喝水 → 💧', O.predictJS('喝够 8 杯水') === '💧', O.predictJS('喝够 8 杯水'))
check('模型：跑步 → 🏃', O.predictJS('晨跑 20 分钟') === '🏃', O.predictJS('晨跑 20 分钟'))
check('模型：读书 → 📖', O.predictJS('读 10 页书') === '📖', O.predictJS('读 10 页书'))
check('模型：冥想 → 🧘', O.predictJS('睡前冥想') === '🧘', O.predictJS('睡前冥想'))
check('模型：早睡 → 🌙', O.predictJS('23 点前睡') === '🌙', O.predictJS('23 点前睡'))
check('模型：写日记 → ✍', O.predictJS('写日记') === '✍', O.predictJS('写日记'))
check('规则兜底：无关键词给默认', O.fallbackEmoji('打电话') === '✅', O.fallbackEmoji('打电话'))

check('renderOpsLegacy 覆盖所有图元（不查节点）', (function () {
  let rects = 0
  let arcs = 0
  let texts = 0
  const ctx = {
    setFillStyle: function () {},
    setStrokeStyle: function () {},
    setLineWidth: function () {},
    setFontSize: function () {},
    setTextAlign: function () {},
    fillRect: function () { rects++ },
    beginPath: function () {},
    arc: function () { arcs++ },
    moveTo: function () {},
    lineTo: function () {},
    fill: function () {},
    stroke: function () {},
    fillText: function () { texts++ }
  }
  P.renderOpsLegacy(ctx, posterCfg)

  const er = posterCfg.ops.filter(function (o) { return o.type === 'rect' }).length
  const ec = posterCfg.ops.filter(function (o) { return o.type === 'circle' || o.type === 'ring' }).length
  const et = posterCfg.ops.filter(function (o) { return o.type === 'text' }).length
  return rects === er && arcs === ec && texts === et && et > 0
})())

// ── 待办解析与冲突 ───────────────────────────────

console.log('\n待办解析')

const parseDay = new Date(2026, 9, 27) // 2026-10-27 周二
const parsed = PT.parseText('明天下午3点前把周报发我\n周五交实验报告\n哈哈哈好的', parseDay)

check('抽出两条，忽略闲聊', parsed.tasks.length === 2, parsed.tasks.length + ' 条')
check('明天 → 2026-10-28', parsed.tasks[0].date === '2026-10-28', parsed.tasks[0].date)
check('下午3点 → 15:00', parsed.tasks[0].startTime === '15:00', parsed.tasks[0].startTime)
check('周五 → 2026-10-30', parsed.tasks[1].date === '2026-10-30', parsed.tasks[1].date)
check('标题带着原文片段', parsed.tasks[0].evidence.indexOf('周报') >= 0, parsed.tasks[0].evidence)

const meeting = PT.parseText('周五下午2点在会议室开项目评审会', parseDay).tasks[0]
check('标题去掉地点与时间', meeting.title === '开项目评审会', meeting.title)
check('地点抽到「会议室」', meeting.location === '会议室', meeting.location)
check('残留语气词被清掉',
  PT.cleanTitle('明天下午3点前把周报发我') === '周报发我',
  PT.cleanTitle('明天下午3点前把周报发我'))

const t1020 = PT.parseText('明天上午10点20写周报', parseDay).tasks[0]
check('「10 点 20」解析成 10:20 且标题不含残留',
  t1020.startTime === '10:20' && t1020.title === '写周报',
  t1020.startTime + ' / ' + t1020.title)

check('句末语气词被清掉且动词前置',
  PT.cleanTitle('周五前把实验报告交了') === '交实验报告',
  PT.cleanTitle('周五前把实验报告交了'))

check('normalizeTasks 过滤空标题',
  PT.normalizeTasks([{ title: '' }, { title: '交周报', date: '明天' }], parseDay).length === 1)

console.log('\n冲突检测')

// 固定「现在」，否则过了 10-27 后所有任务都会被判成 deadline
const fixedNow = new Date(2026, 9, 27, 9, 0)

const conflicts = SC.detect([
  { id: 'a', title: '开会', date: '2026-10-27', startTime: '10:00', durationMin: 60, location: '公司', status: 'active' },
  { id: 'b', title: '写周报', date: '2026-10-27', startTime: '10:30', durationMin: 60, location: '公司', status: 'active' }
], { now: fixedNow })
check('时间重叠判为 high',
  conflicts.some(function (c) { return c.id === 'a' && c.type === 'overlap' && c.severity === 'high' }))

const tight = SC.detect([
  { id: 'a', title: '开会', date: '2026-10-27', startTime: '10:00', durationMin: 60, location: '公司', status: 'active' },
  { id: 'b', title: '见客户', date: '2026-10-27', startTime: '11:10', durationMin: 30, location: '客户处', status: 'active' }
], { now: fixedNow })
check('换地点间隔不足判为 warn',
  tight.some(function (c) { return c.type === 'tight' && c.severity === 'warn' }))

const dup = SC.detect([
  { id: 'a', title: '交周报', date: '2026-10-27', status: 'active' },
  { id: 'b', title: '交 周报', date: '2026-10-27', status: 'active' }
], { now: fixedNow })
check('重复标题能识别', dup.some(function (c) { return c.type === 'duplicate' }))

const slots = SC.fillSlots([
  { id: 'a', title: 'A', date: '2026-10-27', durationMin: 30 },
  { id: 'b', title: 'B', date: '2026-10-27', durationMin: 30 }
], '2026-10-27')
check('空档能排出时间', slots.every(function (t) { return !!t.startTime }),
  slots.map(function (t) { return t.startTime }).join(','))

const moved = SC.suggestMove(
  { id: 'a', title: '开会', date: '2026-10-27', startTime: '10:00', durationMin: 60 },
  [
    { id: 'a', title: '开会', date: '2026-10-27', startTime: '10:00', durationMin: 60, status: 'active' },
    { id: 'b', title: '写周报', date: '2026-10-27', startTime: '10:30', durationMin: 60, status: 'active' }
  ],
  '2026-10-27'
)
check('冲突能给出不撞车的改期建议',
  !!moved && (SC.interval({ startTime: moved.startTime, durationMin: 60 }).end <= 10 * 60 + 30 ||
    moved.startTime >= '11:30'),
  moved ? moved.startTime : 'null')

// ── 本周回顾 ─────────────────────────────────────

console.log('\n本周回顾')

const rvNow = new Date(2026, 9, 27)
const rvRecs = { a: {}, b: {} }
for (let i = 0; i < 7; i++) rvRecs.a[h.dateKey(h.shiftDays(rvNow, -i))] = true
rvRecs.b[h.dateKey(rvNow)] = true

const rv = RV.weekReview([{ id: 'a' }, { id: 'b' }], rvRecs, [
  { id: 't1', date: '2026-10-27', status: 'done' },
  { id: 't2', date: '2026-10-26', status: 'active' }
], rvNow)

check('平均完成率 57%', rv.avgPct === 57, rv.avgPct + '%')
check('最好 100 / 最差 50', rv.bestDay.pct === 100 && rv.worstDay.pct === 50,
  rv.bestDay.pct + '/' + rv.worstDay.pct)
check('待办完成数', rv.tasksDone === 1 && rv.tasksTotal === 2,
  rv.tasksDone + '/' + rv.tasksTotal)
check('给出可读建议', rv.insight.length > 6, rv.insight)

// ── 断签救援 ─────────────────────────────────────

console.log('\n断签救援')

const rNow = new Date(2026, 9, 27, 21, 0)
const rRec = { a: { '2026-10-24': true, '2026-10-25': true, '2026-10-26': true } }

const rs = RE.rescueState([{ id: 'a', name: '读书' }], rRec, rNow)
check('20 点后连续 3 天没打卡会触发', !!rs && rs.streak === 3 && rs.habitName === '读书',
  rs ? rs.message : 'null')
check('白天不触发',
  RE.rescueState([{ id: 'a', name: '读书' }], rRec, new Date(2026, 9, 27, 10, 0)) === null)

rRec.a['2026-10-27'] = true
check('今天已打卡不触发',
  RE.rescueState([{ id: 'a', name: '读书' }], rRec, rNow) === null)

// ── OCR 文本清洗 ─────────────────────────────────

console.log('\nOCR 文本清洗')

check('汉字之间的空格被合回去',
  OC.cleanText('明天 下 午 3 点 开会') === '明天下午3点开会',
  OC.cleanText('明天 下 午 3 点 开会'))
check('多行保持换行',
  OC.cleanText('周 五 交 报告\n今天 买 牛奶').split('\n').length === 2)
check('空文本安全', OC.cleanText('') === '')

// ── 习惯编辑与暂停 ─────────────────────────────────

console.log('\n习惯编辑与暂停')

// store 直接用 wx 存储；这里给个最小内存桩，不碰真实小程序环境
const mem = {}
global.wx = {
  getStorageSync: function (k) { return mem[k] },
  setStorageSync: function (k, v) { mem[k] = v }
}
const ST = require(path.join(__dirname, '..', 'utils', 'store.js'))

mem.habits = [
  { id: 'h1', name: '读书', icon: '📖', color: '#e8674a', createdAt: '' },
  { id: 'h2', name: '跑步', icon: '🏃', color: '#4a9e6f', type: 'timer', targetSeconds: 1800, archived: true, archivedAt: '2026-10-20T08:00:00.000Z' }
]
mem.records = { h1: { '2026-10-25': true }, h2: { '2026-10-20': true } }

check('老数据缺 archived 视为未暂停', ST.loadHabits()[0].archived === false)
check('已暂停标记能读回来', ST.loadHabits()[1].archived === true)

check('activeHabits 只返回未暂停',
  ST.activeHabits().length === 1 && ST.activeHabits()[0].id === 'h1')
check('今日看板不含暂停习惯',
  ST.todayBoard('2026-10-25').length === 1 && ST.todayBoard('2026-10-25')[0].id === 'h1')

const upd = ST.updateHabit('h1', { name: '读书 30 分钟', icon: '📚', color: '#4a7ab5', type: 'timer', targetSeconds: 1500 })
check('编辑改名/图标/颜色/时长',
  !!upd && upd.name === '读书 30 分钟' && upd.icon === '📚' && upd.color === '#4a7ab5' &&
  upd.type === 'timer' && upd.targetSeconds === 1500,
  upd ? upd.name + ' / ' + upd.targetSeconds + 's' : 'null')
check('编辑不动历史记录', ST.isDone('h1', '2026-10-25') === true)

check('空名字不覆盖原名', ST.updateHabit('h1', { name: '   ' }).name === '读书 30 分钟')
check('超过 12 字被截断', ST.updateHabit('h1', { name: '一二三四五六七八九十十一十二' }).name.length === 12,
  ST.loadHabits()[0].name.length + ' 字')
check('改回普通打卡会清空计时', ST.updateHabit('h1', { type: 'simple' }).targetSeconds === 0)
check('不存在的 id 返回 null', ST.updateHabit('nope', { name: 'x' }) === null)

ST.setArchived('h1', true)
check('暂停后不出现在今日看板', ST.todayBoard('2026-10-25').length === 0)
check('暂停不删打卡记录', ST.isDone('h1', '2026-10-25') === true)
check('暂停后 activeHabits 为空', ST.activeHabits().length === 0)

ST.setArchived('h1', false)
check('恢复后回到今日看板', ST.todayBoard('2026-10-25').length === 1)
check('恢复后 archivedAt 清空',
  ST.loadHabits().filter(function (h) { return h.id === 'h1' })[0].archivedAt === '')

// ── 海报折行与 2x 导出 ─────────────────────────────

console.log('\n海报折行与 2x')

const longDesc = '连续打卡二十一天并且每天都完成至少三个习惯，中间没有断过任何一天'
const twoLines = P.wrapText(longDesc, 24, 400, 2)
check('长描述折成两行', twoLines.length === 2, twoLines.join(' / '))
check('每行宽度不超限',
  twoLines.every(function (l) { return P.textWidth(l, 24) <= 400 }),
  twoLines.map(function (l) { return Math.round(P.textWidth(l, 24)) }).join(','))

const shortFit = P.fitLines('连续打卡 21 天', 436, 2)
check('短描述保持 24 号一行', shortFit.size === 24 && shortFit.lines.length === 1)

const longFit = P.fitLines(longDesc + longDesc, 436, 2)
check('超长描述自动降字号或截断', longFit.lines.length <= 2 &&
  longFit.size <= 24, longFit.size + '号 / ' + longFit.lines.length + '行')
check('截断时最后一行为省略号',
  P.wrapText('很长'.repeat(100), 24, 300, 1)[0].slice(-1) === '…')

const doubled = P.scaleConfig(posterCfg, 2)
check('2x 画布 1500×2400', doubled.width === 1500 && doubled.height === 2400,
  doubled.width + '×' + doubled.height)
check('2x 所有坐标都在画布内',
  doubled.ops.every(function (op) { return inBounds(doubled, op) }))
const firstText = doubled.ops.filter(function (op) { return op.type === 'text' })[0]
check('2x 文字字号同步放大', firstText.size > 40, 'size=' + firstText.size)

// ── 显示偏好 ─────────────────────────────────────

console.log('\n显示偏好')

const D = require(path.join(__dirname, '..', 'utils', 'display.js'))

check('默认跟随系统（无系统信息时回落浅色）', D.theme() === 'light', D.theme())
D.setTheme('dark')
check('手动切深色后保持', D.theme() === 'dark' && D.classes().themeClass === 'theme-dark')
D.toggleTheme()
check('再切回浅色', D.theme() === 'light' && D.classes().themeClass === '')

mem.display_font = 0
check('字号默认标准', D.fontLevel() === 0 && D.classes().fontClass === '')
D.cycleFont()
check('字号切到「大」', D.fontLevel() === 1 && D.classes().fontClass === 'font-lg')
D.cycleFont()
check('字号切到「特大」', D.fontLevel() === 2 && D.classes().fontClass === 'font-xl' && D.classes().fontLabel === '特大')
D.cycleFont()
check('循环回标准', D.fontLevel() === 0)

// ── AI 洞察 ─────────────────────────────────────

console.log('\nAI 洞察')

const INS = require(path.join(__dirname, '..', 'utils', 'insight.js'))
const insNow = new Date(2026, 9, 27, 10, 0) // 2026-10-27 周二
const insHabits = [
  { id: 'a', name: '读书' },
  { id: 'b', name: '跑步' }
]
const aOffsets = []
for (let i = 1; i <= 12; i++) aOffsets.push(i)

const insRecs = {
  a: rec(insNow, aOffsets),        // 连续 12 天，今天还没打（风险）
  b: rec(insNow, [27, 20, 13, 6])  // 近 4 周只打了 4 天（最弱）
}

const ins = INS.analyze(insHabits, insRecs, [], insNow)
check('识别断签风险习惯', !!ins.risk && ins.risk.id === 'a' && ins.risk.streak === 12,
  ins.risk ? ins.risk.name + ' ' + ins.risk.streak + ' 天' : 'null')
check('识别最弱习惯', !!ins.weakHabit && ins.weakHabit.id === 'b',
  ins.weakHabit ? ins.weakHabit.name + ' ' + ins.weakHabit.pct + '%' : 'null')
check('没有待办时下一件事是风险习惯',
  !!ins.next && ins.next.kind === 'habit' && ins.next.id === 'a')
check('洞察短句不超过 3 条', ins.lines.length > 0 && ins.lines.length <= 3, ins.lines.length + ' 条')

const insTasks = [
  { id: 't1', title: '低优先', date: '2026-10-27', status: 'active', priority: 1, durationMin: 30 },
  { id: 't2', title: '高优先', date: '2026-10-27', status: 'active', priority: 3, durationMin: 60 },
  { id: 't3', title: '做完的', date: '2026-10-27', status: 'done', priority: 3, durationMin: 60 }
]
const ins2 = INS.analyze(insHabits, insRecs, insTasks, insNow)
check('有待办时优先推高优先级',
  ins2.next && ins2.next.kind === 'task' && ins2.next.id === 't2',
  ins2.next ? ins2.next.name : 'null')
check('已完成待办不参与推荐', ins2.next.id !== 't3')

const manyTasks = []
for (let i = 0; i < 5; i++) {
  manyTasks.push({ id: 'm' + i, title: '事' + i, date: '2026-10-27', status: 'active', durationMin: 60 })
}
const ins3 = INS.analyze(insHabits, insRecs, manyTasks, insNow)
check('今日待办过载会提示', !!ins3.overload && ins3.overload.count === 5 && ins3.overload.minutes === 300,
  ins3.overload ? ins3.overload.count + ' 件 / ' + ins3.overload.minutes + ' 分钟' : 'null')

const insEmpty = INS.analyze([], {}, [], insNow)
check('没有习惯时不崩', insEmpty.lines.length === 0 && insEmpty.next === null)

// 教练与助手使用同一份洞察
check('教练优先引用具体洞察',
  C.buildCoachReply('今天该做什么', coachStats, ['「读书」连续 3 天，今天还没打卡']).indexOf('读书') >= 0)
check('教练上下文带上洞察',
  C.buildCoachContext(coachStats, ['「读书」连续 3 天']).indexOf('读书') >= 0)

const insSnap = {
  habits: [],
  stats: {},
  insight: { next: { kind: 'habit', id: 'a', name: '读书', reason: '连续 3 天' }, lines: ['甲', '乙'] }
}
check('助手能答「现在该做什么」',
  A.mockAgent('现在该做什么', insSnap).reply.indexOf('读书') >= 0)
check('助手能复述洞察',
  A.mockAgent('分析一下', insSnap).reply.indexOf('甲') >= 0)

// ── 计时持久化 / 备注 / 排序 / 迁移 ───────────────

console.log('\n计时持久化')

const tNow = 1000000
const tState = { habitId: 'h1', targetSeconds: 60, accumulated: 0, startedAt: tNow, running: true }
check('运行中已过 30 秒', T.elapsedOf(tState, tNow + 30000) === 30,
  T.elapsedOf(tState, tNow + 30000) + 's')

const tPaused = T.pause(tState, tNow + 30000)
check('暂停后累计保留、时间不再走',
  tPaused.running === false && T.elapsedOf(tPaused, tNow + 130000) === 30,
  T.elapsedOf(tPaused, tNow + 130000) + 's')

const tResumed = T.resume(tPaused, tNow + 200000)
check('继续后从暂停点接着走', T.elapsedOf(tResumed, tNow + 210000) === 40,
  T.elapsedOf(tResumed, tNow + 210000) + 's')

check('暂停两次不会重复累加', (function () {
  const a = T.pause(tResumed, tNow + 210000)
  const b = T.pause(a, tNow + 250000)
  return T.elapsedOf(b, tNow + 250000) === 40
})())

console.log('\n打卡备注与排序')

const noteRec = R.normalizeRecord({ value: true, completedAt: '2026-10-25T09:00:00.000Z', note: '今天只做了 10 分钟' })
check('备注能读回', !!noteRec && noteRec.note === '今天只做了 10 分钟')
check('取消的记录不保留备注', R.normalizeRecord({ value: false, note: 'x' }) === null)

mem.habits = [
  { id: 'a', name: 'A', icon: '✅', color: '#e8674a', order: 1 },
  { id: 'b', name: 'B', icon: '✅', color: '#4a9e6f', order: 0 }
]
check('按 order 排序', ST.loadHabits()[0].id === 'b', ST.loadHabits().map(function (h) { return h.id }).join(','))
check('下移会交换相邻顺序', ST.moveHabit('b', 1) === true && ST.loadHabits()[0].id === 'a')

mem.records = { a: { '2026-10-25': R.makeSimple('2026-10-25T09:00:00.000Z') } }
check('打卡备注写入并读回', ST.setRecordNote('a', '2026-10-25', '补一句备注') === true &&
  ST.todayBoard('2026-10-25').filter(function (h) { return h.id === 'a' })[0].note === '补一句备注')
check('没打卡不写备注', ST.setRecordNote('a', '2026-10-24', '幽灵备注') === false)

mem.schema_version = 0
check('迁移写入 schema 版本', ST.migrate() === true && Number(mem.schema_version) === 2,
  String(mem.schema_version))
check('迁移后再次调用不重复写', ST.migrate() === false)

console.log('\n' + (failed === 0 ? '全部通过' : failed + ' 项失败') + '\n')
process.exitCode = failed === 0 ? 0 : 1
