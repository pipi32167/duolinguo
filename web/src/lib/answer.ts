import type { Answer, Exercise } from './types'

/**
 * Wordbank chips carry their original bank index so duplicate words (e.g. two
 * "the") stay distinct: `the§3`. Both the renderer and the grader must strip
 * that suffix before comparing against the answer, so the encoding lives here.
 */
export const CHIP_SEP = '§'

export const chipKey = (text: string, index: number): string => `${text}${CHIP_SEP}${index}`

/** `the§3` → `the` */
export function chipText(key: string): string {
  const parts = key.split(CHIP_SEP)
  parts.pop()
  return parts.join(CHIP_SEP)
}

/** Loose normalisation: case, punctuation, curly quotes and extra whitespace. */
export function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[.,!?;:。，！？；：、"'()\[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Duolingo-style tolerance: accept the canonical answer, any listed
 * alternative, and answers that only differ in punctuation/case.
 */
export function isCorrect(given: string, answer: Answer): boolean {
  const g = normalize(given)
  if (!g) return false
  const accepted = new Set([answer.value, ...(answer.accept ?? [])].map(normalize))
  if (accepted.has(g)) return true
  // tolerate a single missing/extra trailing word, e.g. a dropped "please"
  for (const candidate of accepted) {
    if (!candidate) continue
    if (Math.abs(candidate.length - g.length) <= 2 && candidate.replace(/\s/g, '') === g.replace(/\s/g, '')) {
      return true
    }
  }
  return false
}

export function isChoiceKind(ex: Exercise): boolean {
  return ['translate_choice', 'listen_choice', 'fill_blank'].includes(ex.prompt.kind)
}

export function isOrderedKind(ex: Exercise): boolean {
  return ex.prompt.kind === 'wordbank'
}

export function canCheck(ex: Exercise, draft: Draft): boolean {
  switch (ex.prompt.kind) {
    case 'translate_choice':
    case 'listen_choice':
    case 'fill_blank':
      return Boolean(draft.choice)
    case 'wordbank':
      return draft.tokens.length > 0
    case 'match_pairs':
      return Object.keys(draft.matches).length === (ex.prompt.pairs?.length ?? 0)
    case 'translate_input':
      return draft.text.trim().length > 0
    default:
      return false
  }
}

export interface Draft {
  choice?: string
  tokens: string[]
  text: string
  matches: Record<string, string>
}

export function emptyDraft(): Draft {
  return { tokens: [], text: '', matches: {} }
}

/** Evaluate a draft against the answer without touching the network. */
export function evaluate(ex: Exercise, draft: Draft): boolean {
  const { prompt, answer } = ex
  switch (prompt.kind) {
    case 'translate_choice':
    case 'listen_choice':
    case 'fill_blank':
      return isCorrect(draft.choice ?? '', answer)
    case 'wordbank':
      return isCorrect(draft.tokens.map(chipText).join(' '), answer)
    case 'translate_input':
      return isCorrect(draft.text, answer)
    case 'match_pairs': {
      const pairs = prompt.pairs ?? []
      return pairs.every((p) => normalize(draft.matches[p.left] ?? '') === normalize(p.right))
    }
    default:
      return false
  }
}

export function progressLabel(ex: Exercise): string {
  return ex.prompt.kicker
}
