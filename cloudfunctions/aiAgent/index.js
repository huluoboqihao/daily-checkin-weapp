/**
 * 云函数入口：自然语言 → 工具调用 → 返回动作清单。
 *
 * 重要：这里不写任何存储。toggleCheckIn 只改内存快照并把动作记进 actions，
 * 由客户端落地 —— 打卡数据只有本机一个事实源。
 */
const { chat } = require('./lib/deepseek.js')
const T = require('./lib/tools.js')

const MAX_ROUNDS = 3

/** 去掉动作词，留下指向习惯的核心词 */
function coreWords(text) {
  return String(text || '')
    .replace(/把|帮我|请|今天|一下|打卡|完成|取消|标记|勾|了|吧|呢|吗/g, '')
    .trim()
}

/**
 * 习惯名常带「30 分钟」这类后缀，用户不会念全。
 * 先全名匹配，再按核心词命中率兜底（阈值 0.6）。
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

function mock(userMessage, snapshot) {
  const text = String(userMessage || '')
  const habits = snapshot.habits || []
  const stats = snapshot.stats || {}

  if (/统计|进度|怎么样|数据|表现/.test(text)) {
    return {
      reply: '今天完成 ' + (stats.todayDone || 0) + '/' + (stats.habitCount || 0) +
        '，累计 ' + (stats.totalCheckins || 0) + ' 次。',
      actions: [],
      source: 'mock'
    }
  }

  if (/有哪些|列表|清单|习惯都/.test(text)) {
    return {
      reply: habits.map(function (h) { return (h.done ? '✓' : '○') + h.name }).join('  '),
      actions: [],
      source: 'mock'
    }
  }

  const target = findHabit(text, habits)
  if (target && /打卡|完成|取消|勾|标记/.test(text)) {
    return {
      reply: '已' + (target.done ? '取消' : '完成') + '「' + target.name + '」。',
      actions: [{ type: 'toggle', habitId: target.id }],
      source: 'mock'
    }
  }

  return {
    reply: '可以试试：「今天完成得怎么样」「把读书打卡」。',
    actions: [],
    source: 'mock'
  }
}

exports.main = async function (event) {
  const userMessage = String((event && event.userMessage) || '').trim()
  const snapshot = T.clone(event && event.snapshot)
  const actions = []
  const apiKey = process.env.DEEPSEEK_API_KEY || ''

  if (!apiKey) return mock(userMessage, snapshot)

  // 本机洞察随快照上来，模型回答「现在该做什么」时才有具体落点
  const insightLines = (snapshot.insight && snapshot.insight.lines) || []
  const system = '你是打卡助理。用工具查询或修改状态；不要编造数据。最后用一句简短中文回复用户。' +
    (insightLines.length ? ' 当前本机洞察：' + insightLines.join('；') + '。' : '')

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: userMessage }
  ]

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const msg = await chat({ apiKey: apiKey, messages: messages, tools: T.TOOLS })
      messages.push(msg)

      if (!msg.tool_calls || !msg.tool_calls.length) {
        return {
          reply: String(msg.content || '').trim() || '好的',
          actions: actions,
          source: 'model'
        }
      }

      for (let i = 0; i < msg.tool_calls.length; i++) {
        const call = msg.tool_calls[i]
        let args = {}
        try {
          args = JSON.parse(call.function.arguments || '{}')
        } catch (e) {
          args = {}
        }
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: T.runTool(call.function.name, args, snapshot, actions)
        })
      }
    }

    return { reply: '这次没处理完，换个说法试试。', actions: actions, source: 'model' }
  } catch (e) {
    return {
      reply: '模型暂时不可用，先按本地规则回答：' + mock(userMessage, snapshot).reply,
      actions: [],
      source: 'mock'
    }
  }
}
