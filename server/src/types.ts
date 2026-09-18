export type ItemType = 'word' | 'phrase' | 'sentence'

export type ExerciseKind =
  | 'translate_choice' // 选择正确的翻译（05 屏）
  | 'wordbank' // 组句 / 词块搬运（06 屏）
  | 'listen_choice' // 听音选词
  | 'match_pairs' // 配对
  | 'fill_blank' // 填空
  | 'translate_input' // 自由输入翻译

export interface Prompt {
  kind: ExerciseKind
  kicker: string
  instruction: string
  /** Main prompt shown large (source word / sentence / blanked sentence) */
  source: string
  sourceLang: 'zh' | 'target'
  audioText?: string
  choices?: string[]
  bank?: string[]
  pairs?: { left: string; right: string }[]
  /** For listen/match/fill where the source is hidden until answered */
  hideSource?: boolean
}

export interface Answer {
  value: string
  /** accepted alternatives (normalised compare on the client) */
  accept: string[]
  explanation?: string
  translation?: string
}

export interface ExtractedItem {
  text: string
  type: ItemType
  translation: string
  phonetic?: string
  pos?: string
  example?: string
  example_zh?: string
  topic?: string
}
