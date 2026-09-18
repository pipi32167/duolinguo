import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blankPick, pickPair } from './match.ts'

const pairs = [
  { left: 'apple', right: '苹果' },
  { left: 'orange', right: '橙子' },
]

/**
 * 这里守的是配对题的交互判定 —— 曾经左右两列在手机上折成单列、
 * 且必须「先左后右」才能配对，先点释义的点击是死区。
 */
const blank = blankPick()

test('left then matching right records the pair and clears selection', () => {
  const s1 = pickPair(pairs, blank, 'left', 'apple')
  assert.equal(s1.selLeft, 'apple')
  const s2 = pickPair(pairs, s1, 'right', '苹果')
  assert.deepEqual(s2.matches, { apple: '苹果' })
  assert.equal(s2.selLeft, null)
  assert.equal(s2.wrong, null)
})

test('right first then left also completes the pair (either order)', () => {
  const s1 = pickPair(pairs, blank, 'right', '苹果')
  assert.equal(s1.selRight, '苹果')
  const s2 = pickPair(pairs, s1, 'left', 'apple')
  assert.deepEqual(s2.matches, { apple: '苹果' })
  assert.equal(s2.selRight, null)
})

test('wrong pair flashes red without recording, selection resets', () => {
  const s1 = pickPair(pairs, blank, 'left', 'apple')
  const s2 = pickPair(pairs, s1, 'right', '橙子')
  assert.deepEqual(s2.matches, {})
  assert.deepEqual(s2.wrong, { left: 'apple', right: '橙子' })
  assert.equal(s2.selLeft, null)
})

test('tapping an already matched chip is ignored', () => {
  const done = { ...blankPick(), matches: { apple: '苹果' } }
  assert.deepEqual(pickPair(pairs, done, 'left', 'apple'), done)
  assert.deepEqual(pickPair(pairs, done, 'right', '苹果'), done)
})

test('picking the same side twice replaces the selection', () => {
  const s1 = pickPair(pairs, blank, 'left', 'apple')
  const s2 = pickPair(pairs, s1, 'left', 'orange')
  assert.equal(s2.selLeft, 'orange')
  assert.deepEqual(s2.matches, {})
})

test('matching tolerates punctuation/case via normalize', () => {
  const loose = [{ left: "don't", right: '不要' }]
  const s1 = pickPair(loose, blank, 'left', "don’t")
  const s2 = pickPair(loose, s1, 'right', '不要')
  assert.deepEqual(s2.matches, { "don't": '不要' })
})
