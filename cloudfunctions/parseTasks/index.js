/**
 * 云函数入口：一段文字 → 待办数组。
 * 没有 Key 时返回空数组，由客户端用本地规则兜底。
 */
const { callDeepSeek } = require('./lib/deepseek.js')

const SYSTEM = [
  '你是待办抽取器。从聊天记录/通知里找出「需要用户在哪天做什么」。',
  '只输出 JSON：{"tasks":[{"title","date","startTime","durationMin","location","priority","confidence","evidence"}]}',
  '规则：',
  '- title ≤ 24 字，动词开头；',
  '- date 用 YYYY-MM-DD，以今天（{TODAY}）为基准换算「明天/周五」；没有明确日期就留空；',
  '- startTime 用 HH:mm，没写具体时间就留空，不要猜；',
  '- durationMin 默认 30，出现「小时」按 60 算；',
  '- location 只填出现的地点名，没有就留空；',
  '- priority: 1 高 / 2 中 / 3 低；',
  '- confidence 0~1；',
  '- evidence 写原文里对应的那一句（≤40 字）。',
  '忽略闲聊、表情和与用户无关的内容。最多 10 条。'
].join('\n')

function stripFence(text) {
  const s = String(text || '').trim()
  const m = /```(?:json)?\s*([\s\S]*?)```/i.exec(s)
  return m ? m[1].trim() : s
}

function parseTasks(text) {
  let data = null
  try {
    data = JSON.parse(stripFence(text))
  } catch (e) {
    const a = String(text).indexOf('{')
    const b = String(text).lastIndexOf('}')
    if (a >= 0 && b > a) {
      try { data = JSON.parse(String(text).slice(a, b + 1)) } catch (e2) { data = null }
    }
  }
  if (!data) return []
  return Array.isArray(data) ? data : (Array.isArray(data.tasks) ? data.tasks : [])
}

exports.main = async function (event) {
  const text = String((event && event.text) || '').trim()
  const today = String((event && event.today) || '')
  const apiKey = process.env.DEEPSEEK_API_KEY || ''

  if (!text || !apiKey) return { tasks: [], source: 'fallback' }

  try {
    const content = await callDeepSeek({
      apiKey: apiKey,
      system: SYSTEM.replace('{TODAY}', today),
      user: '今天日期：' + today + '\n\n原文：\n' + text.slice(0, 4000)
    })
    const tasks = parseTasks(content)
    return { tasks: tasks, source: tasks.length ? 'model' : 'fallback' }
  } catch (e) {
    return { tasks: [], source: 'fallback', error: String(e.message || e) }
  }
}

exports._parseTasks = parseTasks
