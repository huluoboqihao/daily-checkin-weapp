/**
 * 极简错误记录：不联网、不上报，只在本机留最近 20 条。
 *
 * 比赛/评审环境没有监控后端，但「崩溃后完全不知道发生过什么」更糟。
 * 这里只存错误摘要和时间，不含用户数据；需要时可在调试页或反馈里导出。
 */

const KEY = 'error_log'
const MAX = 20

function record(err) {
  try {
    const msg = String((err && (err.message || err.errMsg)) || err || 'unknown').slice(0, 200)
    const list = wx.getStorageSync(KEY) || []
    list.unshift({ at: new Date().toISOString(), msg: msg })
    wx.setStorageSync(KEY, list.slice(0, MAX))
  } catch (e) { /* 记录失败不影响主流程 */ }
}

function list() {
  try {
    return wx.getStorageSync(KEY) || []
  } catch (e) {
    return []
  }
}

function clear() {
  try { wx.removeStorageSync(KEY) } catch (e) { /* ignore */ }
}

module.exports = { record: record, list: list, clear: clear }
