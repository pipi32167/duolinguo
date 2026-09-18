import { z } from 'zod'
import type { AiConfig } from './config.js'
import { AI_JSON_RULE, chatJson } from './client.js'
import { mockLesson } from './mock.js'
import type { Answer, ExerciseKind, Prompt } from '../types.js'

const KINDS = [
  'translate_choice',
  'wordbank',
  'listen_choice',
  'match_pairs',
  'fill_blank',
  'translate_input',
] as const satisfies readonly ExerciseKind[]

const optStr = z
  .string()
  .nullish()
  .transform((v) => (v == null || v.trim() === '' ? undefined : v.trim()))

const ExerciseSchema = z.object({
  kind: z.enum(KINDS).catch('translate_choice'),
  instruction: z.string().nullish().transform((v) => (v ?? '').trim() || '选择正确的翻译'),
  source: z.string().min(1).transform((v) => v.trim()),
  source_lang: z.enum(['zh', 'target']).catch('zh'),
  audio_text: optStr,
  choices: z.array(z.string()).nullish(),
  bank: z.array(z.string()).nullish(),
  pairs: z.array(z.object({ left: z.string(), right: z.string() })).nullish(),
  answer: z.string().transform((v) => v.trim()),
  accept: z.array(z.string()).nullish(),
  explanation: optStr,
  translation: optStr,
  item_text: z.string().transform((v) => v.trim()),
})

const LessonSchema = z.object({
  title: z.string().nullish().transform((v) => (v ?? '').trim() || '自定义课程'),
  intro: optStr,
  exercises: z.array(ExerciseSchema).min(3),
})

export type GeneratedLesson = {
  title: string
  intro?: string
  exercises: (Prompt & { answer: Answer; itemText: string })[]
}

export interface LessonSource {
  text: string
  type: string
  translation: string
  pos?: string | null
  example?: string | null
  topic?: string | null
}

const SYSTEM = `你是一名资深的多邻国(Duolingo)风格课程设计师。你的任务是把给定的词汇/短语列表，设计成一节 8–16 题的互动课。

可用题型（kind 字段必须是以下之一）：
- "translate_choice"：给中文释义，四选一选出正确的目标语言词（干扰项必须是同学科、易混淆的真实词，不能编造）。
- "wordbank"：给一个中文句子，学习者用打乱的词块拼出目标语言句子。bank 必须是打乱顺序的、且包含多余干扰词块的完整词块列表（含标点）。
- "listen_choice"：听发音选词。source 填目标语言单词，audio_text 填要朗读的文本。
- "match_pairs"：把 4 组词与释义配对。pairs 数组给 4 组 {left: 目标语言, right: 中文}。
- "fill_blank"：给一个目标语言句子并把目标词挖成 "____"，choices 给 4 个候选词。
- "translate_input"：给中文，学习者自由输入目标语言翻译。

设计要求：
1. 每个词汇条目至少覆盖 1 题；重点词 2 题。
2. 题型要轮换，不要连续 3 题同一题型；第一题必须是最简单的 translate_choice。
3. 难度递进：识别 → 拼装 → 回忆 → 自由输出。
4. 干扰项必须来自本次词表内的其他真实词条，或用学习者同级别的高频词，绝不编造不存在的词。
5. source_lang：source 是中文时填 "zh"，是目标语言时填 "target"。
6. answer 是标准答案；accept 是其它可接受的答案数组（大小写/缩写/同义表达）。
7. explanation 用一句中文说明知识点（词性、搭配、时态、易错点），不超过 40 字。
8. wordbank 的 bank 至少 1.5 倍于答案长度（加干扰词块）。

${AI_JSON_RULE}

输出格式：
{
  "title": "点餐必备 10 词",
  "intro": "本节聚焦餐厅场景的高频词",
  "exercises": [
    {
      "kind": "translate_choice",
      "instruction": "选择正确的翻译",
      "source": "苹果",
      "source_lang": "zh",
      "choices": ["apple", "orange", "grape", "banana"],
      "answer": "apple",
      "accept": ["apple"],
      "explanation": "apple 是可数名词，复数 apples。",
      "item_text": "apple"
    },
    {
      "kind": "wordbank",
      "instruction": "翻译这句话",
      "source": "我每天早上喝咖啡。",
      "source_lang": "zh",
      "bank": ["morning", "coffee", "I", "drink", "every", ".", "tea"],
      "answer": "I drink coffee every morning.",
      "accept": ["I drink coffee every morning.", "I drink coffee every morning"],
      "explanation": "频率副词 every morning 放句末。",
      "item_text": "every morning"
    }
  ]
}`

