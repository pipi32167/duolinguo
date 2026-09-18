/**
 * FSRS-4.5 (Free Spaced Repetition Scheduler) — default weights.
 *
 * The scheduler is built on Ebbinghaus' forgetting curve: memory retention
 * decays as R(t) = (1 + FACTOR * t / S) ^ DECAY, where S is the memory
 * "stability" in days. With the default weights R(S) === 0.90, i.e. the next
 * review is scheduled exactly when recall probability drops to 90%.
 */

export const DECAY = -0.5
export const FACTOR = 19 / 81 // ≈ 0.2346
export const DESIRED_RETENTION = 0.9
export const MAX_INTERVAL_DAYS = 365 * 2
export const MIN_INTERVAL_DAYS = 1 / 1440 // 1 minute

/** FSRS-4.5 default parameters. */
const W = [
  0.4872, 1.4003, 3.7145, 12.9716, 5.1618, 1.2298, 0.6021, 0.0671, 1.6295, 1.1329, 0.9559, 1.8617,
  0.0086, 0.2527, 1.4092, 0.146, 1.0337, 0.7035, 0.3103,
] as const

/** Grade scale used across the app. 1=again 2=hard 3=good 4=easy */
export type Grade = 1 | 2 | 3 | 4

export const GRADES: Grade[] = [1, 2, 3, 4]

export const GRADE_LABEL: Record<Grade, string> = {
  1: '再来一次',
  2: '有点难',
  3: '记得',
  4: '很简单',
}

export type SrsState = 'new' | 'learning' | 'review' | 'relearning'

export interface SrsCard {
  srs_state: SrsState
  stability: number
  difficulty: number
  due_at: number
  last_review: number | null
  reps: number
  lapses: number
  step: number
}

export interface ScheduleResult {
  srs_state: SrsState
  stability: number
  difficulty: number
  due_at: number
  last_review: number
  reps: number
  lapses: number
  step: number
  intervalDays: number
  retrievability: number
}

const DAY = 86_400_000
const MIN = 60_000

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function initStability(grade: Grade): number {
  return Math.max(W[grade - 1], 0.1)
}

export function initDifficulty(grade: Grade): number {
  return clamp(W[4] - (grade - 3) * W[5], 1, 10)
}

/** Probability the learner still remembers the card `elapsedDays` after last review. */
export function retrievability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0
  return Math.pow(1 + (FACTOR * Math.max(elapsedDays, 0)) / stability, DECAY)
}

/** Interval (days) that lands retention on `desired`. */
export function intervalFor(stability: number, desired = DESIRED_RETENTION): number {
  return (stability / FACTOR) * (Math.pow(desired, 1 / DECAY) - 1)
}

function nextDifficulty(difficulty: number, grade: Grade): number {
  const d0 = initDifficulty(4)
  const damped = difficulty - W[6] * (grade - 3)
  return clamp(W[7] * d0 + (1 - W[7]) * damped, 1, 10)
}

function nextRecallStability(difficulty: number, stability: number, r: number, grade: Grade): number {
  // Clamp retention below 1: reviews are never literally instantaneous, and the
  // formula degenerates (delta = 0) when r === 1, which would make the four
  // grade buttons all predict the same interval.
  const safeR = Math.min(r, 0.98)
  const hardPenalty = grade === 2 ? W[15] : 1
  const easyBonus = grade === 4 ? W[16] : 1
  return (
    stability *
    (1 +
      Math.exp(W[8]) *
        (11 - difficulty) *
        Math.pow(stability, -W[9]) *
        (Math.exp((1 - safeR) * W[10]) - 1) *
        hardPenalty *
        easyBonus)
  )
}

function nextForgetStability(difficulty: number, stability: number, r: number): number {
  return (
    W[11] *
    Math.pow(difficulty, -W[12]) *
    (Math.pow(stability + 1, W[13]) - 1) *
    Math.exp((1 - r) * W[14])
  )
}

/** Learning steps (minutes) for brand-new / lapsed cards, per grade. */
const LEARNING_STEPS: Record<Grade, number[]> = {
  1: [1, 10],
  2: [10],
  3: [10],
  4: [],
}

/**
 * Anki-compatible guard rail. FSRS-4.5's raw easy bonus (w[16] = 1.0337) is
 * small enough that "good" and "easy" can round to the same interval for a
 * young card, which makes the four rating buttons indistinguishable in the UI.
 * This bound only widens the gap — it never fights the FSRS stability update.
 */
const EASY_MIN_BONUS = 1.3 // easy schedules at least 30% further than good

/**
 * Advance a card through the forgetting curve.
 *
 * `now` is injectable so the scheduler can be tested with a simulated clock.
 */
