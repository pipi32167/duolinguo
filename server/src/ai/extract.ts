import { z } from 'zod'
import type { AiConfig } from './config.js'
import { AI_JSON_RULE, chatJson, chatVision } from './client.js'
import { mockExtract } from './mock.js'
import type { ExtractedItem, ItemType } from '../types.js'

const optStr = z
  .string()
  .nullish()
  .transform((v) => (v == null || v.trim() === '' ? undefined : v.trim()))

const ExtractedItemSchema = z.object({
  text: z.string().min(1).transform((v) => v.trim()),
  type: z.enum(['word', 'phrase', 'sentence']).catch('word'),
  translation: z
    .string()
    .nullish()
    .transform((v) => (v ?? '').trim()),
  phonetic: optStr,
  pos: optStr,
  example: optStr,
  example_zh: optStr,
  topic: optStr,
})

const ExtractSchema = z.object({
  detected_language: z.string().nullish().transform((v) => v ?? 'en'),
  image_kind: optStr,
  items: z.array(ExtractedItemSchema).min(1),
  notes: optStr,
})

export type ExtractResult = z.infer<typeof ExtractSchema>

const SYSTEM_TEMPLATE = `你是一名语言学习内容识别专家，负责把一张真实世界的照片（课本、菜单、路牌、板书、笔记、包装、屏幕截图等）转成可直接用于学习的词汇条目。

规则：
1. 只提取「__LANG__」的真实文本，忽略拍摄噪点、水印、页码、非目标语言的注释。
2. 优先提取对学习者有价值的单词与短语；长句最多保留 3 条，标为 sentence。
3. 逐字照抄图片中的原文拼写，不要改写、不要纠正原图拼写错误（可在 note 字段说明）。
4. 去重：同一词形只出现一次。
5. translation 给简体中文释义；phrase/sentence 给自然的中文翻译。
6. 每个条目给一个地道例句（example）与其中文翻译（example_zh），例句需包含该条目本身（词条可做形态变化）。
7. 单词给 phonetic（IPA，带斜杠）与 pos（n./v./adj./adv./prep./phr. 等）；短语可留空。
8. topic 用简短中文标签，例如「食物」「旅行」「商务」「学术」。
9. 最多提取 40 条，按重要性排序。

${AI_JSON_RULE}

输出格式（字段固定，不要增删）：
{
  "detected_language": "en",
  "image_kind": "课本内页",
  "items": [
    {
      "text": "apple",
      "type": "word",
      "translation": "苹果",
      "phonetic": "/ˈæp.əl/",
      "pos": "n.",
      "example": "I eat an apple every day.",
      "example_zh": "我每天吃一个苹果。",
      "topic": "食物"
    }
  ],
  "notes": "图片下半部分有反光，可能遗漏 2 个词"
}`

export interface ExtractOptions {
  targetLangLabel: string // e.g. 英语
  focus?: string // extra hint from the user, e.g. "只要名词"
  config: AiConfig
}

export async function extractFromImage(
  imageDataUrl: string,
  mime: string,
  opts: ExtractOptions,
): Promise<ExtractResult> {
  if (opts.config.mock) return mockExtract(opts.targetLangLabel)

  const system = SYSTEM_TEMPLATE.replace(/__LANG__/g, opts.targetLangLabel)

  const hint = opts.focus?.trim() ? `\n用户额外要求：${opts.focus.trim()}` : ''
  const userText = `学习语言：${opts.targetLangLabel}。请识别这张图片并输出词条 JSON。${hint}`

  const { data, raw } = await chatJson(
    [
      { role: 'system', content: system },
      {
        role: 'user',
        content: [
          { type: 'text', text: userText },
          { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
        ],
      },
    ],
    (value) => ExtractSchema.parse(value),
    { model: opts.config.visionModel, maxTokens: 4096, temperature: 0.2 },
  )

  void raw
  void chatVision
  return data
}

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function guessType(text: string): ItemType {
  const words = text.trim().split(/\s+/).length
  if (words <= 1) return 'word'
  if (words <= 4) return 'phrase'
  return 'sentence'
}

export interface NormalizedItem extends ExtractedItem {
  norm: string
}

export function normalizeExtracted(result: ExtractResult): NormalizedItem[] {
  const seen = new Set<string>()
  const out: NormalizedItem[] = []
  for (const item of result.items) {
    const text = item.text.replace(/\s+/g, ' ').trim()
    const norm = normalizeText(text)
    if (!norm || seen.has(norm)) continue
    seen.add(norm)
    out.push({
      text,
      norm,
      type: (item.type ?? guessType(text)) as ItemType,
      translation: item.translation,
      phonetic: item.phonetic,
      pos: item.pos,
      example: item.example,
      example_zh: item.example_zh,
      topic: item.topic,
    })
  }
  return out
}

export type { ExtractedItem, ItemType }