export interface GenerateOptions {
  targetLangLabel: string
  theme?: string
  size?: number
  config: AiConfig
}

export async function generateLesson(
  items: LessonSource[],
  opts: GenerateOptions,
): Promise<GeneratedLesson> {
  if (opts.config.mock) return normalize(mockLesson(items) as z.infer<typeof LessonSchema>)

  const size = opts.size ?? Math.min(16, Math.max(8, items.length * 2))
  const payload = items.map((i) => ({
    text: i.text,
    type: i.type,
    meaning: i.translation,
    pos: i.pos ?? undefined,
    example: i.example ?? undefined,
    topic: i.topic ?? undefined,
  }))

  const { data } = await chatJson(
    [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: `学习语言：${opts.targetLangLabel}
主题：${opts.theme?.trim() || '综合'}
目标题量：约 ${size} 题
词表（JSON）：
${JSON.stringify(payload, null, 2)}`,
      },
    ],
    (value) => LessonSchema.parse(value),
    { maxTokens: 8192, temperature: 0.6 },
  )

  return normalize(data)
}

function shuffle<T>(arr: T[], seed = 7): T[] {
  const out = [...arr]
  let s = seed
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648
    const j = s % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function normalize(data: z.infer<typeof LessonSchema>): GeneratedLesson {
  const exercises = data.exercises
    .map((ex) => {
      const kind = ex.kind as ExerciseKind
      const prompt: Prompt = {
        kind,
        kicker: KICKER[kind],
        instruction: ex.instruction,
        source: ex.source,
        sourceLang: ex.source_lang,
        audioText: ex.audio_text ?? (ex.source_lang === 'target' ? ex.source : undefined),
        hideSource: kind === 'listen_choice' || kind === 'match_pairs',
      }

      if (kind === 'translate_choice' || kind === 'fill_blank' || kind === 'listen_choice') {
        const choices = (ex.choices ?? []).map((c) => c.trim()).filter(Boolean)
        const withAnswer = choices.includes(ex.answer) ? choices : [ex.answer, ...choices]
        prompt.choices = shuffle(withAnswer, ex.answer.length + 3)
        if (kind === 'fill_blank' && !ex.source.includes('____')) {
          prompt.source = `${ex.source} ____`
        }
      }
      if (kind === 'wordbank') {
        const bank = (ex.bank ?? []).map((c) => c.trim()).filter(Boolean)
        const tokens = ex.answer.split(/(\s+)/).filter((t) => t.trim())
        prompt.bank = shuffle(bank.length ? bank : tokens, ex.answer.length + 11)
      }
      if (kind === 'match_pairs') {
        prompt.pairs = (ex.pairs ?? []).slice(0, 4)
      }

      const accept = [ex.answer, ...(ex.accept ?? [])]
        .map((a) => a.trim())
        .filter(Boolean)
      return {
        ...prompt,
        itemText: ex.item_text,
        answer: {
          value: ex.answer,
          accept: Array.from(new Set(accept)),
          explanation: ex.explanation,
          translation: ex.translation,
        },
      }
    })
    .filter((ex) => {
      if (ex.kind === 'match_pairs') return (ex.pairs?.length ?? 0) >= 2
      if (ex.kind === 'wordbank') return (ex.bank?.length ?? 0) >= 2
      return true
    })

  return { title: data.title, intro: data.intro, exercises }
}

const KICKER: Record<ExerciseKind, string> = {
  translate_choice: '选择正确的翻译',
  wordbank: '翻译这句话',
  listen_choice: '听发音选词',
  match_pairs: '配对',
  fill_blank: '填空',
  translate_input: '翻译成英文',
}

export function makeTitleFromItems(items: LessonSource[]): string {
  const topic = items.find((i) => i.topic)?.topic
  if (topic) return `${topic} · ${items.length} 个词`
  return items.length ? `${items.length} 个新词` : '自定义课程'
}

export { KICKER }
