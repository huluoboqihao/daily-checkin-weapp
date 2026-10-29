/**
 * AI 教练的纯逻辑：把统计数据拼成上下文、没有模型时的确定性回复。
 *
 * 上下文只带聚合数字，不带具体习惯名 —— 既够模型判断趋势，
 * 又不会把用户的私人清单塞进 prompt。
 */

function n(v) {
  const x = Number(v)
  return isFinite(x) ? x : 0
}

function buildCoachContext(stats, insightLines) {
  const s = stats || {}
  const base = [
    '累计打卡 ' + n(s.totalCheckins) + ' 次',
    '最长连续 ' + n(s.bestStreak) + ' 天',
    '活跃 ' + n(s.activeDays) + ' 天',
    '今天完成 ' + n(s.todayDone) + '/' + n(s.habitCount)
  ]
  const lines = (insightLines || []).filter(Boolean).slice(0, 3)
  if (lines.length) base.push('当前洞察：' + lines.join('；'))
  return base.join('，')
}

/**
 * 本地兜底回复。按问题里的关键词分几类，数字全部来自真实统计，
 * 不用随机文案 —— 同一份数据同一句话，测试才能断言。
 */
function buildCoachReply(question, stats, insightLines) {
  const q = String(question || '')
  const s = stats || {}
  const total = n(s.totalCheckins)
  const best = n(s.bestStreak)
  const active = n(s.activeDays)
  const lines = (insightLines || []).filter(Boolean)

  if (/放弃|坚持不下去|没动力|累了/.test(q)) {
    if (best >= 7) {
      return '你已经连续坚持过 ' + best + ' 天，说明这件事你做得到。今天不用加量，先把最容易的那个习惯打上卡，连续性就保住了。'
    }
    return '先别追求连续很多天。把目标降到「今天只做一个」，完成一次就算赢；累计 ' + total + ' 次也是从第一次开始的。'
  }

  // 有真实洞察时优先说具体的那一条，而不是泛泛而谈
  if (/今天|现在|干嘛|做什么|建议|怎么|提高|改进|方法/.test(q) && lines.length) {
    return '结合你最近的记录：' + lines.slice(0, 2).join('；') +
      '。今天先处理这一条，比同时改所有习惯有效。'
  }

  if (/怎么|建议|提高|改进|方法/.test(q)) {
    return '看你的数据：累计 ' + total + ' 次、活跃 ' + active + ' 天、最长连续 ' + best + ' 天。建议挑一个最稳定的习惯固定在每天同一时间，其余保持现状；连续天数比总次数更能说明节奏。'
  }

  if (/今天|现在|干嘛|做什么/.test(q)) {
    return '今天先看完成度：' + n(s.todayDone) + '/' + n(s.habitCount) + '。还没完成的话，从最简单的一个开始；都完成了就别加码，保持节奏更重要。'
  }

  return '你的累计打卡是 ' + total + ' 次，最长连续 ' + best + ' 天，活跃 ' + active + ' 天。想聊具体哪一部分？比如「怎么坚持下去」或者「今天该做什么」。'
}

module.exports = {
  buildCoachContext: buildCoachContext,
  buildCoachReply: buildCoachReply
}
