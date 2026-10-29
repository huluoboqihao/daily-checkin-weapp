const hb = require('../../utils/habit.js')
const store = require('../../utils/store.js')
const ach = require('../../utils/achievement.js')
const T = require('../../utils/timer.js')
const R = require('../../utils/record.js')
const AG = require('../../utils/agent.js')
const ai = require('../../services/ai.js')
const schedule = require('../../utils/schedule.js')
const rescue = require('../../utils/rescue.js')
const display = require('../../utils/display.js')
const insight = require('../../utils/insight.js')

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六']

/** 成就区最多显示几个徽章，多的收成「+N」 */
const MAX_BADGES = 5

Page({
  data: {
    board: [],
    total: 0,
    doneCount: 0,
    pct: 0,
    dateLabel: '',
    stats: { totalCheckins: 0, bestStreak: 0, activeDays: 0 },
    week: [],
    badges: [],
    moreCount: 0,
    next: null,
    timer: null,
    timerId: '',
    timerClock: '00:00',
    timerPct: 0,
    timerMet: false,
    timerRing: '',
    agentInput: '',
    agentReply: '',
    agentBusy: false,
    todayTasks: [],
    upcomingTasks: [],
    overdueTasks: [],
    overdueCount: 0,
    taskConflicts: {},
    rescue: null,
    editingTask: null,
    noteEditing: null,
    themeClass: '',
    fontClass: '',
    fontLabel: '标准',
    isDark: false,
    guideVisible: false,
    aiPanel: false,
    animClass: '',
    popId: ''
  },

  // 用 onShow：从「习惯」页加完习惯返回时要刷新
  onShow() {
    this.applyDisplay()
    this.refresh()
    this.restoreTimer()

    // 入场动画只在第一次进入时播，切 Tab 回来不再重播
    if (!this._entered) {
      this._entered = true
      this.setData({ animClass: 'anim-rise' })
      setTimeout(() => this.setData({ animClass: '' }), 700)
    }
  },

  applyDisplay() {
    this.setData(display.classes())
    display.applyChrome()

    // 新手引导只在没关过的时候出现
    let seen = false
    try { seen = wx.getStorageSync('guide_seen_v1') === '1' } catch (e) { /* ignore */ }
    this.setData({ guideVisible: !seen })
  },

  dismissGuide() {
    try { wx.setStorageSync('guide_seen_v1', '1') } catch (e) { /* ignore */ }
    this.setData({ guideVisible: false })
  },

  tryGuide() {
    this.dismissGuide()
    this.goImport()
  },

  toggleTheme() {
    display.toggleTheme()
    this.applyDisplay()
  },

  cycleFont() {
    display.cycleFont()
    this.applyDisplay()
    wx.showToast({ title: '字号：' + display.classes().fontLabel, icon: 'none' })
  },

  // 离开页面先暂停并落盘：回来能接着计时，不再一刀切丢掉
  onHide() {
    this.pauseTimer()
  },

  onUnload() {
    this.pauseTimer()
  },

  /** 本周条：最近 7 天，任意习惯有打卡就点亮，全勤再单独标一下 */
  buildWeek(board, recs, today) {
    const out = []
    for (let i = 6; i >= 0; i--) {
      const d = hb.shiftDays(today, -i)
      const k = hb.dateKey(d)
      let done = 0

      board.forEach(function (h) {
        if ((recs[h.id] || {})[k]) done++
      })

      out.push({
        key: k,
        wd: WEEKDAY[d.getDay()],
        done: done > 0,
        full: board.length > 0 && done === board.length,
        isToday: i === 0
      })
    }
    return out
  },

  /**
   * 把所有要显示的东西一次算出来。
   * refresh 和 toggle 都走这里，避免两处各算一遍算出不一样的结果。
   */
  collect() {
    const today = new Date()
    const todayK = hb.dateKey(today)

    const board = store.todayBoard(todayK).map(function (h) {
      const rec = store.getRecord(h.id)
      return Object.assign({}, h, { streak: hb.streak(rec, today) })
    })

    // 每个习惯的记录取一次就够了，下面本周条复用
    const recs = {}
    board.forEach(function (h) { recs[h.id] = store.getRecord(h.id) })

    // 累计统计与统计页保持同一口径：包含已暂停习惯的历史，
    // 否则暂停一个习惯后，两个页面的「累计打卡」会对不上
    const allHabits = store.loadHabits()
    const allRecs = {}
    allHabits.forEach(function (h) { allRecs[h.id] = store.getRecord(h.id) })
    const stats = hb.aggregate(allHabits, allRecs, today)
    stats.tasksDone = store.loadTasks().filter(function (t) { return t.status === 'done' }).length

    let done = 0
    board.forEach(function (h) { if (h.done) done++ })

    const evaluated = ach.applyUnlocks(ach.evaluate(stats), store.loadUnlocks())
    const unlocked = ach.unlockedList(evaluated)

    // 徽章按「最近拿到的」排前面 —— 用户刚解锁的那个最想看到
    const badges = unlocked.slice().sort(function (a, b) {
      return String(b.unlockedAt || '').localeCompare(String(a.unlockedAt || ''))
    }).slice(0, MAX_BADGES)

    const todayTasks = store.tasksByDate(todayK).map(function (t) {
      return Object.assign({}, t, { done: t.status === 'done' })
    })

    const upcomingTasks = store.loadTasks()
      .filter(function (t) { return t.status !== 'done' && t.date && t.date > todayK })
      .sort(function (a, b) {
        const ka = a.date + (a.startTime || '99:99')
        const kb = b.date + (b.startTime || '99:99')
        return ka < kb ? -1 : 1
      })
      .slice(0, 3)
      .map(function (t) {
        return Object.assign({}, t, { dateLabel: t.date.slice(5) })
      })

    // 过期区：日期早于今天、还没做完。之前这些只藏在「接下来」里被过滤掉，
    // 等于悄悄消失；现在单独列出来，可直接完成或挪到今天
    const allOverdue = store.loadTasks()
      .filter(function (t) { return t.status !== 'done' && t.date && t.date < todayK })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1 })
    const todayDate = hb.parseKey(todayK)
    const overdueTasks = allOverdue.slice(0, 5).map(function (t) {
      const d = hb.parseKey(t.date)
      const diff = todayDate && d ? Math.round((todayDate - d) / 86400000) : 0
      return Object.assign({}, t, {
        dateLabel: t.date.slice(5),
        overdueDays: diff > 0 ? diff : 1
      })
    })

    // 今日 + 接下来的冲突一起算，避免「接下来」里重叠了却没有任何提示
    const taskConflicts = {}
    schedule.detect(todayTasks.concat(upcomingTasks), { now: today }).forEach(function (c) {
      taskConflicts[c.id] = c
    })

    // 救援卡当天关掉就不再出现，第二天重新计算
    const rescueDismissed = wx.getStorageSync('rescue_dismissed') === todayK

    return {
      board: board,
      todayK: todayK,
      todayTasks: todayTasks,
      upcomingTasks: upcomingTasks,
      overdueTasks: overdueTasks,
      overdueCount: allOverdue.length,
      taskConflicts: taskConflicts,
      rescue: rescueDismissed ? null : rescue.rescueState(board, recs, today),
      total: board.length,
      doneCount: done,
      pct: board.length ? Math.round((done * 100) / board.length) : 0,
      dateLabel: (today.getMonth() + 1) + '月' + today.getDate() + '日 周' + WEEKDAY[today.getDay()],
      stats: {
        totalCheckins: stats.totalCheckins,
        bestStreak: stats.bestStreak,
        activeDays: stats.activeDays,
        weekCheckins: stats.weekCheckins,
        weekActiveDays: stats.weekActiveDays,
        monthCheckins: stats.monthCheckins,
        monthActiveDays: stats.monthActiveDays,
        tasksDone: stats.tasksDone
      },
      week: this.buildWeek(board, recs, today),
      evaluated: evaluated,
      badges: badges,
      moreCount: Math.max(0, unlocked.length - badges.length),
      next: ach.nextUp(evaluated),
      unlockedIds: unlocked.map(function (a) { return a.id })
    }
  },

  refresh() {
    const d = this.collect()

    const known = {}
    d.unlockedIds.forEach(function (id) { known[id] = true })
    this.known = known

    // 新达成的写进持久化记录（已记过的不动）
    store.recordUnlocks(d.evaluated, d.todayK)
    this.setData(d)
  },

  rescueCheckin() {
    const r = this.data.rescue
    if (!r) return
    store.toggle(r.habitId, hb.dateKey(new Date()))
    if (wx.vibrateShort) wx.vibrateShort({ type: 'medium' })
    this.refresh()
    wx.showToast({ title: '守住了', icon: 'success' })
  },

  dismissRescue() {
    const todayK = this.data.todayK || hb.dateKey(new Date())
    try { wx.setStorageSync('rescue_dismissed', todayK) } catch (e) { /* ignore */ }
    this.setData({ rescue: null })
  },

  toggleTask(e) {
    store.toggleTask(e.currentTarget.dataset.id)
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' })
    this.refresh()
  },

  // ── 待办编辑 ──────────────────────────────────────

  newTask() {
    this.setData({
      editingTask: {
        id: '', isNew: true, title: '', date: hb.dateKey(new Date()),
        startTime: '', durationMin: 30, location: '', priority: 2
      }
    })
  },

  openEdit(e) {
    const id = e.currentTarget.dataset.id
    const t = (this.data.todayTasks || [])
      .concat(this.data.upcomingTasks || [])
      .concat(this.data.overdueTasks || [])
      .filter(function (x) { return x.id === id })[0]
    if (!t) return
    this.setData({
      editingTask: {
        id: t.id, isNew: false, title: t.title, date: t.date,
        startTime: t.startTime || '',
        durationMin: t.durationMin || 30,
        location: t.location || '',
        priority: t.priority || 2
      }
    })
  },

  // ── 打卡备注 ─────────────────────────────────────

  openNote(e) {
    const id = e.currentTarget.dataset.id
    const h = (this.data.board || []).filter(function (x) { return x.id === id })[0]
    if (!h) return
    if (!h.done) {
      wx.showToast({ title: '先打卡，再写备注', icon: 'none' })
      return
    }
    this.setData({ noteEditing: { id: h.id, name: h.name, note: h.note || '' } })
  },

  onNoteInput(e) {
    this.setData({ 'noteEditing.note': e.detail.value })
  },

  saveNote() {
    const n = this.data.noteEditing
    if (!n) return
    store.setRecordNote(n.id, hb.dateKey(new Date()), n.note)
    this.setData({ noteEditing: null })
    this.refresh()
    wx.showToast({ title: '备注已保存', icon: 'success' })
  },

  cancelNote() {
    this.setData({ noteEditing: null })
  },

  /** 待办转习惯：打卡记录从今天重新开始，原待办删除 */
  taskToHabit() {
    const t = this.data.editingTask
    if (!t || t.isNew) return
    const name = String(t.title || '').trim().slice(0, 12)
    if (!name) {
      wx.showToast({ title: '标题不能为空', icon: 'none' })
      return
    }

    const exists = store.loadHabits().some(function (h) { return h.name === name })
    const self = this
    wx.showModal({
      title: '转为习惯',
      content: exists
        ? '已有同名习惯「' + name + '」，这条待办会被删除。'
        : '「' + name + '」会变成每天打卡的习惯，这条待办会被删除。',
      confirmText: '转换',
      success: function (r) {
        if (!r.confirm) return
        if (!exists) store.addHabit(name, '', '')
        store.removeTask(t.id)
        self.setData({ editingTask: null })
        self.refresh()
        wx.showToast({ title: exists ? '已删除待办' : '已转为习惯', icon: 'success' })
      }
    })
  },

  onEditField(e) {
    if (!this.data.editingTask) return
    const field = e.currentTarget.dataset.field || 'title'
    const patch = {}
    patch['editingTask.' + field] = e.detail.value
    this.setData(patch)
  },

  onEditPriority(e) {
    const v = Number(e.currentTarget.dataset.v)
    if ([1, 2, 3].indexOf(v) < 0) return
    this.setData({ 'editingTask.priority': v })
  },

  /** 过期待办挪到今天，日期变了就回到今日区 */
  moveToToday(e) {
    const id = e.currentTarget.dataset.id
    store.updateTask(id, { date: hb.dateKey(new Date()) })
    this.refresh()
    wx.showToast({ title: '已移到今天', icon: 'none' })
  },

  onEditDate(e) {
    this.setData({ 'editingTask.date': e.detail.value })
  },

  onEditTime(e) {
    this.setData({ 'editingTask.startTime': e.detail.value })
  },

  saveEdit() {
    const t = this.data.editingTask
    if (!t) return
    const title = String(t.title || '').trim()
    if (!title) {
      wx.showToast({ title: '标题不能为空', icon: 'none' })
      return
    }
    const dur = Math.round(Number(t.durationMin))
    if (!isFinite(dur) || dur < 10 || dur > 600) {
      wx.showToast({ title: '时长填 10–600 分钟', icon: 'none' })
      return
    }

    const priority = [1, 2, 3].indexOf(Number(t.priority)) >= 0 ? Number(t.priority) : 2

    const patch = {
      title: title.slice(0, 24),
      date: t.date,
      startTime: t.startTime,
      durationMin: dur,
      location: String(t.location || '').trim().slice(0, 12),
      priority: priority
    }

    if (t.isNew) store.addTask(patch)
    else store.updateTask(t.id, patch)

    this.setData({ editingTask: null })
    this.refresh()
    wx.showToast({ title: t.isNew ? '已添加' : '已保存', icon: 'success' })
  },

  deleteTask() {
    const t = this.data.editingTask
    if (!t) return
    const self = this
    wx.showModal({
      title: '删除待办',
      content: '「' + t.title + '」会从列表里移除，不可恢复。',
      confirmText: '删除',
      confirmColor: '#FF3B30',
      success: function (r) {
        if (!r.confirm) return
        store.removeTask(t.id)
        self.setData({ editingTask: null })
        self.refresh()
      }
    })
  },

  closeEdit() {
    this.setData({ editingTask: null })
  },

  noop() {},

  onShareAppMessage() {
    return {
      title: '日常打卡 · 今天也坚持一下',
      path: '/pages/index/index'
    }
  },

  goImport() {
    wx.navigateTo({ url: '/pages/import/import' })
  },

  /** 一个入口收拢 AI 能力：导入 / 教练 / 生成习惯 / 周报 */
  openAiPanel() {
    this.setData({ aiPanel: true })
  },

  closeAiPanel() {
    this.setData({ aiPanel: false })
  },

  aiPanelPick(e) {
    const i = Number(e.currentTarget.dataset.i)
    this.setData({ aiPanel: false })
    if (i === 0) this.goImport()
    else if (i === 1) wx.switchTab({ url: '/pages/stats/stats' })
    else if (i === 2) wx.switchTab({ url: '/pages/habits/habits' })
    else if (i === 3) {
      try { wx.setStorageSync('open_weekly', '1') } catch (e) { /* ignore */ }
      wx.switchTab({ url: '/pages/stats/stats' })
    }
  },

  toggle(e) {
    const id = e.currentTarget.dataset.id
    const habit = (this.data.board || []).filter(function (h) { return h.id === id })[0]

    // 计时习惯走计时器，不直接写记录
    if (habit && habit.type === 'timer') {
      this.timerTap(habit)
      return
    }

    this.checkin(id)
  },

  checkin(id) {
    const todayK = hb.dateKey(new Date())
    const nowDone = store.toggle(id, todayK)
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' })

    // 整页重算而不是只改这一行：一次打卡可能刚好凑够某个成就，
    // 徽章、进度、累计统计都要跟着变。习惯就几条，重算的开销可以忽略
    const d = this.collect()

    const prev = this.known || {}
    const fresh = d.unlockedIds.filter(function (aid) { return !prev[aid] })

    const known = {}
    d.unlockedIds.forEach(function (aid) { known[aid] = true })
    this.known = known

    store.recordUnlocks(d.evaluated, d.todayK)
    this.setData(d)

    // 取消打卡不弹反馈；完成时给一下「+1」的视觉回弹
    if (!nowDone) return
    this.setData({ popId: id })
    setTimeout(() => this.setData({ popId: '' }), 360)

    if (fresh.length) {
      const a = d.evaluated.filter(function (x) { return x.id === fresh[0] })[0]
      wx.showToast({
        title: '🏅 解锁「' + (a ? a.name : '成就') + '」',
        icon: 'none',
        duration: 2000
      })
      return
    }

    // 平时也要有反馈：连续天数 + 本周次数；差一点就报下一次周成就
    const h = (d.board || []).filter(function (x) { return x.id === id })[0]
    const week = (d.stats && d.stats.weekCheckins) || 0
    const next = d.next
    let msg = ''

    if (next && next.period === '每周' && next.target > next.progress) {
      msg = '本周 ' + week + ' 次 · 再 ' + (next.target - next.progress) + ' 次拿「' + next.name + '」'
    } else if (h && h.streak > 1) {
      msg = '「' + h.name + '」连续 ' + h.streak + ' 天 · 本周 ' + week + ' 次'
    } else {
      msg = '「' + h.name + '」完成 · 本周 ' + week + ' 次'
    }

    wx.showToast({ title: msg, icon: 'none', duration: 1800 })
  },

  // ── 计时打卡 ──────────────────────────────────────

  timerTap(habit) {
    const t = this.data.timer
    if (!t) {
      this.startTimer(habit)
      return
    }
    if (t.habitId !== habit.id) {
      wx.showToast({ title: '先结束「' + t.name + '」的计时', icon: 'none' })
      return
    }
    if (this.data.timerMet) {
      this.finishTimer()
      return
    }
    // 时间没到就点卡片 = 暂停/继续，比再去找按钮快
    if (t.running) this.pauseTimer()
    else this.resumeTimer()
  },

  startTimer(habit) {
    const target = Math.max(60, Number(habit.targetSeconds) || 60)
    const state = {
      habitId: habit.id,
      name: habit.name,
      targetSeconds: target,
      targetLabel: T.formatClock(target),
      dateKey: hb.dateKey(new Date()),
      accumulated: 0,
      startedAt: Date.now(),
      running: true
    }
    this._timerNotified = false
    store.saveTimer(state)

    this.setData({
      timer: state,
      timerId: habit.id,
      timerMet: false,
      timerPct: 0,
      timerClock: '00:00'
    })
    this.tick()
    this.runTimerInterval()
  },

  runTimerInterval() {
    if (this._timer) clearInterval(this._timer)
    this._timer = setInterval(() => this.tick(), 1000)
  },

  tick() {
    const t = this.data.timer
    if (!t) return

    const elapsed = T.elapsedOf(t, Date.now())
    const pct = T.progressPct(elapsed, t.targetSeconds)
    const met = T.isDurationMet(elapsed, t.targetSeconds)

    this.setData({
      timerClock: T.formatClock(elapsed),
      timerPct: pct,
      timerMet: met,
      timerRing: 'background: conic-gradient(' + (t.running ? '#e8674a' : '#c7c7cc') + ' ' + pct + '%, #f1e9df 0)'
    })

    // 页面前台的到点提醒；后台推送需要订阅消息，这里不假装有
    if (met && t.running && !this._timerNotified) {
      this._timerNotified = true
      if (wx.vibrateLong) wx.vibrateLong()
      wx.showToast({ title: '目标达成，可以点完成', icon: 'none', duration: 2500 })
    }
  },

  pauseTimer() {
    const t = this.data.timer
    if (!t) return
    const next = T.pause(t, Date.now())
    store.saveTimer(next)
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
    this.setData({ timer: next })
    this.tick()
  },

  resumeTimer() {
    const t = this.data.timer
    if (!t) return
    const next = T.resume(t, Date.now())
    this._timerNotified = false
    store.saveTimer(next)
    this.setData({ timer: next })
    this.runTimerInterval()
    this.tick()
  },

  /** 回到页面时恢复昨天的作废；今天的状态保持暂停，由用户决定继续 */
  restoreTimer() {
    const saved = store.loadTimer()
    if (!saved) return

    const todayK = hb.dateKey(new Date())
    if (saved.dateKey !== todayK || !(Number(saved.targetSeconds) > 0)) {
      store.saveTimer(null)
      return
    }

    // 正常离开会先暂停并落盘；这里遇到 running=true 只可能是被系统杀掉，
    // 那段时间无法确认，直接丢弃，避免把几小时离线时间算进计时
    const next = saved.running
      ? Object.assign({}, saved, { running: false, startedAt: 0 })
      : saved
    store.saveTimer(next)
    this.setData({
      timer: next,
      timerId: next.habitId,
      timerClock: T.formatClock(T.elapsedOf(next, Date.now())),
      timerPct: T.progressPct(T.elapsedOf(next, Date.now()), next.targetSeconds),
      timerMet: T.isDurationMet(T.elapsedOf(next, Date.now()), next.targetSeconds)
    })
    this.tick()
  },

  finishTimer() {
    const t = this.data.timer
    if (!t) return

    const elapsed = T.elapsedOf(t, Date.now())
    if (!T.isDurationMet(elapsed, t.targetSeconds)) {
      wx.showToast({ title: '时间还没到', icon: 'none' })
      return
    }

    store.setRecord(t.habitId, hb.dateKey(new Date()), R.makeTimer(elapsed, new Date().toISOString()))
    this.clearTimer()
    this.refresh()
    wx.showToast({ title: '计时完成 ' + T.formatClock(elapsed), icon: 'none', duration: 2000 })
  },

  cancelTimer() {
    this.clearTimer()
  },

  clearTimer() {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
    store.saveTimer(null)
    this.setData({
      timer: null,
      timerId: '',
      timerClock: '00:00',
      timerPct: 0,
      timerMet: false,
      timerRing: ''
    })
  },

  // ── AI 指令 ──────────────────────────────────────

  onAgentInput(e) {
    this.setData({ agentInput: e.detail.value })
  },

  sendAgent() {
    const text = String(this.data.agentInput || '').trim()
    if (!text || this.data.agentBusy) return

    // 助手也能看到本机洞察，答「现在该做什么」时才有具体落点
    const active = store.activeHabits()
    const recs = {}
    active.forEach(function (h) { recs[h.id] = store.getRecord(h.id) })
    const ins = insight.analyze(active, recs, store.loadTasks(), new Date())

    const snapshot = {
      habits: (this.data.board || []).map(function (h) {
        return { id: h.id, name: h.name, done: h.done }
      }),
      stats: Object.assign({}, this.data.stats, {
        todayDone: this.data.doneCount,
        habitCount: this.data.total
      }),
      insight: { next: ins.next, lines: ins.lines }
    }

    this.setData({ agentBusy: true, agentReply: '' })
    const self = this

    ai.callAgent(text, snapshot).then(function (r) {
      // 云端只回动作，这里才真正落盘
      const applied = AG.applyActions(snapshot, r.actions || [])
      const todayK = hb.dateKey(new Date())
      applied.changed.forEach(function (id) { store.toggle(id, todayK) })

      self.setData({
        agentBusy: false,
        agentInput: '',
        agentReply: r.reply || '好的'
      })
      if (applied.changed.length) self.refresh()
    }).catch(function () {
      self.setData({ agentBusy: false, agentReply: '这次没理解，换个说法试试。' })
    })
  },

  toHabits() {
    wx.switchTab({ url: '/pages/habits/habits' })
  }
})
