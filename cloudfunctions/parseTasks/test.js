/**
 * 云函数自检：node cloudfunctions/parseTasks/test.js（不联网）
 */
const assert = require('assert')
const fn = require('./index.js')

let failed = 0
function check(label, f) {
  try { f(); console.log('  ok    ' + label) } catch (e) { failed++; console.log('  FAIL  ' + label + '  ' + e.message) }
}

async function checkAsync(label, f) {
  try { await f(); console.log('  ok    ' + label) } catch (e) { failed++; console.log('  FAIL  ' + label + '  ' + e.message) }
}

async function run() {
  console.log('\nparseTasks')

  check('解析裸数组', function () {
    const r = fn._parseTasks('[{"title":"交周报","date":"2026-10-30"}]')
    assert.strictEqual(r.length, 1)
    assert.strictEqual(r[0].title, '交周报')
  })

  check('解析 {tasks:[]} 与围栏', function () {
    const r = fn._parseTasks('```json\n{"tasks":[{"title":"开会"}]}\n```')
    assert.strictEqual(r.length, 1)
  })

  check('坏 JSON 返回空数组', function () {
    assert.deepStrictEqual(fn._parseTasks('不是 json'), [])
  })

  await checkAsync('无 Key 时返回 fallback', async function () {
    const old = process.env.DEEPSEEK_API_KEY
    delete process.env.DEEPSEEK_API_KEY
    const r = await fn.main({ text: '明天下午三点交周报', today: '2026-10-27' })
    assert.strictEqual(r.source, 'fallback')
    assert.strictEqual(r.tasks.length, 0)
    if (old) process.env.DEEPSEEK_API_KEY = old
  })

  console.log('\n' + (failed === 0 ? '全部通过' : failed + ' 项失败') + '\n')
  process.exitCode = failed === 0 ? 0 : 1
}

run()
