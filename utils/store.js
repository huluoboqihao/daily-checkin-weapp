/**
 * 习惯与打卡记录的本地存储
 *
 * 存储结构：
 *   habits  : [{ id, name, icon, color, type, targetSeconds, archived, archivedAt, createdAt }]
 *   records : { habitId: { 'YYYY-MM-DD': true } }
 *
 * 记录用「习惯 id → 日期字典」而不是「日期 → 习惯数组」：
 * 单个习惯的统计（连续天数、完成率）是最常查的东西，
 * 按习惯分组之后就是一次字典查找，不用遍历所有日期。
 */

const presets = require('./presets.js')
const hb = require('./habit.js')
const R = require('./record.js')

const HABITS_KEY = 'habits'
const RECORDS_KEY = 'records'
const UNLOCKS_KEY = 'achievement_unlocks'
const SCHEMA_KEY = 'schema_version'
const SCHEMA_VERSION = 2
const TIMER_KEY = 'timer_state'

/**
 * 内置的一套图标和配色，新建习惯时轮着用。
 * 图标要覆盖到预设习惯库（utils/presets.js）里用到的那些，
 * 否则用户从推荐里加完习惯、想改图标时会发现选不到同一个。
 */
const ICONS = [
  '☀', '🌙', '📖', '📚', '✍', '🎧', '📝', '💻',
  '🏃', '💪', '🧘', '👟', '🥗', '💧', '🍳', '💰',
  '✅', '📋', '⏱', '📥', '🔍', '🎯', '🔥', '🏆'
]
const COLORS = ['#e8674a', '#4a9e6f', '#4a7ab5', '#c79a3a', '#8a6bb5', '#c25a7a']

/**
 * 读习惯列表，顺手补齐后来才加的字段。
 * type 缺失的老习惯一律当普通打卡；targetSeconds 只对计时习惯有意义。
 * archived 缺失当未暂停 —— 老数据不该因为新字段被判成隐藏。
 */
function loadHabits() {
  try {
    const a = wx.getStorageSync(HABITS_KEY)
    if (!a || !a.length) return []
    return a.map(function (h, i) {
      const type = h.type === 'timer' ? 'timer' : 'simple'
      const target = Number(h.targetSeconds)
      const archived = h.archived === true
      const order = Number(h.order)
      return Object.assign({}, h, {
        type: type,
        targetSeconds: type === 'timer' && target > 0 ? Math.round(target) : 0,
        archived: archived,
        archivedAt: archived ? String(h.archivedAt || '') : '',
        // 没排过序的老习惯按原数组顺序补一个，保证顺序稳定
        order: isFinite(order) ? order : i
      })
    }).sort(function (x, y) { return x.order - y.order })
  } catch (e) {
    return []
  }
}

function saveHabits(list) {
  try {
    wx.setStorageSync(HABITS_KEY, list)
    return true
  } catch (e) {
    return false
  }
}

function loadRecords() {
  try {
    return wx.getStorageSync(RECORDS_KEY) || {}
  } catch (e) {
    return {}
  }
}

function saveRecords(r) {
  try {
    wx.setStorageSync(RECORDS_KEY, r)
  } catch (e) {
    /* 存储失败静默 —— 打卡不该因为存储问题中断用户操作 */
  }
}

// ── 待办（一次性事项）──────────────────────────────
//
// 和习惯分开存：习惯是「每天/每周重复」，待办是「某天某时做一次」。
// 混在一起会让连续天数被一次性任务打断。

const TASKS_KEY = 'tasks'

function loadTasks() {
  try {
    const a = wx.getStorageSync(TASKS_KEY)
    return a && a.length ? a : []
  } catch (e) {
    return []
  }
}

function saveTasks(list) {
  try {
    wx.setStorageSync(TASKS_KEY, list)
    return true
  } catch (e) {
    return false
  }
}

function addTask(t) {
  const list = loadTasks()
  const src = t || {}
  const id = 't' + Date.now() + Math.floor(Math.random() * 1000)
  list.push({
    id: id,
    title: String(src.title || '').trim().slice(0, 24),
    date: src.date || '',
    startTime: src.startTime || '',
    durationMin: Math.max(10, Math.round(Number(src.durationMin) || 30)),
    location: String(src.location || '').slice(0, 12),
    priority: [1, 2, 3].indexOf(Number(src.priority)) >= 0 ? Number(src.priority) : 2,
    source: src.source || 'manual',
    status: 'active',
    createdAt: new Date().toISOString(),
    completedAt: ''
  })
  saveTasks(list)
  return id
}

