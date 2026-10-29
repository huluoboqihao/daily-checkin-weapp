const hb = require('../../utils/habit.js')
const store = require('../../utils/store.js')
const ach = require('../../utils/achievement.js')
const poster = require('../../utils/poster.js')
const coach = require('../../utils/coach.js')
const ai = require('../../services/ai.js')
const RV = require('../../utils/review.js')
const display = require('../../utils/display.js')
const insight = require('../../utils/insight.js')
const R = require('../../utils/record.js')

// 热力图展示多少周。8 周约两个月，一屏能放下
const WEEKS = 8

Page({
  data: {
    items: [],
    totalStreak: 0,
    bestStreak: 0,
    wall: [],
    unlockedN: 0,
    totalN: 0,
    agg: { totalCheckins: 0, activeDays: 0, bestStreak: 0 },
    coachMsgs: [],
    coachInput: '',
    coachBusy: false,
    posterVisible: false,
    posterPreview: '',
    posterTheme: 'editorial',
    review: null,
    insights: [],
    themeClass: '',
    fontClass: '',
    fontLabel: '标准',
    isDark: false,
    animClass: '',
    weekdays: ['一', '二', '三', '四', '五', '六', '日']
  },

  onShow() {
    this.setData(display.classes())
    display.applyChrome()
    this.refresh()

    if (!this._entered) {
      this._entered = true
      this.setData({ animClass: 'anim-rise' })
      setTimeout(() => this.setData({ animClass: '' }), 700)
    }

    // 从「AI 助手 → 生成本周回顾」跳过来时，直接出海报
    if (wx.getStorageSync('open_weekly')) {
      wx.removeStorageSync('open_weekly')
      const self = this
      setTimeout(function () { self.makeWeeklyPoster() }, 300)
    }
  },

  onShareAppMessage() {
    return {
      title: '我这周的打卡成绩，来看看',
      path: '/pages/index/index'
    }
  },

  onLoad() {},

  onUnload() {
    if (this._stream) {
      this._stream.stop()
      this._stream = null
    }
  },

  refresh() {
    const today = new Date()
    const habits = store.loadHabits()
    const recs = {}
    habits.forEach(function (h) { recs[h.id] = store.getRecord(h.id) })

    const items = habits.map(function (h) {
      const rec = store.getRecord(h.id)
      const s = hb.summarize(rec, today)

      // 日历按周分组。给每列和每格都编上号 ——
      // wx:key 需要唯一标识，而这里的结构是「数组的数组」，
      // 直接用 *this 会重复，所以预先算好索引
      // 环比：本周 vs 上周，回答「在变好还是变差」
      let prevDone = 0
      for (let i = 7; i < 14; i++) {
        const k = hb.dateKey(hb.shiftDays(today, -i))
        if (R.isMarked(rec[k])) prevDone++
      }
      const prevPct = Math.round((prevDone * 100) / 7)
      const trend = s.week.pct - prevPct
      const trendLabel = (trend > 0 ? '↑ ' : (trend < 0 ? '↓ ' : '· ')) +
        Math.abs(trend) + '% 较上周'

      const raw = hb.dayGrid(rec, 30, today)
      const weeks = raw.map(function (cells, wi) {
        return {
          wi: wi,
          cells: cells.map(function (c, di) {
            // 摊平成视图字段：WXML 里只读简单属性，避免嵌套对象在模板里解析差异
            return {
              di: di,
              key: c.key,
              done: c.done,
              future: c.future,
              isToday: c.isToday,
              label: c.inRange ? String(c.day) : '',
              blank: !c.inRange
            }
          })
        }
      })

      return {
        id: h.id,
        name: h.name,
        icon: h.icon,
        color: h.color,
        archived: !!h.archived,
        streak: s.streak,
        weekPct: s.week.pct,
        weekDone: s.week.done,
        monthPct: s.month.pct,
        monthDone: s.month.done,
        total: s.total,
        trendLabel: trendLabel,
        trendUp: trend > 0,
        weeks: weeks
      }
    })

    let best = 0
    let sum = 0
    items.forEach(function (x) {
      if (x.streak > best) best = x.streak
      sum += x.streak
    })

    // 成就墙。顺手把新达成的记进持久化 —— 用户可能只在统计页看，
    // 不在这里补一次的话，成就得等下次去今日页才被记录
    const agg = hb.aggregate(habits, recs, today)
    agg.tasksDone = store.loadTasks().filter(function (t) { return t.status === 'done' }).length
    const evaluated = ach.applyUnlocks(ach.evaluate(agg), store.loadUnlocks())
    store.recordUnlocks(evaluated, hb.dateKey(today))

    // 已解锁的排前面（这是「我拿到了什么」），未解锁的按完成度排（这是「快到了」）
    const wall = evaluated.slice().sort(function (a, b) {
      if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1
      return b.pct - a.pct
    })

    // 本地洞察：只用本机记录，得出具体到某个习惯/某一天的结论
    const ins = insight.analyze(habits, recs, store.loadTasks(), today)
    this._insight = ins

    this.setData({
      items: items,
      review: RV.weekReview(habits, recs, store.loadTasks(), today),
      insights: ins.lines,
      bestStreak: best,
      totalStreak: sum,
      wall: wall,
      unlockedN: ach.unlockedCount(evaluated),
      totalN: evaluated.length,
      tasksDone: agg.tasksDone,
      agg: agg
    })
  },

  // ── AI 教练 ──────────────────────────────────────

  onCoachInput(e) {
    this.setData({ coachInput: e.detail.value })
  },

  toggleCoach() {
    if (this.data.coachBusy) this.stopCoach()
    else this.sendCoach()
  },

  sendCoach() {
    const text = String(this.data.coachInput || '').trim()
    if (!text || this.data.coachBusy) return

    const lines = (this._insight && this._insight.lines) || []
    // 云端 prompt 里把具体习惯名换成「某个习惯」：原设计只发聚合数字，
    // 不该因为加了洞察就把用户的私人清单带出去。本地回复仍用原名。
    const safeLines = lines.map(function (l) {
      return String(l).replace(/「[^」]*」/g, '某个习惯')
    })
    const context = coach.buildCoachContext(this.data.agg, safeLines)
    const history = this.data.coachMsgs.map(function (m) {
      return { role: m.role, content: m.text }
    })
    history.push({ role: 'user', content: text })

    const prompt = [{ role: 'system', content: '你是习惯养成教练，回答简短具体。用户数据：' + context }].concat(history)

    const msgs = this.data.coachMsgs.concat([
      { role: 'user', text: text },
      { role: 'assistant', text: '' }
    ])
    const idx = msgs.length - 1

    this.setData({ coachMsgs: msgs, coachInput: '', coachBusy: true })

    const self = this
    this._stream = ai.streamCoach(prompt, {
      stats: this.data.agg,
      insightLines: lines,
      onText: function (chunk) {
        const patch = {}
        patch['coachMsgs[' + idx + '].text'] = (self.data.coachMsgs[idx].text || '') + chunk
        self.setData(patch)
      },
      onDone: function () {
        self._stream = null
        self.setData({ coachBusy: false })
      },
      onError: function () {
        const patch = {}
        patch['coachMsgs[' + idx + '].text'] = '连接模型失败，先按本地教练回答：\n' + coach.buildCoachReply(text, self.data.agg, lines)
        self.setData(patch)
        self._stream = null
        self.setData({ coachBusy: false })
      }
    })
  },

  stopCoach() {
    if (this._stream) {
      this._stream.stop()
      this._stream = null
    }
    this.setData({ coachBusy: false })
  },

  // ── 成就海报 ──────────────────────────────────────

  makePoster(e) {
    const id = e.currentTarget.dataset.id
    const a = (this.data.wall || []).filter(function (x) { return x.id === id })[0]
    if (!a) return
    this._poster = { kind: 'ach', a: a }
    this.renderConfig(poster.buildPosterConfig({ nickname: '我', stats: this.data.agg }, a, this.data.posterTheme))
  },

  /** 本周回顾海报：和成就海报共用预览/保存/主题切换 */
  makeWeeklyPoster() {
    const r = this.data.review
    if (!r) {
      wx.showToast({ title: '还没有本周数据', icon: 'none' })
      return
    }
    this._poster = { kind: 'weekly', r: r }
    this.renderConfig(poster.buildWeeklyConfig({ nickname: '我' }, r, this.data.posterTheme))
  },

  /** 切换主题：按当前海报类型重画 */
  setPosterTheme(e) {
    const theme = e.currentTarget.dataset.theme
    if (!theme || theme === this.data.posterTheme) return
    if (!this._poster) return
    this.setData({ posterTheme: theme })

    if (this._poster.kind === 'weekly') {
      this.renderConfig(poster.buildWeeklyConfig({ nickname: '我' }, this._poster.r, theme))
    } else {
      this.renderConfig(poster.buildPosterConfig({ nickname: '我', stats: this.data.agg }, this._poster.a, theme))
    }
  },

  renderConfig(cfg) {
    const self = this
    // 按 2 倍尺寸绘制与导出：1500×2400，高分屏下不糊
    const out = poster.scaleConfig(cfg, 2)
    wx.showLoading({ title: '生成中' })

    // 用旧式 canvas-id 接口：不查节点，避免 createSelectorQuery 不回调导致卡死
    const ctx = wx.createCanvasContext('posterCanvas', this)
    poster.renderOpsLegacy(ctx, out)

    // 兜底：draw/导出偶发不回调时，别让用户永远停在「生成中」
    let settled = false
    if (this._posterTimer) clearTimeout(this._posterTimer)
    this._posterTimer = setTimeout(function () {
      if (settled) return
      wx.hideLoading()
      wx.showToast({ title: '导出超时，再试一次', icon: 'none' })
    }, 6000)

    ctx.draw(false, function () {
      wx.canvasToTempFilePath({
        canvasId: 'posterCanvas',
        x: 0,
        y: 0,
        width: out.width,
        height: out.height,
        destWidth: out.width,
        destHeight: out.height,
        success: function (r) {
          settled = true
          if (self._posterTimer) clearTimeout(self._posterTimer)
          wx.hideLoading()
          // 先给预览，保存与否由用户决定
          self.setData({ posterPreview: r.tempFilePath, posterVisible: true })
        },
        fail: function () {
          settled = true
          if (self._posterTimer) clearTimeout(self._posterTimer)
          wx.hideLoading()
          wx.showToast({ title: '导出失败', icon: 'none' })
        }
      }, self)
    })
  },

  closePoster() {
    this.setData({ posterVisible: false })
  },

  savePosterTap() {
    if (!this.data.posterPreview) return
    this.savePoster(this.data.posterPreview)
  },

  /** 直接唤起微信的图片分享面板，不落相册也能发给朋友 */
  sharePosterTap() {
    if (!this.data.posterPreview) return
    if (wx.showShareImageMenu) {
      wx.showShareImageMenu({
        path: this.data.posterPreview,
        fail: () => wx.showToast({ title: '分享失败，可先保存到相册', icon: 'none' })
      })
    } else {
      this.savePoster(this.data.posterPreview)
    }
  },

  savePoster(filePath) {
    const self = this
    wx.saveImageToPhotosAlbum({
      filePath: filePath,
      success: function () {
        self.setData({ posterVisible: false })
        wx.showToast({ title: '已保存到相册', icon: 'success' })
      },
      fail: function (err) {
        if (String(err.errMsg || '').indexOf('auth') >= 0) {
          wx.showModal({
            title: '需要相册权限',
            content: '去设置里允许「保存到相册」后再试一次。',
            success: function (r) { if (r.confirm) wx.openSetting() }
          })
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' })
        }
      }
    })
  }
})
