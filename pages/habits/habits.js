const store = require('../../utils/store.js')
const presets = require('../../utils/presets.js')
const ai = require('../../services/ai.js')
const OD = require('../../utils/ondevice.js')
const config = require('../../config.js')
const display = require('../../utils/display.js')

Page({
  data: {
    habits: [],
    archivedHabits: [],
    totalN: 0,
    icons: store.ICONS,
    colors: store.COLORS,
    name: '',
    icon: store.ICONS[0],
    color: store.COLORS[0],
    type: 'simple',
    minutes: '25',
    aiDesc: '',
    aiBusy: false,
    aiItems: [],
    aiSource: '',
    nameEmoji: '',
    modelReady: false,
    presetCats: [],
    // 编辑面板：和「新建」表单分开，避免两边互相覆盖输入到一半的内容
    editing: false,
    editId: '',
    editName: '',
    editIcon: '',
    editColor: '',
    editType: 'simple',
    editMinutes: '25',
    themeClass: '',
    fontClass: '',
    fontLabel: '标准',
    isDark: false
  },

  onLoad() {
    // 内置小模型：有推理会话走 ONNX，没有就用同套权重在 JS 里算
    OD.loadModel(config.modelPath).then((session) => {
      this._session = session
      this.setData({ modelReady: true, onnxReady: !!session })
    })
  },

  onShow() {
    this.setData(display.classes())
    display.applyChrome()
    this.refresh()
  },

  refresh() {
    const all = store.loadHabits()
    const active = all.filter(function (h) { return !h.archived })
    const archived = all.filter(function (h) { return h.archived })
    const names = all.map(function (h) { return h.name })

    this.setData({
      habits: active,
      archivedHabits: archived,
      totalN: all.length,
      // 按名字标出「已经加过」，避免推荐里再点一次加出两条同名习惯。
      // 已暂停的也算「加过」—— 恢复比重建更符合预期，历史记录不会丢
      presetCats: presets.markAdded(presets.CATEGORIES, names)
    })
  },

  /**
   * 从推荐里加一条。
   *
   * 已经有的不重复加 —— 用户可能自己手打过同名的，那也该算已经有了。
   * 点一下没反应比加出两条一样的习惯好。
   */
  addPreset(e) {
    const name = e.currentTarget.dataset.name
    if (!name) return

    const exists = store.loadHabits().some(function (h) { return h.name === name })
    if (exists) {
      wx.showToast({ title: '已经加过了', icon: 'none' })
      return
    }

    const p = presets.byName(name)
    store.addHabit(name, p ? p.icon : '', p ? p.color : '')
    this.refresh()
    wx.showToast({ title: '已添加', icon: 'success' })
  },

  onName(e) {
    const name = e.detail.value
    const guess = OD.fallbackEmoji(name)
    this.setData({ name: name, nameEmoji: guess })

    // 模型可用就用模型（ONNX 或 JS 前向），都不行才回落规则
    OD.predictEmoji(name, this._session).then((emoji) => {
      if (this.data.name === name) this.setData({ nameEmoji: emoji })
    })
  },

  applyEmoji() {
    if (!this.data.nameEmoji) return
    this.setData({ icon: this.data.nameEmoji })
  },

  pickIcon(e) {
    this.setData({ icon: e.currentTarget.dataset.v })
  },

  pickColor(e) {
    this.setData({ color: e.currentTarget.dataset.v })
  },

  pickType(e) {
    this.setData({ type: e.currentTarget.dataset.v })
  },

  onMinutes(e) {
    this.setData({ minutes: e.detail.value })
  },

  // ── AI 建议 ───────────────────────────────────────

  onAiDesc(e) {
    this.setData({ aiDesc: e.detail.value })
  },

  genAi() {
    const desc = String(this.data.aiDesc || '').trim()
    if (!desc) {
      wx.showToast({ title: '先说说你想养成什么', icon: 'none' })
      return
    }
    if (this.data.aiBusy) return

    this.setData({ aiBusy: true })
    ai.genHabits(desc).then((r) => {
      this.setData({ aiBusy: false, aiItems: r.habits, aiSource: r.source })
      if (!r.habits.length) {
        wx.showToast({ title: '没想出合适的，换个说法试试', icon: 'none' })
      }
    }).catch(() => {
      this.setData({ aiBusy: false })
      wx.showToast({ title: '生成失败，稍后再试', icon: 'none' })
    })
  },

  /** 加一条建议，返回是否真的加了 */
  addSuggestion(it) {
    if (!it || !it.name) return false
    const exists = store.loadHabits().some(function (h) { return h.name === it.name })
    if (exists) return false
    store.addHabit(it.name, it.icon, it.color)
    return true
  },

  addAi(e) {
    const i = Number(e.currentTarget.dataset.i)
    const it = (this.data.aiItems || [])[i]
    if (!it) return

    if (!this.addSuggestion(it)) {
      wx.showToast({ title: '已经加过了', icon: 'none' })
      return
    }
    this.refresh()
    wx.showToast({ title: '已添加', icon: 'success' })
  },

  addAiAll() {
    let n = 0
    const self = this
    ;(this.data.aiItems || []).forEach(function (it) {
      if (self.addSuggestion(it)) n++
    })
    this.refresh()
    wx.showToast({ title: n ? '已添加 ' + n + ' 个' : '这些都已经有了', icon: 'none' })
  },

  add() {
    const name = String(this.data.name || '').trim()
    if (!name) {
      wx.showToast({ title: '给习惯起个名字', icon: 'none' })
      return
    }
    if (name.length > 12) {
      wx.showToast({ title: '名字别超过 12 个字', icon: 'none' })
      return
    }

    let opts = { type: 'simple' }
    if (this.data.type === 'timer') {
      const m = Math.round(Number(this.data.minutes))
      if (!isFinite(m) || m < 1 || m > 180) {
        wx.showToast({ title: '计时时长填 1–180 分钟', icon: 'none' })
        return
      }
      opts = { type: 'timer', targetSeconds: m * 60 }
    }

    store.addHabit(name, this.data.icon, this.data.color, opts)

    // 清空表单，但保留图标和颜色的选择 —— 连续添加时少点两次
    this.setData({ name: '', nameEmoji: '' })
    this.refresh()
    wx.showToast({ title: '已添加', icon: 'success' })
  },

  // ── 编辑已有习惯 ─────────────────────────────────

  openEdit(e) {
    const id = e.currentTarget.dataset.id
    const h = store.loadHabits().filter(function (x) { return x.id === id })[0]
    if (!h) return

    const minutes = h.type === 'timer' && h.targetSeconds
      ? String(Math.round(h.targetSeconds / 60))
      : '25'

    this.setData({
      editing: true,
      editId: h.id,
      editName: h.name,
      editIcon: h.icon,
      editColor: h.color,
      editType: h.type,
      editMinutes: minutes
    })
  },

  closeEdit() {
    this.setData({ editing: false, editId: '' })
  },

  onEditName(e) {
    this.setData({ editName: e.detail.value })
  },

  editPickIcon(e) {
    this.setData({ editIcon: e.currentTarget.dataset.v })
  },

  editPickColor(e) {
    this.setData({ editColor: e.currentTarget.dataset.v })
  },

  editPickType(e) {
    this.setData({ editType: e.currentTarget.dataset.v })
  },

  onEditMinutes(e) {
    this.setData({ editMinutes: e.detail.value })
  },

  moveUp() {
    if (store.moveHabit(this.data.editId, -1)) this.refresh()
  },

  moveDown() {
    if (store.moveHabit(this.data.editId, 1)) this.refresh()
  },

  saveEdit() {
    if (!this.data.editId) return

    const name = String(this.data.editName || '').trim()
    if (!name) {
      wx.showToast({ title: '给习惯起个名字', icon: 'none' })
      return
    }
    if (name.length > 12) {
      wx.showToast({ title: '名字别超过 12 个字', icon: 'none' })
      return
    }

    // 改名也要判重：新建时拦了，编辑时不拦就会造出两条同名习惯
    const dup = store.loadHabits().some(function (h) {
      return h.id !== this.data.editId && h.name === name
    })
    if (dup) {
      wx.showToast({ title: '已经有同名习惯了', icon: 'none' })
      return
    }

    const patch = {
      name: name,
      icon: this.data.editIcon,
      color: this.data.editColor,
      type: this.data.editType
    }

    if (this.data.editType === 'timer') {
      const m = Math.round(Number(this.data.editMinutes))
      if (!isFinite(m) || m < 1 || m > 180) {
        wx.showToast({ title: '计时时长填 1–180 分钟', icon: 'none' })
        return
      }
      patch.targetSeconds = m * 60
    }

    store.updateHabit(this.data.editId, patch)
    this.setData({ editing: false, editId: '' })
    this.refresh()
    wx.showToast({ title: '已保存', icon: 'success' })
  },

  // ── 暂停 / 恢复 ───────────────────────────────────

  archive(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name

    wx.showModal({
      title: '暂停习惯',
      content: '「' + name + '」不再出现在今日页，打卡记录会保留，随时可以恢复。',
      confirmText: '暂停',
      success: (r) => {
        if (!r.confirm) return
        store.setArchived(id, true)
        this.refresh()
        wx.showToast({ title: '已暂停', icon: 'none' })
      }
    })
  },

  unarchive(e) {
    const id = e.currentTarget.dataset.id
    store.setArchived(id, false)
    this.refresh()
    wx.showToast({ title: '已恢复', icon: 'success' })
  },

  remove(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name

    // 删除要确认 —— 会连同这个习惯的全部打卡记录一起删掉，不可撤销
    wx.showModal({
      title: '删除习惯',
      content: '「' + name + '」的全部打卡记录会一起删除，不可恢复。',
      confirmText: '删除',
      confirmColor: '#e8674a',
      success: (r) => {
        if (!r.confirm) return
        store.removeHabit(id)
        this.refresh()
        wx.showToast({ title: '已删除', icon: 'none' })
      }
    })
  }
})
