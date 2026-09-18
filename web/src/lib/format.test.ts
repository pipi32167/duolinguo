import { test } from 'node:test'
import assert from 'node:assert/strict'
import { goalHint } from './format.ts'

/**
 * 守「今日目标」的引导语：旧实现只要没达标就说「连续天数不会断」，
 * 全新用户（词库 0 词 / streak 0）看到的是假承诺。
 */

test('达标后提示明天的复习队列', () => {
  const hint = goalHint({ todayMin: 12, goalMin: 10, streak: 3, deckTotal: 40 })
  assert.match(hint, /今天的量已经够了/)
})

test('词库为空时不谈连续天数，改为引导拍照加词', () => {
  const hint = goalHint({ todayMin: 0, goalMin: 10, streak: 0, deckTotal: 0 })
  assert.match(hint, /词库还是空的/)
  assert.ok(!hint.includes('连续'))
})

test('streak 为 0 时只说目标，不承诺连续天数', () => {
  const hint = goalHint({ todayMin: 0, goalMin: 10, streak: 0, deckTotal: 20 })
  assert.equal(hint, '再学 10 分钟就能完成今天的 10 分钟目标。')
  assert.ok(!hint.includes('连续'))
})

test('有连续天数时把天数写进去', () => {
  const hint = goalHint({ todayMin: 4, goalMin: 10, streak: 7, deckTotal: 20 })
  assert.equal(hint, '再学 6 分钟就能收工，连续 7 天不会断。')
})

test('剩余时间不会算成 0 或负数', () => {
  const hint = goalHint({ todayMin: 9.6, goalMin: 10, streak: 2, deckTotal: 20 })
  assert.match(hint, /再学 1 分钟/)
})

/**
 * 回归：达标分支必须排在词库为空之后。
 * 先学满 10 分钟、再 POST /items/delete 清空词库，就能同时满足
 * 「目标已达标」和「deckTotal = 0」；那一刻页面上没有复习队列，
 * 也没有 SRS 总览，再承诺「会加长明天的复习队列」就是假话。
 */
test('达标但词库为空时，不承诺明天的复习队列', () => {
  const hint = goalHint({ todayMin: 11, goalMin: 10, streak: 14, deckTotal: 0 })
  assert.ok(!hint.includes('复习队列'), `不该出现「复习队列」: ${hint}`)
  assert.ok(!hint.includes('连续'), `不该出现「连续」: ${hint}`)
  assert.match(hint, /词库还是空的/)
  assert.match(hint, /今日目标已完成/)
})

test('词库为空优先于达标分支（同分钟数下两种状态文案不同）', () => {
  const withDeck = goalHint({ todayMin: 11, goalMin: 10, streak: 3, deckTotal: 40 })
  const noDeck = goalHint({ todayMin: 11, goalMin: 10, streak: 3, deckTotal: 0 })
  assert.notEqual(withDeck, noDeck)
  assert.match(withDeck, /复习队列/)
  assert.ok(!noDeck.includes('复习队列'))
})
