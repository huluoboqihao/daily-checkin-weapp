/**
 * AI 习惯推荐的纯逻辑：拼 prompt、解析模型输出、无模型时的确定性兜底。
 *
 * 不引用 wx，客户端和 node 单测共用。云函数里有一份独立实现（云函数不能
 * 引用小程序目录），两边用同一份 JSON 契约，见 cloudfunctions/genHabits。
 */

const MAX_SUGGESTIONS = 3
const NAME_MAX = 12

/** 模型偶尔会包 ```json 围栏，或者前后带解释文字 */
function stripFence(text) {
  const s = String(text || '').trim()
  const m = /```(?:json)?\s*([\s\S]*?)```/i.exec(s)
  return m ? m[1].trim() : s
}

function safeJson(text) {
  const body = stripFence(text)
  try {
    return JSON.parse(body)
  } catch (e) {
    // 再退一步：截取第一个 [ 到最后一个 ] 或 { 到 }
    const arr = body.indexOf('[')
    const arrEnd = body.lastIndexOf(']')
    if (arr >= 0 && arrEnd > arr) {
      try { return JSON.parse(body.slice(arr, arrEnd + 1)) } catch (e2) { /* ignore */ }
    }
    return null
  }
}

/**
 * 把模型输出解析成合法的建议列表。
 *
 * 容忍两种外形：直接数组，或 { habits: [...] }。
 * 非法/超长/重复的一律丢掉，而不是抛错 —— 模型输出不该让页面崩。
 */
function parseSuggestions(text, icons, colors) {
  const data = safeJson(text)
  if (!data) return []

  const raw = Array.isArray(data) ? data : (Array.isArray(data.habits) ? data.habits : [])
  const iconPool = icons && icons.length ? icons : ['✅']
  const colorPool = colors && colors.length ? colors : ['#e8674a']
  const seen = {}
  const out = []

  for (let i = 0; i < raw.length && out.length < MAX_SUGGESTIONS; i++) {
    const item = raw[i]
    if (!item || typeof item !== 'object') continue

    const name = String(item.name || '').trim().slice(0, NAME_MAX)
    if (!name || seen[name]) continue
    seen[name] = true

    const icon = iconPool.indexOf(item.icon) >= 0 ? item.icon : iconPool[out.length % iconPool.length]
    const color = colorPool.indexOf(item.color) >= 0 ? item.color : colorPool[out.length % colorPool.length]

    out.push({ name: name, icon: icon, color: color })
  }

  return out
}

function buildSuggestPrompt(description) {
  return {
    system: [
      '你是习惯设计助手。根据用户描述，给出最多 ' + MAX_SUGGESTIONS + ' 个可执行的小习惯。',
      '只输出 JSON，不要解释，格式：{"habits":[{"name":"...","icon":"...","color":"..."}]}',
      '要求：name 不超过 ' + NAME_MAX + ' 个汉字；icon 从给定列表里选一个；color 用给定色值之一。',
      '习惯必须具体、当天可完成，不要“变优秀”这类空话。'
    ].join('\n'),
    user: '用户描述：' + String(description || '').trim()
  }
}

const MOCK_RULES = [
  { keys: ['运动', '健身', '跑步', '锻炼', '减肥', '力量', '肌肉', '增肌', '练'], names: ['力量训练 20 分钟', '拉伸 10 分钟', '喝够 8 杯水'] },
  { keys: ['读书', '学习', '考试', '英语', '单词'], names: ['读书 30 分钟', '背 20 个单词', '写学习复盘'] },
  { keys: ['睡', '早起', '熬夜', '作息'], names: ['23 点前放下手机', '早起喝一杯水', '睡前拉伸 5 分钟'] },
  { keys: ['工作', '效率', '拖延', '项目'], names: ['先做最重要的 1 件', '写今日待办', '下班前整理桌面'] }
]

/**
 * 没有模型时的确定性兜底：按关键词给一组可执行建议。
 * 同样的输入永远得到同样的输出，方便测试。
 */
function mockSuggestions(description) {
  const text = String(description || '')
  let names = null

  for (let i = 0; i < MOCK_RULES.length; i++) {
    const rule = MOCK_RULES[i]
    if (rule.keys.some(function (k) { return text.indexOf(k) >= 0 })) {
      names = rule.names
      break
    }
  }

  if (!names) names = ['喝够 8 杯水', '走 6000 步', '读 10 页书']

  const icons = ['💧', '🏃', '📖']
  const colors = ['#4a7ab5', '#4a9e6f', '#c79a3a']

  return names.slice(0, MAX_SUGGESTIONS).map(function (name, i) {
    return { name: name, icon: icons[i % icons.length], color: colors[i % colors.length] }
  })
}

module.exports = {
  MAX_SUGGESTIONS: MAX_SUGGESTIONS,
  NAME_MAX: NAME_MAX,
  parseSuggestions: parseSuggestions,
  buildSuggestPrompt: buildSuggestPrompt,
  mockSuggestions: mockSuggestions
}
