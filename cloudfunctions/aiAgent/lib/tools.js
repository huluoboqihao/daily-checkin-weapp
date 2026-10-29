/**
 * Agent 可调用的工具定义，以及它们在「快照」上的执行。
 * 工具只改内存快照，不写存储 —— 真正的落盘由客户端做。
 */

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'queryHabits',
      description: '列出所有习惯以及今天是否已完成',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getStats',
      description: '读取今天的完成数与累计统计',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'toggleCheckIn',
      description: '切换某个习惯今天的打卡状态',
      parameters: {
        type: 'object',
        properties: { habitId: { type: 'string', description: '习惯 id' } },
        required: ['habitId']
      }
    }
  }
]

function clone(snapshot) {
  const src = snapshot || {}
  return {
    habits: (src.habits || []).map(function (h) {
      return { id: h.id, name: h.name, done: !!h.done }
    }),
    stats: Object.assign({}, src.stats || {})
  }
}

/**
 * 执行一次工具调用，返回给模型的字符串结果。
 * toggleCheckIn 会同时把动作记进 actions，供客户端落地。
 */
function runTool(name, args, snapshot, actions) {
  const s = snapshot
  const a = args || {}

  if (name === 'queryHabits') {
    return JSON.stringify(s.habits.map(function (h) {
      return { id: h.id, name: h.name, done: h.done }
    }))
  }

  if (name === 'getStats') {
    return JSON.stringify(s.stats)
  }

  if (name === 'toggleCheckIn') {
    const h = s.habits.filter(function (x) { return x.id === a.habitId })[0]
    if (!h) return JSON.stringify({ ok: false, error: '没有这个习惯' })
    h.done = !h.done
    s.stats.todayDone = s.habits.filter(function (x) { return x.done }).length
    actions.push({ type: 'toggle', habitId: h.id })
    return JSON.stringify({ ok: true, habit: h.name, done: h.done })
  }

  return JSON.stringify({ ok: false, error: '未知工具 ' + name })
}

module.exports = {
  TOOLS: TOOLS,
  clone: clone,
  runTool: runTool
}
