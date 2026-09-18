import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canCheck, chipKey, chipText, emptyDraft, evaluate, isCorrect, normalize } from './answer.ts'
import type { Exercise } from './types.ts'

/**
 * 这里守的是判分正确性 —— 应用里最关键也最容易悄悄写错的一环。
 * 曾经的 bug: evaluate() 拿 draft.tokens（存的是 `词块§索引` 复合键）直接比对答案，
 * 导致组句题**永远判错**，用户无论怎么答都会掉心。
 */

const wordbank: Exercise = {
  id: 'e1',
  itemId: 'i1',
  orderIndex: 0,
  prompt: {
    kind: 'wordbank',
    kicker: '翻译这句话',
    instruction: '翻译这句话',
    source: '我每天早上喝咖啡。',
    sourceLang: 'zh',
    bank: ['coffee', 'I', 'morning', 'drink', 'every', '.'],
  },
  answer: {
    value: 'I drink coffee every morning.',
    accept: ['I drink coffee every morning'],
  },
}

/** 按学习者实际点击顺序构造 draft：词块 + 它在词池中的原始下标。 */
const pick = (...indices: number[]) => ({
  ...emptyDraft(),
  tokens: indices.map((i) => chipKey(wordbank.prompt.bank![i], i)),
})

test('chip encoding round-trips, including duplicate words', () => {
  assert.equal(chipText(chipKey('the', 3)), 'the')
  assert.equal(chipText(chipKey('bank', 0)), 'bank')
  // 同一个词的两个实例必须编成不同的键，否则重复词会互相顶掉
  assert.notEqual(chipKey('the', 1), chipKey('the', 4))
})

test('wordbank: correct order is graded correct (regression)', () => {
  // bank = ['coffee','I','morning','drink','every','.'] → 正确顺序 1,3,0,4,2,5
  const draft = pick(1, 3, 0, 4, 2, 5)
  assert.deepEqual(draft.tokens.map(chipText), ['I', 'drink', 'coffee', 'every', 'morning', '.'])
  assert.equal(evaluate(wordbank, draft), true)
})

test('wordbank: wrong order is graded wrong', () => {
  assert.equal(evaluate(wordbank, pick(0, 1, 3, 4, 2, 5)), false)
  assert.equal(evaluate(wordbank, pick(1, 3, 0)), false)
})

test('wordbank: partial answer cannot be checked yet', () => {
  assert.equal(canCheck(wordbank, pick(1, 3)), true) // 有内容就行，判错也会给正确答案
  assert.equal(canCheck(wordbank, emptyDraft()), false)
})

test('isCorrect tolerates punctuation, case and curly quotes', () => {
  const answer = { value: "I don't like it.", accept: [] }
  for (const given of ["I don't like it", "i dont like it", 'I don’t like it.', "I DON'T LIKE IT."]) {
    assert.equal(isCorrect(given, answer), true, `expected "${given}" to pass`)
  }
  assert.equal(isCorrect('I like it', answer), false)
})

test('isCorrect accepts listed alternatives', () => {
  const answer = { value: 'I drink coffee every morning.', accept: ['I drink coffee every morning'] }
  assert.equal(isCorrect('I drink coffee every morning', answer), true)
  assert.equal(isCorrect('I drink coffee in the morning.', answer), false)
})

test('normalize strips punctuation and collapses whitespace', () => {
  assert.equal(normalize('  Hello,   World!  '), 'hello world')
  // 敷号也在剥除之列：这样 "dont" 与 "don't" 视为等价，与多邻国的宽容策略一致
  assert.equal(normalize('She’s here'), 'shes here')
  assert.equal(normalize("She's here"), normalize('She’s here'))
})

test('choice kinds require a selection before checking', () => {
  const choice: Exercise = {
    ...wordbank,
    prompt: { ...wordbank.prompt, kind: 'translate_choice', choices: ['apple', 'orange'] },
    answer: { value: 'apple', accept: ['apple'] },
  }
  assert.equal(canCheck(choice, emptyDraft()), false)
  assert.equal(canCheck(choice, { ...emptyDraft(), choice: 'apple' }), true)
  assert.equal(evaluate(choice, { ...emptyDraft(), choice: 'apple' }), true)
  assert.equal(evaluate(choice, { ...emptyDraft(), choice: 'orange' }), false)
})

test('translate_input grades the typed text', () => {
  const input: Exercise = {
    ...wordbank,
    prompt: { ...wordbank.prompt, kind: 'translate_input' },
    answer: { value: 'breakfast', accept: ['breakfast'] },
  }
  assert.equal(evaluate(input, { ...emptyDraft(), text: 'breakfast' }), true)
  assert.equal(evaluate(input, { ...emptyDraft(), text: 'Breakfast!' }), true)
  assert.equal(evaluate(input, { ...emptyDraft(), text: 'lunch' }), false)
})

test('match_pairs needs every pair before checking', () => {
  const match: Exercise = {
    ...wordbank,
    prompt: {
      ...wordbank.prompt,
      kind: 'match_pairs',
      pairs: [
        { left: 'apple', right: '苹果' },
        { left: 'orange', right: '橙子' },
      ],
    },
    answer: { value: 'matched', accept: ['matched'] },
  }
  assert.equal(canCheck(match, emptyDraft()), false)
  assert.equal(canCheck(match, { ...emptyDraft(), matches: { apple: '苹果' } }), false)
  assert.equal(canCheck(match, { ...emptyDraft(), matches: { apple: '苹果', orange: '橙子' } }), true)
  assert.equal(evaluate(match, { ...emptyDraft(), matches: { apple: '苹果', orange: '橙子' } }), true)
  assert.equal(evaluate(match, { ...emptyDraft(), matches: { apple: '橙子', orange: '苹果' } }), false)
})
