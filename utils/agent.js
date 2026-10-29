/**
 * Agent 的纯逻辑：客户端把数据快照发出去，云端只负责推理，
 * 返回「动作」由客户端落地。这样打卡数据永远只有本机一个事实源。
 *
 * 纯函数，不引用 wx，可直接单测。
 */

/**
 * @param {object} snapshot { habits:[{id,name,done}], stats:{...} }
 * @param {Array}  actions  [{ type:'toggle', habitId }]
 * @returns {{snapshot:object, changed:string[]}}
 */
function applyActions(snapshot, actions) {
  const src = snapshot || {}
  const s = {
    habits: (src.habits || []).map(function (h) {
      return { id: h.id, name: h.name, done: !!h.done }
    }),
    stats: Object.assign({}, src.stats || {})
  }
  const changed = []

  ;(actions || []).forEach(function (a) {
    if (!a || a.type !== 'toggle') return
    const h = s.habits.filter(function (x) { return x.id === a.habitId })[0]
    if (!h) return
    h.done = !h.done
    changed.push(h.id)
  })

  s.stats.todayDone = s.habits.filter(function (h) { return h.done }).length
  return { snapshot: s, changed: changed }
}

function num(v) {
  const n = Number(v)
  return isFinite(n) ? n : 0
}

/** 去掉「把/帮我/打卡」这类动作词，留下真正指向习惯的那几个字 */
function coreWords(text) {
  return String(text || '')
    .replace(/把|帮我|请|今天|一下|打卡|完成|取消|标记|勾|了|吧|呢|吗/g, '')
    .trim()
}

/**
 * 在习惯里找用户说的那一个。
 * 先按全名匹配；不行再按「核心词字符命中率」——因为习惯名常带
 * 「30 分钟」「8 杯」这类后缀，用户不会念全。
 */
function findHabit(text, habits) {
  const list = habits || []
  const full = list.filter(function (h) { return h.name && text.indexOf(h.name) >= 0 })[0]
  if (full) return full

  const core = coreWords(text)
  if (core.length < 2) return null

  let best = null
  let bestScore = 0
  list.forEach(function (h) {
    const name = String(h.name || '')
    let hit = 0
    for (let i = 0; i < core.length; i++) {
      if (name.indexOf(core[i]) >= 0) hit++
    }
    const score = hit / core.length
    if (score > bestScore) {
      bestScore = score
      best = h
    }
  })

  return bestScore >= 0.6 ? best : null
}

/** 没有模型时的关键词兜底。返回 { reply, actions }，与云端契约一致 */
function mockAgent(message, snapshot) {
  const text = String(message || '')
  const habits = (snapshot && snapshot.habits) || []
  const stats = (snapshot && snapshot.stats) || {}
  const ins = (snapshot && snapshot.insight) || {}

  // 「现在该做什么」直接用本机洞察给出具体一项，而不是泛泛建议
  if (/该做什么|现在做什么|接下来|先做|推荐/.test(text)) {
    const n = ins.next
    if (n) {
      return {
        reply: '现在最值得做的是「' + n.name + '」：' + n.reason + '。',
        actions: []
      }
    }
    return { reply: '今天没有待办，习惯也都在节奏上。', actions: [] }
  }

  if (/洞察|分析|风险|问题在哪/.test(text)) {
    const lines = (ins.lines || []).filter(Boolean)
    return {
      reply: lines.length ? lines.join('；') + '。' : '记录还太少，先打几次卡再看。',
      actions: []
    }
  }

  if (/统计|进度|怎么样|数据|表现/.test(text)) {
    return {
      reply: '今天完成 ' + num(stats.todayDone) + '/' + num(stats.habitCount) +
        '，累计 ' + num(stats.totalCheckins) + ' 次，最长连续 ' + num(stats.bestStreak) + ' 天。',
      actions: []
    }
  }

  if (/有哪些|列表|清单|习惯都/.test(text)) {
    const list = habits.map(function (h) { return (h.done ? '✓' : '○') + h.name }).join('  ')
    return { reply: list || '还没有习惯', actions: [] }
  }

  const target = findHabit(text, habits)
  if (target && /打卡|完成|取消|勾|标记/.test(text)) {
    return {
      reply: '已' + (target.done ? '取消' : '完成') + '「' + target.name + '」。',
      actions: [{ type: 'toggle', habitId: target.id }]
    }
  }

  if (/全部|都/.test(text) && /打卡|完成/.test(text)) {
    const todo = habits.filter(function (h) { return !h.done })
    return {
      reply: todo.length ? '把今天剩下的 ' + todo.length + ' 个都打上卡。' : '今天已经全部完成了。',
      actions: todo.map(function (h) { return { type: 'toggle', habitId: h.id } })
    }
  }

  return {
    reply: '可以试试：「今天完成得怎么样」「把读书打卡」「哪些习惯还没做」。',
    actions: []
  }
}

module.exports = {
  applyActions: applyActions,
  mockAgent: mockAgent,
  findHabit: findHabit
}
