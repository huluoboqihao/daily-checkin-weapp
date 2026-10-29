/**
 * AI 能力的唯一入口。
 *
 * 页面只认三个方法：genHabits / parseTasks / callAgent（外加流式 streamCoach）。
 * 云环境、云函数名、本地兜底都在这里收口，页面不关心当前走的是哪条路。
 *
 *   task       云函数          本地兜底
 *   genHabits  genHabits       utils/aiSuggest.mockSuggestions
 *   parseTasks parseTasks      utils/parseTasks.parseText
 *   agent      aiAgent         utils/agent.mockAgent
 *   coach      —              utils/coach.buildCoachReply（流式）
 */
const config = require('../config.js')
const suggest = require('../utils/aiSuggest.js')
const coach = require('../utils/coach.js')
const agent = require('../utils/agent.js')
const parse = require('../utils/parseTasks.js')
const store = require('../utils/store.js')

const CLOUD_FN = {
  genHabits: 'genHabits',
  parseTasks: 'parseTasks',
  agent: 'aiAgent'
}

function cloudReady() {
  return !!config.cloudEnv
}

/** 每个 task 的本地实现，永远返回一个可用结果 */
function localRun(task, payload) {
  const p = payload || {}

  if (task === 'genHabits') {
    return { habits: suggest.mockSuggestions(p.description || ''), source: 'mock' }
  }

  if (task === 'parseTasks') {
    const r = parse.parseText(p.text || '', p.today ? new Date(p.today + 'T12:00:00') : new Date())
    return { tasks: r.tasks, source: 'fallback' }
  }

  if (task === 'agent') {
    const r = agent.mockAgent(p.message || '', p.snapshot || {})
    return { reply: r.reply, actions: r.actions, source: 'mock' }
  }

  return {}
}

/**
 * 统一的非流式调用。云失败一律回落本地，不把错误抛给页面。
 * @returns {Promise<object>} 结果里始终带 source
 */
function run(task, payload) {
  const p = payload || {}
  const fallback = function () { return localRun(task, p) }

  if (!cloudReady()) return Promise.resolve(fallback())

  const fn = CLOUD_FN[task]
  if (!fn) return Promise.resolve(fallback())

  return new Promise(function (resolve) {
    wx.cloud.callFunction({ name: fn, data: p })
      .then(function (res) {
        const r = (res && res.result) || {}
        // 云端没给出有效结果时同样回落
        if (task === 'genHabits' && !(r.habits && r.habits.length)) return resolve(fallback())
        if (task === 'parseTasks' && !(r.tasks && r.tasks.length)) return resolve(fallback())
        if (task === 'agent' && !r.reply) return resolve(fallback())
        resolve(r)
      })
      .catch(function () { resolve(fallback()) })
  })
}

/** 生成习惯建议 */
function genHabits(description) {
  const desc = String(description || '').trim()
  return run('genHabits', { description: desc }).then(function (r) {
    const habits = suggest.parseSuggestions(JSON.stringify(r.habits || []), store.ICONS, store.COLORS)
    return {
      habits: habits.length ? habits : suggest.mockSuggestions(desc),
      source: r.source || 'mock'
    }
  })
}

/** 从文字里抽待办 */
function parseTasks(text, today) {
  const day = parse.dateKey(today || new Date())
  return run('parseTasks', { text: String(text || ''), today: day }).then(function (r) {
    const tasks = parse.normalizeTasks(r.tasks, today)
    return {
      tasks: tasks.length ? tasks : parse.parseText(text, today).tasks,
      source: r.source || 'fallback'
    }
  })
}

function lastUser(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].content
  }
  return ''
}

/**
 * 流式对话。云环境走 wx.cloud.extend.AI（参数必须包在 data 里），
 * 否则按固定节奏分片吐本地兜底回复。返回 { stop }。
 */
function streamCoach(messages, handlers) {
  const h = handlers || {}
  let stopped = false
  let timer = null

  if (cloudReady() && wx.cloud && wx.cloud.extend && wx.cloud.extend.AI) {
    try {
      const model = wx.cloud.extend.AI.createModel('cloudbase')
      const res = model.streamText({
        data: { model: config.llmModel, messages: messages }
      })

      const runStream = async function () {
        try {
          for await (const chunk of res.textStream) {
            if (stopped) break
            if (h.onText) h.onText(String(chunk))
          }
          if (!stopped && h.onDone) h.onDone()
        } catch (e) {
          if (!stopped && h.onError) h.onError(e)
        }
      }
      runStream()

      return {
        stop: function () {
          stopped = true
          if (res && typeof res.abort === 'function') res.abort()
        }
      }
    } catch (e) {
      // 云能力不可用就落本地
    }
  }

  const full = coach.buildCoachReply(lastUser(messages), h.stats, h.insightLines)
  let i = 0
  timer = setInterval(function () {
    if (stopped) {
      clearInterval(timer)
      return
    }
    if (h.onText) h.onText(full.slice(i, i + 2))
    i += 2
    if (i >= full.length) {
      clearInterval(timer)
      if (h.onDone) h.onDone()
    }
  }, 40)

  return {
    stop: function () {
      stopped = true
      if (timer) clearInterval(timer)
    }
  }
}

/** 自然语言操作：云端只回动作，落地由页面调 store */
function callAgent(message, snapshot) {
  return run('agent', { userMessage: message, message: message, snapshot: snapshot }).then(function (r) {
    return {
      reply: String(r.reply || ''),
      actions: Array.isArray(r.actions) ? r.actions : [],
      source: r.source || 'mock'
    }
  })
}

module.exports = {
  cloudReady: cloudReady,
  run: run,
  genHabits: genHabits,
  parseTasks: parseTasks,
  streamCoach: streamCoach,
  callAgent: callAgent
}