export function schedule(card: SrsCard, grade: Grade, now: number = Date.now()): ScheduleResult {
  const isNewish = card.srs_state === 'new' || card.srs_state === 'learning'
  const reps = card.reps + 1

  if (isNewish) {
    const stability = initStability(grade)
    const difficulty = initDifficulty(grade)
    const steps = LEARNING_STEPS[grade]

    if (steps.length === 0) {
      // "easy" graduates straight away
      return graduate(stability, difficulty, reps, card.lapses, now, grade)
    }

    const step = grade === 1 ? 0 : card.step + 1
    if (step >= steps.length) {
      return graduate(stability, difficulty, reps, card.lapses, now, grade)
    }
    return {
      srs_state: 'learning',
      stability,
      difficulty,
      due_at: now + steps[step] * MIN,
      last_review: now,
      reps,
      lapses: card.lapses,
      step,
      intervalDays: (steps[step] * MIN) / DAY,
      retrievability: 1,
    }
  }

  const elapsed = card.last_review ? Math.max((now - card.last_review) / DAY, 0) : 0
  const r = retrievability(elapsed, card.stability)
  const difficulty = nextDifficulty(card.difficulty || initDifficulty(3), grade)

  if (grade === 1) {
    const stability = Math.max(nextForgetStability(difficulty, card.stability, r), 0.1)
    return {
      srs_state: 'relearning',
      stability,
      difficulty,
      due_at: now + 10 * MIN,
      last_review: now,
      reps,
      lapses: card.lapses + 1,
      step: 0,
      intervalDays: (10 * MIN) / DAY,
      retrievability: r,
    }
  }

  let stability = Math.max(nextRecallStability(difficulty, card.stability, r, grade), 0.1)
  if (grade === 4) {
    const good = Math.max(nextRecallStability(difficulty, card.stability, r, 3), 0.1)
    stability = Math.max(stability, good * EASY_MIN_BONUS)
  }

  const interval = clamp(intervalFor(stability), MIN_INTERVAL_DAYS, MAX_INTERVAL_DAYS)
  return {
    srs_state: 'review',
    stability,
    difficulty,
    due_at: now + Math.round(interval * DAY),
    last_review: now,
    reps,
    lapses: card.lapses,
    step: 0,
    intervalDays: interval,
    retrievability: r,
  }
}

function graduate(
  stability: number,
  difficulty: number,
  reps: number,
  lapses: number,
  now: number,
  grade: Grade,
): ScheduleResult {
  const interval = clamp(intervalFor(stability), MIN_INTERVAL_DAYS, MAX_INTERVAL_DAYS)
  return {
    srs_state: 'review',
    stability,
    difficulty,
    due_at: now + Math.round(interval * DAY),
    last_review: now,
    reps,
    lapses,
    step: 0,
    intervalDays: interval,
    retrievability: grade === 1 ? 0 : 1,
  }
}

/** Preview the four scheduling outcomes so the UI can label the buttons. */
export function preview(card: SrsCard, now: number = Date.now()) {
  return GRADES.map((grade) => {
    const next = schedule(card, grade, now)
    return {
      grade,
      label: GRADE_LABEL[grade],
      dueAt: next.due_at,
      intervalDays: next.intervalDays,
      humanInterval: humanizeInterval(next.intervalDays),
    }
  })
}

export function humanizeInterval(days: number): string {
  if (days < 1 / 24) return `${Math.max(1, Math.round(days * 1440))} 分钟`
  if (days < 1) return `${Math.round(days * 24)} 小时`
  if (days < 30) return `${Math.round(days)} 天`
  if (days < 365) return `${(days / 30).toFixed(1)} 个月`
  return `${(days / 365).toFixed(1)} 年`
}

/** Current recall probability for a card right now (0–1). */
export function currentRetrievability(card: SrsCard, now: number = Date.now()): number {
  if (card.srs_state === 'new') return 0
  if (!card.last_review || card.stability <= 0) return 0
  const elapsed = Math.max((now - card.last_review) / DAY, 0)
  return retrievability(elapsed, card.stability)
}

/**
 * Points for the forgetting-curve chart: retention over the coming days if the
 * card is never reviewed again.
 */
export function forgettingCurve(
  stability: number,
  opts: { days?: number; samples?: number } = {},
): { day: number; retention: number }[] {
  const days = opts.days ?? Math.max(7, Math.ceil(stability * 3))
  const samples = opts.samples ?? 40
  const out: { day: number; retention: number }[] = []
  for (let i = 0; i <= samples; i++) {
    const day = (days * i) / samples
    out.push({ day: Number(day.toFixed(3)), retention: Number(retrievability(day, stability).toFixed(4)) })
  }
  return out
}
