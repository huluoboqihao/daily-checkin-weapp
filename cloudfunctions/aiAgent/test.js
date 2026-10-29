/**
 * 云函数自检：node cloudfunctions/aiAgent/test.js
 * 不联网；没有 Key 时只走 mock 分支。
 */
const assert = require('assert')
const T = require('./lib/tools.js')
const fn = require('./index.js')
const { chat } = require('./lib/deepseek.js')

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

const snap = {
  habits: [{ id: 'a', name: '读书', done: false }, { id: 'b', name: '喝水', done: true }],
  stats: { todayDone: 1, habitCount: 2, totalCheckins: 10, bestStreak: 3 }
}

async function run() {
  console.log('\naiAgent 工具')

  check('toggleCheckIn 翻转快照并记录动作', function () {
    const s = T.clone(snap)
    const actions = []
    const out = JSON.parse(T.runTool('toggleCheckIn', { habitId: 'a' }, s, actions))
    assert.strictEqual(out.done, true)
    assert.strictEqual(actions.length, 1)
    assert.strictEqual(actions[0].habitId, 'a')
    assert.strictEqual(s.stats.todayDone, 2)
  })

  check('未知习惯返回错误而不是抛异常', function () {
    const s = T.clone(snap)
    const out = JSON.parse(T.runTool('toggleCheckIn', { habitId: 'zzz' }, s, []))
    assert.strictEqual(out.ok, false)
  })

  check('queryHabits 返回 JSON 数组', function () {
    const out = JSON.parse(T.runTool('queryHabits', {}, T.clone(snap), []))
    assert.strictEqual(out.length, 2)
  })

  console.log('\n入口与模型调用')

  await checkAsync('无 Key 时返回 mock 且能识别习惯名', async function () {
    const old = process.env.DEEPSEEK_API_KEY
    delete process.env.DEEPSEEK_API_KEY
    const r = await fn.main({ userMessage: '把读书打卡', snapshot: snap })
    assert.strictEqual(r.source, 'mock')
    assert.strictEqual(r.actions.length, 1)
    assert.strictEqual(r.actions[0].habitId, 'a')
    if (old) process.env.DEEPSEEK_API_KEY = old
  })

  await checkAsync('带后缀的习惯名也能触发动作', async function () {
    const old = process.env.DEEPSEEK_API_KEY
    delete process.env.DEEPSEEK_API_KEY
    const snap2 = {
      habits: [{ id: 'x', name: '读书 30 分钟', done: false }],
      stats: { todayDone: 0, habitCount: 1 }
    }
    const r = await fn.main({ userMessage: '把读书打卡', snapshot: snap2 })
    assert.strictEqual(r.actions.length, 1)
    assert.strictEqual(r.actions[0].habitId, 'x')
    if (old) process.env.DEEPSEEK_API_KEY = old
  })

  await checkAsync('chat 走注入 transport 并带回 tool_calls', async function () {
    const fake = function () {
      return Promise.resolve({
        choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: 't1', function: { name: 'getStats', arguments: '{}' } }] } }]
      })
    }
    const msg = await chat({ apiKey: 'x', messages: [], tools: T.TOOLS, transport: fake })
    assert.strictEqual(msg.tool_calls[0].function.name, 'getStats')
  })

  console.log('\n' + (failed === 0 ? '全部通过' : failed + ' 项失败') + '\n')
  process.exitCode = failed === 0 ? 0 : 1
}

run()
