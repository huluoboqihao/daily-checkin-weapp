const config = require('./config.js')
const monitor = require('./utils/monitor.js')

App({
  // 只在本机留最近 20 条错误摘要，不上报
  onError(err) {
    monitor.record(err)
  },

  onUnhandledRejection(res) {
    monitor.record((res && res.reason) || 'unhandled rejection')
  },

  onLaunch() {
    // 只有配了云环境才初始化 —— 没配时 wx.cloud 完全不用，
    // 不影响本地存储与所有离线功能。
    if (config.cloudEnv && wx.cloud) {
      wx.cloud.init({ env: config.cloudEnv, traceUser: true })
    }

    // 先迁移旧数据，再铺示例数据 —— 顺序反了会把老用户的数据盖掉
    const store = require('./utils/store.js')
    store.migrate()

    // 首次打开铺一套示例数据（几个习惯 + 一段打卡记录），别让首页是三条零。
    // 只在「一条习惯都没有 / 一条记录都没有」时才铺，已经用过的人不受影响。
    store.ensureSeed()
  }
})
