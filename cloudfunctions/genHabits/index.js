/**
 * 云函数入口：一句描述 → 1~3 个习惯。
 *
 * 没有 DEEPSEEK_API_KEY、或模型调用失败时返回 mock，保证前端永远有东西可用。
 * 返回 { habits, source: 'model' | 'mock', error? }
 */
const { callDeepSeek } = require('./lib/deepseek.js')
const schema = require('./lib/schema.js')

exports.main = async function (event) {
  const description = String((event && event.description) || '').trim()
  const apiKey = process.env.DEEPSEEK_API_KEY || ''

  if (!apiKey) {
    return { habits: schema.mockSuggestions(description), source: 'mock' }
  }

  const prompt = schema.buildPrompt(description)
  try {
    const text = await callDeepSeek({ apiKey: apiKey, system: prompt.system, user: prompt.user })
    const habits = schema.parseSuggestions(text)
    if (!habits.length) {
      return { habits: schema.mockSuggestions(description), source: 'mock' }
    }
    return { habits: habits, source: 'model' }
  } catch (e) {
    return { habits: schema.mockSuggestions(description), source: 'mock', error: String(e.message || e) }
  }
}
