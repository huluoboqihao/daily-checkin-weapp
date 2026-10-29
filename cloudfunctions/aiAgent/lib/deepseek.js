/**
 * 带 tools 的 DeepSeek 调用。返回 assistant message（可能含 tool_calls）。
 * transport 可注入，测试不联网。
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

function chat(opts) {
  const body = JSON.stringify({
    model: opts.model || 'deepseek-chat',
    messages: opts.messages,
    tools: opts.tools,
    tool_choice: 'auto',
    temperature: 0.2
  })

  const options = {
    hostname: 'api.deepseek.com',
    path: '/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + opts.apiKey,
      'Content-Length': Buffer.byteLength(body)
    }
  }

  const transport = opts.transport || requestJson

  return Promise.resolve(transport(options, body)).then(function (r) {
    const choice = r && r.choices && r.choices[0]
    if (!choice || !choice.message) throw new Error('模型没有返回消息')
    return choice.message
  })
}

module.exports = {
  chat: chat,
  requestJson: requestJson
}
