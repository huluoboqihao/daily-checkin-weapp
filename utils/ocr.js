/**
 * 截图 OCR：调用本机 OCR 服务（tesseract.js，中文），不依赖 VisionKit。
 *
 * 之前用的 wx.createVKSession 在这台机器/这个基础库上不回调，等于不可用；
 * 现在改走 config.ocrProxy 指向的本地服务（tools/ocr-service）。
 * 生产环境要把它换成云函数 OCR 或视觉模型，接口契约保持一样。
 */
const config = require('../config.js')

/** tesseract 会在汉字之间插空格，解析前先合回去 */
function cleanText(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/([\u4e00-\u9fa5])[ \t]+(?=[\u4e00-\u9fa5])/g, '$1')
    .replace(/([\u4e00-\u9fa5])[ \t]+(?=\d)/g, '$1')
    .replace(/(\d)[ \t]+(?=[\u4e00-\u9fa5])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function recognize(filePath) {
  return new Promise(function (resolve) {
    if (!filePath) return resolve({ text: '', reason: 'no_image' })

    const base = config.ocrProxy
    if (!base) return resolve({ text: '', reason: 'unconfigured' })

    wx.getFileSystemManager().readFile({
      filePath: filePath,
      encoding: 'base64',
      success: function (res) {
        wx.request({
          url: base.replace(/\/$/, '') + '/ocr',
          method: 'POST',
          data: { image: res.data },
          timeout: 60000,
          success: function (r) {
            const d = (r && r.data) || {}
            const text = cleanText(d.text)
            if (!text) return resolve({ text: '', reason: 'empty' })
            resolve({ text: text, reason: 'ok', confidence: d.confidence })
          },
          fail: function (e) {
            resolve({ text: '', reason: 'request_failed', error: (e && e.errMsg) || '' })
          }
        })
      },
      fail: function () {
        resolve({ text: '', reason: 'read_failed' })
      }
    })
  })
}

module.exports = { recognize: recognize, cleanText: cleanText }
