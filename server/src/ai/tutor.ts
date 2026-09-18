import { getAiConfig } from './config.js'
import { chatStream } from './client.js'
import { mockTutorReply } from './mock.js'

export interface TutorTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface TutorContext {
  targetLangLabel: string
  level: string
  weakItems: { text: string; translation: string }[]
}

export function tutorSystemPrompt(ctx: TutorContext): string {
  const weak =
    ctx.weakItems.length > 0
      ? ctx.weakItems.map((i) => `${i.text}（${i.translation}）`).join('、')
      : '暂无'
  return `你是 Lina，一名耐心、鼓励式的${ctx.targetLangLabel}口语导师，正在和学习者做每日对话练习。

学习者水平：${ctx.level}
他/她最近容易忘的词：${weak}

对话规则：
1. 每轮只做三件事：简短肯定 → 一句具体纠正或升级建议 → 一个新问题。最多 3 句话，别写成作文。
2. 学习者用目标语言说，你就用目标语言回；他/她用中文求助时，用中文解释，然后带一句目标语言示范。
3. 纠正时明确点出错误类型（时态、冠词、介词、搭配、单复数），并用 **加粗** 标出正确的词，例如：注意 **went** 是 go 的过去式。
4. 难度贴合水平，每 3 轮把词汇难度轻轻推高一点，并自然地复现已标注为「容易忘」的词。
5. 永远不要一次给多个问题；永远以一个问题结尾。
6. 不要输出 markdown 列表、标题或代码块，只用自然口语段落。`
}

export async function* streamTutorReply(
  history: TutorTurn[],
  ctx: TutorContext,
): AsyncGenerator<string> {
  const cfg = getAiConfig()
  if (cfg.mock) {
    const last = [...history].reverse().find((m) => m.role === 'user')?.content ?? ''
    const reply = mockTutorReply(last)
    for (const chunk of reply.match(/.{1,4}/gs) ?? []) {
      yield chunk
      await new Promise((r) => setTimeout(r, 30))
    }
    return
  }

  const messages = [
    { role: 'system' as const, content: tutorSystemPrompt(ctx) },
    ...history.slice(-20).map((m) => ({ role: m.role, content: m.content })),
  ]
  yield* chatStream(messages, { temperature: 0.8, maxTokens: 512 })
}

export async function tutorReply(history: TutorTurn[], ctx: TutorContext): Promise<string> {
  let out = ''
  for await (const chunk of streamTutorReply(history, ctx)) out += chunk
  return out.trim()
}
