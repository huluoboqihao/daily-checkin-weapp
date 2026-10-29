/**
 * 习惯建议的 JSON 契约与兜底。云函数不能引用小程序目录，所以这里保留一份
 * 独立实现 —— 契约要和 utils/aiSuggest.js 保持一致：
 *   { habits: [{ name, icon, color }] } 最多 3 条，name ≤ 12 字。
 */

const MAX = 3
const NAME_MAX = 12

const ICONS = ['💧', '🏃', '📖', '🧘', '✍', '🥗', '💪', '🌙']
const COLORS = ['#e8674a', '#4a9e6f', '#4a7ab5', '#c79a3a', '#8a6bb5', '#c25a7a']

function stripFence(text) {
  const s = String(text || '').trim()
  const m = /```(?:json)?\s*([\s\S]*?)```/i.exec(s)
  return m ? m[1].trim() : s
}

function parseSuggestions(text) {
  let data = null
  const body = stripFence(text)
  try {
    data = JSON.parse(body)
  } catch (e) {
    const a = body.indexOf('{')
    const b = body.lastIndexOf('}')
    if (a >= 0 && b > a) {
      try { data = JSON.parse(body.slice(a, b + 1)) } catch (e2) { data = null }
    }
  }
  if (!data) return []

  const raw = Array.isArray(data) ? data : (Array.isArray(data.habits) ? data.habits : [])
  const seen = {}
  const out = []

  for (let i = 0; i < raw.length && out.length < MAX; i++) {
    const item = raw[i]
    if (!item || typeof item !== 'object') continue
    const name = String(item.name || '').trim().slice(0, NAME_MAX)
    if (!name || seen[name]) continue
    seen[name] = true
    out.push({
      name: name,
      icon: ICONS.indexOf(item.icon) >= 0 ? item.icon : ICONS[out.length % ICONS.length],
      color: COLORS.indexOf(item.color) >= 0 ? item.color : COLORS[out.length % COLORS.length]
    })
  }
  return out
}

function buildPrompt(description) {
  return {
    system: [
      '你是习惯设计助手。根据用户描述，给出最多 ' + MAX + ' 个可执行的小习惯。',
      '只输出 JSON，不要解释，格式：{"habits":[{"name":"...","icon":"...","color":"..."}]}',
      'name 不超过 ' + NAME_MAX + ' 个汉字；icon 从 ' + ICONS.join('') + ' 里选；color 从 ' + COLORS.join(' ') + ' 里选。',
      '习惯要具体、当天可完成。'
    ].join('\n'),
    user: '用户描述：' + String(description || '').trim()
  }
}

const RULES = [
  { keys: ['运动', '健身', '跑步', '锻炼', '减肥', '力量', '肌肉', '增肌', '练'], names: ['力量训练 20 分钟', '拉伸 10 分钟', '喝够 8 杯水'] },
  { keys: ['读书', '学习', '考试', '英语', '单词'], names: ['读书 30 分钟', '背 20 个单词', '写学习复盘'] },
  { keys: ['睡', '早起', '熬夜', '作息'], names: ['23 点前放下手机', '早起喝一杯水', '睡前拉伸 5 分钟'] },
  { keys: ['工作', '效率', '拖延', '项目'], names: ['先做最重要的 1 件', '写今日待办', '下班前整理桌面'] }
]

function mockSuggestions(description) {
  const text = String(description || '')
  let names = null
  for (let i = 0; i < RULES.length; i++) {
    if (RULES[i].keys.some(function (k) { return text.indexOf(k) >= 0 })) {
      names = RULES[i].names
      break
    }
  }
  if (!names) names = ['喝够 8 杯水', '走 6000 步', '读 10 页书']

  return names.slice(0, MAX).map(function (name, i) {
    return { name: name, icon: ICONS[i % ICONS.length], color: COLORS[i % COLORS.length] }
  })
}

module.exports = {
  ICONS: ICONS,
  COLORS: COLORS,
  parseSuggestions: parseSuggestions,
  buildPrompt: buildPrompt,
  mockSuggestions: mockSuggestions
}
