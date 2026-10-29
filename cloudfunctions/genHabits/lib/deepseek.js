/**
 * 调用 DeepSeek /chat/completions。只用内置 https，不依赖全局 fetch
 *（云函数运行时不一定有 fetch）。
 *
 * transport 可注入，测试里用它替掉真实网络。
 */
const https = require('https')

function requestJson(options, body) {
  return new Promise(function (resolve, reject) {
    const req = https.request(options, function (res) {
      let buf = ''
      res.setEncoding('utf8')
      res.on('data', function (c) { buf += c })
      res.on('end', function () {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error('HTTP ' + res.statusCode + ': ' + buf.slice(0, 200)))
          return
        }
        try {
          resolve(JSON.parse(buf))
        } catch (e) {
          reject(new Error('模型返回的不是 JSON'))
        }
      })
    })
    req.on('error', reject)
    req.setTimeout(60000, function () { req.destroy(new Error('请求超时')) })
    if (body) req.write(body)
    req.end()
  })
}

/**
 * @param {object} opts { apiKey, system, user, model?, transport? }
 * @returns {Promise<string>} 模型输出的正文
 */
function callDeepSeek(opts) {
  const apiKey = opts.apiKey
  const model = opts.model || 'deepseek-chat'
  const body = JSON.stringify({
    model: model,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user }
    ],
    temperature: 0.7,
    response_format: { type: 'json_object' }
  })

  const options = {
    hostname: 'api.deepseek.com',
    path: '/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey,
      'Content-Length': Buffer.byteLength(body)
    }
  }

  const transport = opts.transport || requestJson

  return Promise.resolve(transport(options, body)).then(function (r) {
    const choice = r && r.choices && r.choices[0]
    const content = choice && choice.message && choice.message.content
    if (!content) throw new Error('模型没有返回内容')
    return content
  })
}

module.exports = {
  callDeepSeek: callDeepSeek,
  requestJson: requestJson
}
