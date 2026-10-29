/**
 * 显示偏好：深色模式与字号。
 *
 * 主题只写两个值（light / dark），首次跟随系统，用户手动切过之后以手动为准。
 * 各页把 themeClass / fontClass 挂到 .page 根节点上；app.wxss 里
 * `.theme-dark` 覆盖配色，`.font-lg` / `.font-xl` 只改 --fs 变量，
 * 所有字号统一写成 calc(Nrpx * var(--fs))，避免逐条改样式。
 */

const THEME_KEY = 'display_theme'
const FONT_KEY = 'display_font'

function systemTheme() {
  try {
    const s = wx.getSystemInfoSync()
    return s.theme === 'dark' ? 'dark' : 'light'
  } catch (e) {
    return 'light'
  }
}

function theme() {
  try {
    const saved = wx.getStorageSync(THEME_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch (e) { /* ignore */ }
  return systemTheme()
}

function setTheme(t) {
  try { wx.setStorageSync(THEME_KEY, t === 'dark' ? 'dark' : 'light') } catch (e) { /* ignore */ }
  return theme()
}

/** 切一次：深色 ↔ 浅色 */
function toggleTheme() {
  return setTheme(theme() === 'dark' ? 'light' : 'dark')
}

/** 0 标准 / 1 大 / 2 特大 */
function fontLevel() {
  try {
    const n = Number(wx.getStorageSync(FONT_KEY))
    if (n === 1 || n === 2) return n
  } catch (e) { /* ignore */ }
  return 0
}

function cycleFont() {
  const next = (fontLevel() + 1) % 3
  try { wx.setStorageSync(FONT_KEY, next) } catch (e) { /* ignore */ }
  return next
}

const FONT_LABELS = ['标准', '大', '特大']
const FONT_CLASSES = ['', 'font-lg', 'font-xl']

/** 页面 onShow 时 setData 这一份即可 */
function classes() {
  const isDark = theme() === 'dark'
  const lv = fontLevel()
  return {
    themeClass: isDark ? 'theme-dark' : '',
    fontClass: FONT_CLASSES[lv],
    fontLabel: FONT_LABELS[lv],
    isDark: isDark
  }
}

/** 原生导航栏 / TabBar 跟着主题走；失败不影响页面 */
function applyChrome() {
  const dark = theme() === 'dark'
  try {
    if (wx.setNavigationBarColor) {
      wx.setNavigationBarColor({
        frontColor: dark ? '#ffffff' : '#000000',
        backgroundColor: dark ? '#000000' : '#F2F2F7'
      })
    }
  } catch (e) { /* ignore */ }
  try {
    if (wx.setTabBarStyle) {
      wx.setTabBarStyle({
        color: '#8E8E93',
        selectedColor: '#FF6B4A',
        backgroundColor: dark ? '#1C1C1E' : '#FFFFFF',
        borderStyle: dark ? 'black' : 'white'
      })
    }
  } catch (e) { /* ignore */ }
}

module.exports = {
  theme: theme,
  setTheme: setTheme,
  toggleTheme: toggleTheme,
  fontLevel: fontLevel,
  cycleFont: cycleFont,
  classes: classes,
  applyChrome: applyChrome
}
