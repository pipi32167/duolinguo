import type { AiConfig } from './config.js'
import type { ExtractResult } from './extract.js'

const WORDS: [string, string, string, string, string][] = [
  ['apple', '苹果', '/ˈæp.əl/', 'n.', 'I eat an apple every day.'],
  ['orange', '橙子', '/ˈɒr.ɪndʒ/', 'n.', 'She peeled an orange for breakfast.'],
  ['grape', '葡萄', '/ɡreɪp/', 'n.', 'These grapes are very sweet.'],
  ['banana', '香蕉', '/bəˈnɑː.nə/', 'n.', 'He bought a bunch of bananas.'],
  ['coffee', '咖啡', '/ˈkɒf.i/', 'n.', 'We drank coffee in the morning.'],
  ['breakfast', '早餐', '/ˈbrek.fəst/', 'n.', 'Breakfast is served until ten.'],
  ['menu', '菜单', '/ˈmen.juː/', 'n.', 'Could I see the menu, please?'],
  ['order', '点餐；订单', '/ˈɔː.dər/', 'v.', 'I would like to order a salad.'],
  ['delicious', '美味的', '/dɪˈlɪʃ.əs/', 'adj.', 'The soup was absolutely delicious.'],
  ['recommend', '推荐', '/ˌrek.əˈmend/', 'v.', 'Can you recommend a local dish?'],
]

const PHRASES: [string, string, string][] = [
  ['a cup of coffee', '一杯咖啡', 'I ordered a cup of coffee before work.'],
  ['every morning', '每天早上', 'I go running every morning.'],
  ['how much is it', '多少钱', 'How much is it for the whole set?'],
]

export function mockExtract(langLabel: string): ExtractResult {
  const items: ExtractResult['items'] = [
    ...WORDS.map(([text, translation, phonetic, pos, example]) => ({
      text,
      type: 'word' as const,
      translation,
      phonetic,
      pos,
      example,
      example_zh: `${translation} —— 例句（模拟数据）。`,
      topic: '食物',
    })),
    ...PHRASES.map(([text, translation, example]) => ({
      text,
      type: 'phrase' as const,
      translation,
      phonetic: '',
      pos: '',
      example,
      example_zh: `${translation} —— 例句（模拟数据）。`,
      topic: '日常',
    })),
  ]
  return {
    detected_language: 'en',
    image_kind: '模拟图片（AI_MOCK=1）',
    items,
    notes: `当前为 mock 模式，未调用 ${langLabel} 视觉模型。`,
  }
}

const KIND_CYCLE = [
  'translate_choice',
  'wordbank',
  'listen_choice',
  'match_pairs',
  'fill_blank',
  'translate_input',
] as const

export interface MockExercise {
  kind: string
  instruction: string
  source: string
  source_lang: 'zh' | 'target'
  choices?: string[]
  bank?: string[]
  pairs?: { left: string; right: string }[]
  answer: string
  accept: string[]
  explanation: string
  item_text: string
  audio_text?: string
}

export function mockLesson(items: { text: string; translation: string; example?: string | null }[]) {
  const exercises: MockExercise[] = []
  items.forEach((item, idx) => {
    const kind = KIND_CYCLE[idx % KIND_CYCLE.length]
    const distractors = items
      .filter((i) => i.text !== item.text)
      .map((i) => i.text)
    const meaningDistractors = items.filter((i) => i.text !== item.text).map((i) => i.translation)
    switch (kind) {
      case 'translate_choice':
        exercises.push({
          kind,
          instruction: '选择正确的翻译',
          source: item.translation,
          source_lang: 'zh',
          choices: [item.text, ...distractors.slice(0, 3)],
          answer: item.text,
          accept: [item.text],
          explanation: `${item.translation} = ${item.text}`,
          item_text: item.text,
        })
        break
      case 'wordbank': {
        const sentence = item.example ?? item.text
        exercises.push({
          kind,
          instruction: '翻译这句话',
          source: item.translation,
          source_lang: 'zh',
          bank: sentence.split(/\s+/),
          answer: sentence,
          accept: [sentence],
          explanation: '',
          item_text: item.text,
        })
        break
      }
      case 'listen_choice':
        exercises.push({
          kind,
          instruction: '听发音，选出你听到的词',
          source: item.text,
          source_lang: 'target',
          audio_text: item.text,
          choices: [item.text, ...distractors.slice(0, 3)],
          answer: item.text,
          accept: [item.text],
          explanation: item.translation,
          item_text: item.text,
        })
        break
      case 'match_pairs':
        exercises.push({
          kind,
          instruction: '把词和释义配对',
          source: '配对练习',
          source_lang: 'target',
          pairs: items.slice(0, 4).map((i) => ({ left: i.text, right: i.translation })),
          answer: 'matched',
          accept: ['matched'],
          explanation: '',
          item_text: item.text,
        })
        break
      case 'fill_blank':
        exercises.push({
          kind,
          instruction: '填空',
          source: (item.example ?? `I like ${item.text}.`).replace(new RegExp(item.text, 'i'), '____'),
          source_lang: 'target',
          choices: [item.text, ...distractors.slice(0, 3)],
          answer: item.text,
          accept: [item.text],
          explanation: item.translation,
          item_text: item.text,
        })
        break
      default:
        exercises.push({
          kind: 'translate_input',
          instruction: '翻译成英文',
          source: item.translation,
          source_lang: 'zh',
          choices: meaningDistractors.slice(0, 0),
          answer: item.text,
          accept: [item.text],
          explanation: '',
          item_text: item.text,
        })
    }
  })
  return { title: '模拟课程（AI_MOCK=1）', exercises }
}

export function mockTutorReply(userText: string): string {
  return `（模拟回复）你说的是「${userText}」。开启真实模型后，Lina 会纠正语法、给出更地道的表达，并继续追问。`
}

export function mockStatus(config: AiConfig) {
  return {
    ok: true,
    mock: true,
    baseUrlHost: config.baseUrl ? config.baseUrl.replace(/^https?:\/\//, '').split('/')[0] : '',
    text: { ok: true, ms: 0, model: config.model },
    vision: { ok: true, ms: 0, model: config.visionModel },
    note: `AI_MOCK 已开启，未真正调用 ${config.model} / ${config.visionModel}`,
  }
}