function updateTask(id, patch) {
  const list = loadTasks()
  let hit = null
  const next = list.map(function (t) {
    if (t.id !== id) return t
    hit = Object.assign({}, t, patch || {})
    return hit
  })
  if (hit) saveTasks(next)
  return hit
}

function removeTask(id) {
  const list = loadTasks().filter(function (t) { return t.id !== id })
  saveTasks(list)
}

function toggleTask(id) {
  const list = loadTasks()
  let done = false
  const next = list.map(function (t) {
    if (t.id !== id) return t
    done = t.status !== 'done'
    return Object.assign({}, t, {
      status: done ? 'done' : 'active',
      completedAt: done ? new Date().toISOString() : ''
    })
  })
  saveTasks(next)
  return done
}

/** 某天的待办，按时间排序；没有时间的排最后 */
function tasksByDate(dateKeyStr) {
  return loadTasks()
    .filter(function (t) { return t.date === dateKeyStr })
    .sort(function (a, b) {
      if (!a.startTime && !b.startTime) return 0
      if (!a.startTime) return 1
      if (!b.startTime) return -1
      return a.startTime < b.startTime ? -1 : 1
    })
}

/**
 * 首次打开时铺一套示例数据：几个习惯 + 一段打卡记录。
 *
 * 习惯清单来自 presets.js 的 SEED_NAMES —— 学习/工作/健身/生活四类各挑一两条，
 * 覆盖到但别塞太多（十几条一上来就要用户删，反而劝退）。
 * 想要更多可以去「习惯」页的推荐区加。
 *
 * 记录也要铺：只给空习惯的话，首屏是三条零、热力图全空、成就墙全锁着，
 * 用户看不出这个 app 在干什么。
 *
 * ⚠️ **记录是示例数据，不是用户真做过的**，界面上有说明（见统计页）。
 *
 * 两个判据分开，是为了照顾「之前打开过、已经有习惯」的用户：
 *   习惯 —— 一条都没有才播种
 *   记录 —— **一条都没有**才铺
 * 已经打过卡的人不会被灌进假历史。
 */
function ensureSeed() {
  let list = loadHabits()

  if (!list.length) {
    list = presets.seedHabits().map(function (p, i) {
      return {
        id: 'h' + Date.now() + i,
        name: p.name,
        icon: p.icon,
        color: p.color,
        archived: false,
        archivedAt: '',
        order: i,
        createdAt: ''
      }
    })
    saveHabits(list)
  }

  const records = loadRecords()
  if (!Object.keys(records).length && list.length) {
    const today = new Date()

    list.forEach(function (h, i) {
      // 习惯可能多于预设的六种（用户自己加过），那就循环用这些节奏
      const offsets = presets.SEED_RECORDS[i % presets.SEED_RECORDS.length] || []
      const rec = {}
      offsets.forEach(function (o) {
        rec[hb.dateKey(hb.shiftDays(today, -o))] = R.makeSimple()
      })
      records[h.id] = rec
    })

    saveRecords(records)
  }

  return list
}

/**
 * 新建习惯。
 * opts.type = 'timer' 时是计时打卡，opts.targetSeconds 是目标秒数（至少 60）。
 */
function addHabit(name, icon, color, opts) {
  const list = loadHabits()
  const id = 'h' + Date.now() + Math.floor(Math.random() * 1000)
  const o = opts || {}
  const type = o.type === 'timer' ? 'timer' : 'simple'
  const target = Math.max(60, Math.round(Number(o.targetSeconds) || 0))

  list.push({
    id: id,
    name: name,
    icon: icon || ICONS[list.length % ICONS.length],
    color: color || COLORS[list.length % COLORS.length],
    type: type,
    targetSeconds: type === 'timer' ? target : 0,
    archived: false,
    archivedAt: '',
    order: list.length,
    createdAt: ''
  })
  saveHabits(list)
  return id
}

/**
 * 调整顺序：delta = -1 上移，+1 下移。
 * 存 order 而不是靠数组位置 —— 以后加筛选/分组时顺序不会乱。
 */
