export interface Item {
  id: string
  user_id: string
  image_id: string | null
  text: string
  norm: string
  type: 'word' | 'phrase' | 'sentence'
  translation: string
  phonetic: string | null
  pos: string | null
  example: string | null
  example_zh: string | null
  topic: string | null
  note: string | null
  created_at: number
  srs_state: 'new' | 'learning' | 'review' | 'relearning'
  stability: number
  difficulty: number
  due_at: number
  last_review: number | null
  reps: number
  lapses: number
  step: number
}

export interface User {
  id: string
  nickname: string
  avatar_char: string
  lang: string
  lang_label: string
  daily_goal_min: number
  created_at: number
  last_active_at: number
}

export interface Stats {
  hearts: number
  heartsMax: number
  gems: number
  xp: number
  streak: number
  dailyGoalMin?: number
  todaySeconds?: number
  heartRefillSeconds?: number
  heartRefillTotalSeconds?: number
  /** tutor free minutes left today */
  tutorRemainingSeconds?: number
  tutorTotalSeconds?: number
}

export type ItemType = 'word' | 'phrase' | 'sentence'

export type ExerciseKind =
  | 'translate_choice'
  | 'wordbank'
  | 'listen_choice'
  | 'match_pairs'
  | 'fill_blank'
  | 'translate_input'

export interface Prompt {
  kind: ExerciseKind
  kicker: string
  instruction: string
  source: string
  sourceLang: 'zh' | 'target'
  audioText?: string
  choices?: string[]
  bank?: string[]
  pairs?: { left: string; right: string }[]
  hideSource?: boolean
}

export interface Answer {
  value: string
  accept: string[]
  explanation?: string
  translation?: string
}

export interface Exercise {
  id: string
  itemId: string | null
  orderIndex: number
  prompt: Prompt
  answer: Answer
}

export interface Lesson {
  id: string
  title: string
  unitLabel: string
  kind: string
  status: 'generating' | 'ready' | 'failed' | 'completed'
  model: string | null
  provider: string | null
  error: string | null
  xp: number
  accuracy: number | null
  durationMs: number | null
  createdAt: number
}

export interface GradePreview {
  grade: 1 | 2 | 3 | 4
  label: string
  intervalDays: number
  dueAt: number
}

export interface CurvePoint {
  day: number
  retention: number
}

export interface ItemCurve {
  stability: number
  state: Item['srs_state']
  dueAt: number
  lastReview: number | null
  retrievability: number
  curve: CurvePoint[]
  preview: {
    srs_state: string
    stability: number
    difficulty: number
    due_at: number
    intervalDays: number
    retrievability: number
  }[]
}

export interface QueueEntry {
  reason: 'due' | 'new' | 'weak'
  retrievability: number
  overdueDays: number
  preview: GradePreview[]
  item: Item
}

export interface DeckStats {
  total: number
  due: number
  fresh?: number
  byState: Record<'new' | 'learning' | 'review' | 'relearning', number>
  avgRetention: number
  /** 参与计算平均值的卡片数；为 0 时 avgRetention 无意义（见 retentionLabel） */
  reviewed: number
  mature: number
  young: number
  fragile: number
}

export interface AiStatus {
  baseUrlHost: string
  baseUrl: string
  model: string
  visionModel: string
  apiKeyMasked: string
  hasApiKey: boolean
  configured: boolean
  visionReady: boolean
  timeoutMs: number
  temperature: number
  mock: boolean
  overridden: string[]
}

export interface PathNode {
  key: string
  label: string
  kind: 'review' | 'capture' | 'lesson' | 'done'
  lessonId?: string
  meta: string
  state: 'done' | 'current' | 'locked'
}

export interface HomePayload {
  user: User
  stats: Stats
  path: { nodes: PathNode[]; due: number; fresh: number; deckTotal: number }
}

export interface MePayload {
  user: User
  stats: Stats
  deck: DeckStats
  lessons: Lesson[]
  ai: { configured: boolean; mock: boolean; model: string; visionModel: string }
}

export interface Quest {
  id: string
  icon: string
  color: string
  title: string
  progress: number
  goal: number
  unit: string
  reward: number
  done: boolean
}

export interface LeaderRow {
  name: string
  char: string
  color: string
  xp: number
  rank: number
  me?: boolean
}

export interface ShopPayload {
  gems: number
  hearts: number
  tabs: {
    id: string
    label: string
    packs: { id: string; amount: number; price: string; hot?: boolean }[]
  }[]
  items: {
    id: string
    icon: string
    title: string
    subtitle: string
    price: string
    gems: number
  }[]
}

export interface ExtractResponse {
  imageId: string
  detectedLanguage?: string
  imageKind?: string
  notes?: string
  provider: string
  model: string
  inserted: number
  updated: number
  items: Item[]
}

export interface TutorPayload {
  tutor: { name: string; role: string; avatar: string }
  quota: {
    usedSeconds: number
    totalSeconds: number
    remainingSeconds: number
    resetsInSeconds: number
  }
  hasKey: boolean
  model: string
  mock: boolean
  messages: { role: 'user' | 'assistant'; content: string; created_at: number }[]
}
