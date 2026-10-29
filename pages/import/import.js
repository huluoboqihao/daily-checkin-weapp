const store = require('../../utils/store.js')
const ai = require('../../services/ai.js')
const schedule = require('../../utils/schedule.js')
const P = require('../../utils/parseTasks.js')
const ocr = require('../../utils/ocr.js')
const display = require('../../utils/display.js')

Page({
  data: {
    today: '',
    mode: 'text',
    text: '',
    imagePath: '',
    busy: false,
    ocrNote: '',
    source: '',
    drafts: [],
    conflicts: {},
    suggestions: {},
    conflictCount: 0,
    themeClass: '',
    fontClass: '',
    fontLabel: '标准',
    isDark: false
  },

  onLoad() {
    this.setData({ today: P.dateKey(new Date()) })
  },

  onShow() {
    this.setData(display.classes())
    display.applyChrome()
  },

  setMode(e) {
    this.setData({ mode: e.currentTarget.dataset.mode, ocrNote: '' })
  },

  onText(e) {
    this.setData({ text: e.detail.value })
  },

  chooseImage() {
    const self = this
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success(res) {
        const path = res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath
        if (!path) return
        self.setData({ imagePath: path })
        self.recognizePath(path)
      }
    })
  },

  /** 识别失败后不用重新选图，直接用同一张再试一次 */
  retryOcr() {
    if (this.data.imagePath) this.recognizePath(this.data.imagePath)
  },

  switchToText() {
    this.setData({ mode: 'text', ocrNote: '' })
  },

  /** 对接本地 OCR 服务；独立成方法，便于单独验证 */
  recognizePath(path) {
    const self = this
    this.setData({ busy: true, ocrNote: '正在识别…' })

    return ocr.recognize(path).then(function (r) {
      self.setData({ busy: false })

      if (r.text) {
        const lines = r.text.split('\n').filter(Boolean).length
        self.setData({ text: r.text, ocrNote: '已识别 ' + lines + ' 行，可修改后再解析' })
        self.parseNow()
        return r
      }

      const hint = {
        unconfigured: '未配置 OCR 服务（config.ocrProxy）',
        request_failed: 'OCR 服务没启动：先运行 node tools/ocr-service/server.js',
        empty: '这张图没识别到文字，换一张或直接粘贴',
        read_failed: '读取图片失败，请重试'
      }[r.reason] || '识别失败，请粘贴文字'

      self.setData({ ocrNote: hint })
      return r
    })
  },

  parseNow() {
    const text = String(this.data.text || '').trim()
    if (!text) {
      wx.showToast({ title: '先粘贴一段文字，或选一张截图', icon: 'none' })
      return
    }
    if (this.data.busy) return

    this.setData({ busy: true })
    const self = this
    ai.parseTasks(text, new Date()).then(function (r) {
      const drafts = (r.tasks || []).map(function (t, i) {
        return {
          key: 'd' + i,
          title: t.title,
          date: t.date || self.data.today,
          startTime: t.startTime || '',
          durationMin: t.durationMin || 30,
          location: t.location || '',
          evidence: t.evidence || '',
          confidence: t.confidence || 0.5
        }
      })
      self.setData({ busy: false, drafts: drafts, source: r.source })
      self.recompute()
      if (!drafts.length) wx.showToast({ title: '没找到像待办的内容', icon: 'none' })
    }).catch(function () {
      self.setData({ busy: false })
      wx.showToast({ title: '解析失败，稍后再试', icon: 'none' })
    })
  },

  /** 把没填时间的草稿按当天空档排进去（确定性规则，不调模型） */
  suggestTimes() {
    const drafts = this.data.drafts || []
    if (!drafts.length) return

    const byDate = {}
    drafts.forEach(function (d) {
      if (!d.date) return
      if (!byDate[d.date]) byDate[d.date] = []
      byDate[d.date].push({
        id: d.key, title: d.title, date: d.date,
        startTime: d.startTime, durationMin: Number(d.durationMin) || 30
      })
    })

    const filled = {}
    Object.keys(byDate).forEach(function (date) {
      const existing = store.loadTasks().filter(function (t) {
        return t.date === date && t.status !== 'done'
      })
      schedule.fillSlots(byDate[date].concat(existing), date).forEach(function (t) {
        if (String(t.id).indexOf('d') === 0 && t.suggested) filled[t.id] = t.startTime
      })
    })

    const next = drafts.map(function (d) {
      return filled[d.key] ? Object.assign({}, d, { startTime: filled[d.key] }) : d
    })

    this.setData({ drafts: next })
    this.recompute()
    wx.showToast({
      title: Object.keys(filled).length ? '已按空档排好' : '没有可用空档',
      icon: 'none'
    })
  },

  /** 手动加一条空草稿，不想写整段话时用 */
  addManual() {
    const drafts = this.data.drafts.slice()
    drafts.push({
      key: 'm' + Date.now(),
      title: '',
      date: this.data.today,
      startTime: '',
      durationMin: 30,
      location: '',
      evidence: '',
      confidence: 1
    })
    this.setData({ drafts: drafts })
    this.recompute()
  },

  recompute() {
    const self = this
    const drafts = this.data.drafts.map(function (d) {
      return {
        id: d.key, title: d.title, date: d.date, startTime: d.startTime,
        durationMin: Number(d.durationMin) || 30, location: d.location, status: 'active'
      }
    })

    // 草稿之间 + 草稿与已有待办一起判冲突
    const all = drafts.concat(store.loadTasks())
    const found = schedule.detect(all, { now: new Date() })
    const map = {}
    let n = 0
    found.forEach(function (c) {
      if (String(c.id).indexOf('d') === 0) {
        map[c.id] = c
        n++
      }
    })
    const suggestions = {}
    Object.keys(map).forEach(function (id) {
      const d = drafts.filter(function (x) { return x.id === id })[0]
      if (!d) return
      const s = schedule.suggestMove(d, all, d.date)
      if (s) suggestions[id] = s.startTime
    })

    self.setData({ conflicts: map, suggestions: suggestions, conflictCount: n })
  },

  /** 接受改期建议 */
  applySuggestion(e) {
    const i = Number(e.currentTarget.dataset.i)
    const d = this.data.drafts[i]
    if (!d) return
    const time = this.data.suggestions[d.key]
    if (!time) return

    const drafts = this.data.drafts.slice()
    drafts[i] = Object.assign({}, d, { startTime: time })
    this.setData({ drafts: drafts })
    this.recompute()
    wx.showToast({ title: '已改到 ' + time, icon: 'none' })
  },

  onField(e) {
    const i = Number(e.currentTarget.dataset.i)
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    const drafts = this.data.drafts.slice()
    if (!drafts[i]) return
    drafts[i][field] = value
    this.setData({ drafts: drafts })
    this.recompute()
  },

  onDate(e) {
    this.applyField(e.currentTarget.dataset.i, 'date', e.detail.value)
  },

  onTime(e) {
    this.applyField(e.currentTarget.dataset.i, 'startTime', e.detail.value)
  },

  applyField(i, field, value) {
    const drafts = this.data.drafts.slice()
    if (!drafts[i]) return
    drafts[i][field] = value
    this.setData({ drafts: drafts })
    this.recompute()
  },

  removeDraft(e) {
    const i = Number(e.currentTarget.dataset.i)
    const drafts = this.data.drafts.slice()
    drafts.splice(i, 1)
    this.setData({ drafts: drafts })
    this.recompute()
  },

  saveOne(e) {
    const i = Number(e.currentTarget.dataset.i)
    const d = this.data.drafts[i]
    if (!d) return
    if (!d.title) {
      wx.showToast({ title: '标题不能为空', icon: 'none' })
      return
    }
    store.addTask({
      title: d.title, date: d.date, startTime: d.startTime,
      durationMin: d.durationMin, location: d.location, source: 'import'
    })
    const drafts = this.data.drafts.slice()
    drafts.splice(i, 1)
    this.setData({ drafts: drafts })
    this.recompute()
    wx.showToast({ title: '已加入', icon: 'success' })
  },

  saveAll() {
    const drafts = this.data.drafts || []
    if (!drafts.length) return
    let n = 0
    drafts.forEach(function (d) {
      if (!d.title) return
      store.addTask({
        title: d.title, date: d.date, startTime: d.startTime,
        durationMin: d.durationMin, location: d.location, source: 'import'
      })
      n++
    })
    wx.showToast({ title: '已加入 ' + n + ' 条', icon: 'success' })
    setTimeout(function () { wx.navigateBack() }, 500)
  }
})