function moveHabit(id, delta) {
  const list = loadHabits()
  const i = list.findIndex(function (h) { return h.id === id })
  const j = i + (delta < 0 ? -1 : 1)
  if (i < 0 || j < 0 || j >= list.length) return false

  const tmp = list[i]
  list[i] = list[j]
  list[j] = tmp
  list.forEach(function (h, idx) { h.order = idx })
  saveHabits(list)
  return true
}

/**
 * 存储迁移。现在只有「补 order」这一步，但先把版本号立起来：
 * 以后加字段就在 switch 里补一个分支，不用在读取处到处兜底。
 */
function migrate() {
  try {
    const from = Number(wx.getStorageSync(SCHEMA_KEY)) || 0
    if (from >= SCHEMA_VERSION) return false

    const list = loadHabits()
    let dirty = false
    list.forEach(function (h, i) {
      if (Number(h.order) !== i) {
        h.order = i
        dirty = true
      }
    })
    if (dirty) saveHabits(list)

    // 待办补默认值（老版本可能缺 durationMin / priority）
    const tasks = loadTasks().map(function (t) {
      return Object.assign({ durationMin: 30, location: '', priority: 2 }, t)
    })
    saveTasks(tasks)

    wx.setStorageSync(SCHEMA_KEY, SCHEMA_VERSION)
    return true
  } catch (e) {
    return false
  }
}

/**
 * 改一个习惯的名称/图标/颜色/打卡方式/时长。
 *
 * 记录按 habitId 存，改名换图标不会动历史 —— 这正是要支持编辑的原因：
 * 以前只能删了重建，历史会一起没。
 * name 传空字符串视为「没改」，避免编辑时误清空。
 */
function updateHabit(id, patch) {
  const p = patch || {}
  let hit = null

  const next = loadHabits().map(function (h) {
    if (h.id !== id) return h

    let name = h.name
    if (p.name !== undefined) {
      const n = String(p.name).trim()
      if (n) name = n.slice(0, 12)
    }

    const type = p.type !== undefined ? (p.type === 'timer' ? 'timer' : 'simple') : h.type
    let target = h.targetSeconds
    if (type === 'timer') {
      const t = p.targetSeconds !== undefined ? Number(p.targetSeconds) : target
      target = Math.max(60, Math.round(t || 0))
    } else {
      target = 0
    }

    hit = Object.assign({}, h, {
      name: name,
      icon: p.icon !== undefined ? String(p.icon) : h.icon,
      color: p.color !== undefined ? String(p.color) : h.color,
      type: type,
      targetSeconds: target
    })
    return hit
  })

  if (hit) saveHabits(next)
  return hit
}

/**
 * 暂停 / 恢复。
 * 暂停只影响「今天还显不显示」，打卡记录一条不删 —— 和删除的区别就在这里。
 */
function setArchived(id, archived) {
  let hit = null
  const next = loadHabits().map(function (h) {
    if (h.id !== id) return h
    hit = Object.assign({}, h, {
      archived: !!archived,
      archivedAt: archived ? new Date().toISOString() : ''
    })
    return hit
  })
  if (hit) saveHabits(next)
  return hit
}

/** 今日页只认未暂停的习惯 */
function activeHabits() {
  return loadHabits().filter(function (h) { return !h.archived })
}

function removeHabit(id) {
  const list = loadHabits().filter(function (h) { return h.id !== id })
  saveHabits(list)

  // 记录也一起删掉 —— 不然会一直占着存储，而且用户重建同名习惯时
  // 可能被旧记录「继承」了连续天数，那是个很怪的 bug
  const r = loadRecords()
  delete r[id]
  saveRecords(r)
}

// ── 计时状态（落盘，离开页面不丢）──────────────────
function loadTimer() {
  try {
    const t = wx.getStorageSync(TIMER_KEY)
    return t && t.habitId ? t : null
  } catch (e) {
    return null
  }
}

function saveTimer(state) {
  try {
    if (state) wx.setStorageSync(TIMER_KEY, state)
    else wx.removeStorageSync(TIMER_KEY)
  } catch (e) { /* ignore */ }
}

function getRecord(habitId) {
  const r = loadRecords()
  return r[habitId] || {}
}

function isDone(habitId, dateKeyStr) {
  return R.isMarked(getRecord(habitId)[dateKeyStr])
}

