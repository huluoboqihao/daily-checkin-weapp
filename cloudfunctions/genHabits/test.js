/**
 * 云函数自检：node cloudfunctions/genHabits/test.js
 * 不联网 —— 模型调用用注入的 transport 替掉。
 */
const assert = require('assert')
const schema = require('./lib/schema.js')
const { callDeepSeek } = require('./lib/deepseek.js')
const fn = require('./index.js')

let failed = 0

function check(label, fnc) {
  try {
    fnc()
    console.log('  ok    ' + label)
  } catch (e) {
    failed++
    console.log('  FAIL  ' + label + '  ' + e.message)
  }
}

async function checkAsync(label, fnc) {
  try {
    await fnc()
    console.log('  ok    ' + label)
  } catch (e) {
    failed++
    console.log('  FAIL  ' + label + '  ' + e.message)
  }
}

async function run() {
  console.log('\ngenHabits 解析')

  check('直接数组', function () {
    const got = schema.parseSuggestions('[{"name":"晨跑","icon":"🏃","color":"#4a9e6f"}]')
    assert.strictEqual(got.length, 1)
    assert.strictEqual(got[0].name, '晨跑')
  })

  check('带 ```json 围栏', function () {
    const got = schema.parseSuggestions('```json\n{"habits":[{"name":"读书","icon":"📖","color":"#c79a3a"}]}\n```')
    assert.strictEqual(got.length, 1)
    assert.strictEqual(got[0].name, '读书')
  })

  check('超过 3 条只取 3 条', function () {
    const raw = { habits: [1, 2, 3, 4, 5].map(function (i) { return { name: '习惯' + i } }) }
    assert.strictEqual(schema.parseSuggestions(JSON.stringify(raw)).length, 3)
  })

  check('名称截到 12 字', function () {
    const got = schema.parseSuggestions('[{"name":"一二三四五六七八九十一二三四五"}]')
    assert.strictEqual(got[0].name.length, 12)
  })

  check('非法 JSON 返回空数组', function () {
    assert.deepStrictEqual(schema.parseSuggestions('不是 json'), [])
  })

  check('重复名称去重', function () {
    const got = schema.parseSuggestions('[{"name":"喝水"},{"name":"喝水"}]')
    assert.strictEqual(got.length, 1)
  })

  console.log('\n兜底与调用')

  check('mock 对同一输入稳定', function () {
    const a = schema.mockSuggestions('我想健身')
    const b = schema.mockSuggestions('我想健身')
    assert.deepStrictEqual(a, b)
    assert.ok(a.length >= 1 && a.length <= 3)
  })

  check('关键词命中运动类', function () {
    const a = schema.mockSuggestions('想开始健身')
    assert.strictEqual(a[0].name, '力量训练 20 分钟')
  })

  await checkAsync('无 Key 时入口返回 mock', async function () {
    const old = process.env.DEEPSEEK_API_KEY
    delete process.env.DEEPSEEK_API_KEY
    const r = await fn.main({ description: '想读书' })
    assert.strictEqual(r.source, 'mock')
    assert.ok(r.habits.length >= 1)
    if (old) process.env.DEEPSEEK_API_KEY = old
  })

  await checkAsync('callDeepSeek 走注入 transport', async function () {
    const fake = function () {
      return Promise.resolve({ choices: [{ message: { content: '{"habits":[{"name":"拉伸"}]}' } }] })
    }
    const text = await callDeepSeek({ apiKey: 'x', system: 's', user: 'u', transport: fake })
    assert.ok(text.indexOf('拉伸') >= 0)
  })

  console.log('\n' + (failed === 0 ? '全部通过' : failed + ' 项失败') + '\n')
  process.exitCode = failed === 0 ? 0 : 1
}

run()
