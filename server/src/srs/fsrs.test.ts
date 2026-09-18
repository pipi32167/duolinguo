import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  forgettingCurve,
  humanizeInterval,
  intervalFor,
  preview,
  retrievability,
  schedule,
  type SrsCard,
} from './fsrs.ts'

const DAY = 86_400_000
const T0 = Date.UTC(2026, 0, 1, 8, 0, 0)

const freshCard: SrsCard = {
  srs_state: 'new',
  stability: 0,
  difficulty: 0,
  due_at: 0,
  last_review: null,
  reps: 0,
  lapses: 0,
  step: 0,
}

test('forgetting curve: retention is 90% exactly at t = stability', () => {
  for (const s of [1, 3.7145, 12.97, 100]) {
    const r = retrievability(s, s)
    assert.ok(Math.abs(r - 0.9) < 1e-9, `R(S=${s}) = ${r}, expected 0.9`)
  }
})

test('forgetting curve is monotonically decreasing', () => {
  const curve = forgettingCurve(10, { days: 30, samples: 30 })
  for (let i = 1; i < curve.length; i++) {
    assert.ok(curve[i].retention < curve[i - 1].retention, `not decreasing at sample ${i}`)
  }
  assert.ok(Math.abs(curve[0].retention - 1) < 1e-9)
})

test('intervalFor is the inverse of retrievability', () => {
  const s = 30
  const days = intervalFor(s, 0.9)
  assert.ok(Math.abs(retrievability(days, s) - 0.9) < 1e-6)
})

test('a new card graded "again" stays in learning with a minute-scale step', () => {
  const next = schedule(freshCard, 1, T0)
  assert.equal(next.srs_state, 'learning')
  assert.ok(next.due_at - T0 <= 2 * 60_000)
  assert.ok(next.intervalDays < 0.01)
})

test('a new card graded "good" graduates to review with a multi-day interval', () => {
  const next = schedule(freshCard, 3, T0)
  assert.equal(next.srs_state, 'review')
  assert.ok(next.intervalDays > 3 && next.intervalDays < 4, `got ${next.intervalDays}`)
})

test('grade ordering always holds: easy >= good > hard, and again resets', () => {
  const reviewed: SrsCard = {
    srs_state: 'review',
    stability: 10,
    difficulty: 5,
    due_at: T0 - DAY,
    last_review: T0 - 10 * DAY,
    reps: 4,
    lapses: 0,
    step: 0,
  }
  const p = preview(reviewed, T0)
  const [again, hard, good, easy] = p.map((x) => x.intervalDays)
  assert.ok(again < 1 / 24, `again should be minutes, got ${again} days`)
  assert.ok(hard < good, `hard must be shorter than good: ${hard} vs ${good}`)
  assert.ok(easy >= good * 1.29, `easy must beat good by the guard rail: ${easy} vs ${good}`)
  assert.ok(good > 10, `good should grow stability beyond 10 days, got ${good}`)
})

test('young cards still get four distinguishable intervals (the 9天/9天 case)', () => {
  const young: SrsCard = {
    srs_state: 'review',
    stability: 4.2,
    difficulty: 5,
    due_at: T0 - 8 * DAY,
    last_review: T0 - 8 * DAY,
    reps: 1,
    lapses: 0,
    step: 0,
  }
  const days = preview(young, T0).map((p) => Math.round(p.intervalDays))
  assert.equal(new Set(days.slice(1)).size, 3, `hard/good/easy must differ after rounding, got ${days}`)
  assert.ok(days[3] > days[2] && days[2] > days[1], `ordering broken: ${days}`)
})

test('grading "again" on a mature card increments lapses and enters relearning', () => {
  const mature: SrsCard = {
    srs_state: 'review',
    stability: 42,
    difficulty: 4,
    due_at: T0,
    last_review: T0 - 42 * DAY,
    reps: 9,
    lapses: 0,
    step: 0,
  }
  const next = schedule(mature, 1, T0)
  assert.equal(next.srs_state, 'relearning')
  assert.equal(next.lapses, 1)
  assert.ok(next.stability < mature.stability, 'lapse must shrink stability')
})

test('repeated successful reviews push the due date further out each time', () => {
  let card: SrsCard = { ...freshCard }
  let cursor = T0
  let lastInterval = 0
  const intervals: number[] = []
  for (let i = 0; i < 5; i++) {
    const next = schedule(card, 3, cursor)
    intervals.push(next.intervalDays)
    card = {
      srs_state: next.srs_state,
      stability: next.stability,
      difficulty: next.difficulty,
      due_at: next.due_at,
      last_review: next.last_review,
      reps: next.reps,
      lapses: next.lapses,
      step: next.step,
    }
    cursor = next.due_at
    lastInterval = next.intervalDays
  }
  for (let i = 1; i < intervals.length; i++) {
    assert.ok(intervals[i] >= intervals[i - 1], `interval shrank: ${intervals.join(', ')}`)
  }
  assert.ok(lastInterval > 10, `after 5 successful reviews expected >10 days, got ${lastInterval}`)
})

test('forgetting curve retention at multiples of stability', () => {
  // R(S) = 0.9 by construction; the curve then falls off as (1 + 0.2346 t/S)^-0.5
  const S = 5
  assert.ok(Math.abs(retrievability(S, S) - 0.9) < 1e-9)
  assert.ok(Math.abs(retrievability(2 * S, S) - 0.825) < 0.002, `R(2S)=${retrievability(2 * S, S)}`)
  assert.ok(retrievability(3 * S, S) < 0.78)
  // "well forgotten" (<60%) happens around 7.6x stability, not 3x
  assert.ok(retrievability(7.6 * S, S) < 0.6)
})

test('overdue cards are detected through retrievability', () => {
  const overdue: SrsCard = {
    srs_state: 'review',
    stability: 5,
    difficulty: 5,
    due_at: T0 - 40 * DAY,
    last_review: T0 - 40 * DAY,
    reps: 3,
    lapses: 0,
    step: 0,
  }
  // 8x past the scheduled interval ⇒ genuinely forgotten
  assert.ok(retrievability(40, 5) < 0.6, `R=${retrievability(40, 5)}`)
  assert.equal(overdue.srs_state, 'review')
})

test('humanizeInterval reads naturally in Chinese', () => {
  assert.equal(humanizeInterval(10 / 1440), '10 分钟')
  assert.equal(humanizeInterval(0.5), '12 小时')
  assert.equal(humanizeInterval(3.7), '4 天')
  assert.equal(humanizeInterval(45), '1.5 个月')
  assert.equal(humanizeInterval(400), '1.1 年')
})