/** 直接写一条记录（计时完成时用），value 必须是 record.js 的合法结构 */
function setRecord(habitId, dateKeyStr, value) {
  const r = loadRecords()
  const rec = r[habitId] || {}
  if (value === null || value === undefined) delete rec[dateKeyStr]
  else rec[dateKeyStr] = value
  r[habitId] = rec
  saveRecords(r)
  return R.isMarked(rec[dateKeyStr])
}

/** 打卡 / 取消打卡。返回切换后的状态 */
function toggle(habitId, dateKeyStr) {
  const r = loadRecords()
  const rec = r[habitId] || {}
  const now = !R.isMarked(rec[dateKeyStr])
  if (now) rec[dateKeyStr] = R.makeSimple(new Date().toISOString())
  else delete rec[dateKeyStr]
  r[habitId] = rec
  saveRecords(r)
  return now
}

/** 今天所有**未暂停**习惯的完成情况。暂停的仍留在统计页历史里 */
function todayBoard(dateKeyStr) {
  const habits = activeHabits()
  return habits.map(function (h) {
    const rec = R.normalizeRecord(getRecord(h.id)[dateKeyStr])
    return {
      id: h.id,
      name: h.name,
      icon: h.icon,
      color: h.color,
      type: h.type,
      targetSeconds: h.targetSeconds,
      done: !!rec,
      note: rec && rec.note ? rec.note : ''
    }
  })
}

/** 给某天的打卡补一条备注；没打卡就不写，避免制造“幽灵记录” */
function setRecordNote(habitId, dateKeyStr, note) {
  const r = loadRecords()
  const rec = r[habitId] || {}
  const norm = R.normalizeRecord(rec[dateKeyStr])
  if (!norm) return false

  const next = Object.assign({}, norm)
  const n = String(note || '').trim().slice(0, 60)
  if (n) next.note = n
  else delete next.note

  rec[dateKeyStr] = next
  r[habitId] = rec
  saveRecords(r)
  return true
}

function iconAt(i) { return ICONS[i % ICONS.length] }
function colorAt(i) { return COLORS[i % COLORS.length] }

// ── 成就解锁记录 ────────────────────────────────────
//
// 存 { 成就id: 'YYYY-MM-DD' }。
//
// 为什么不每次从记录里重算：指标是派生出来的，删掉一个习惯会让
// 「累计打卡次数」回落，纯派生的话已经拿到的成就会退回未解锁 ——
// 明明做到过却显示没做到。所以一旦达成写下来，就永久保留。

function loadUnlocks() {
  try {
    const u = wx.getStorageSync(UNLOCKS_KEY)
    return u && typeof u === 'object' ? u : {}
  } catch (e) {
    return {}
  }
}

function saveUnlocks(u) {
  try {
    wx.setStorageSync(UNLOCKS_KEY, u)
    return true
  } catch (e) {
    return false
  }
}

/**
 * 把新达成的成就记下来，**已经记过的不再动**（日期保持首次达成那天）。
 * 返回是否写入了新内容。
 *
 * 日期传的是「今天」——也就是 App 发现它的那天，不等于真正达成的那天
 *（那几天没打开小程序就会偏）。界面上措辞用「达成于」而不是「完成于」。
 */
function recordUnlocks(evaluated, dateKeyStr) {
  const unlocks = loadUnlocks()
  let changed = false

  ;(evaluated || []).forEach(function (a) {
    if (a.unlocked && !unlocks[a.id]) {
      unlocks[a.id] = dateKeyStr
      changed = true
    }
  })

  if (changed) saveUnlocks(unlocks)
  return changed
}

module.exports = {
  ICONS: ICONS,
  COLORS: COLORS,
  iconAt: iconAt,
  colorAt: colorAt,
  ensureSeed: ensureSeed,
  migrate: migrate,
  loadHabits: loadHabits,
  activeHabits: activeHabits,
  addHabit: addHabit,
  updateHabit: updateHabit,
  setArchived: setArchived,
  moveHabit: moveHabit,
  removeHabit: removeHabit,
  getRecord: getRecord,
  loadTimer: loadTimer,
  saveTimer: saveTimer,
  isDone: isDone,
  setRecord: setRecord,
  setRecordNote: setRecordNote,
  toggle: toggle,
  todayBoard: todayBoard,
  loadUnlocks: loadUnlocks,
  recordUnlocks: recordUnlocks,
  loadTasks: loadTasks,
  addTask: addTask,
  updateTask: updateTask,
  removeTask: removeTask,
  toggleTask: toggleTask,
  tasksByDate: tasksByDate
}
