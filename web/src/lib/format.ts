/** Shared formatting helpers (Chinese UI copy). */

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':')
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/**
 * 长倒计时（心的恢复、导师额度）。formatClock 只输出 分:秒，
 * 7 小时的恢复时间会变成无意义的「446:43」，所以超过一小时改用中文单位。
 */
export function formatCooldown(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}小时${m}分`
  if (m > 0) return `${m}分${s % 60}秒`
  return `${s}秒`
}

export function formatElapsed(ms: number): string {
  const total = Math.round(ms / 1000)
  const m = Math.floor(total / 60)
  return `${m}:${String(total % 60).padStart(2, '0')}`
}

export function formatInterval(days: number): string {
  if (days < 1 / 1440) return '不到 1 分钟'
  if (days < 1 / 24) return `${Math.round(days * 1440)} 分钟`
  if (days < 1) return `${Math.round(days * 24)} 小时`
  if (days < 30) return `${Math.round(days)} 天`
  if (days < 365) return `${(days / 30).toFixed(1)} 个月`
  return `${(days / 365).toFixed(1)} 年`
}

export function formatRelativeDue(dueAt: number, now = Date.now()): string {
  if (!dueAt) return '待学习'
  const diff = dueAt - now
  const abs = Math.abs(diff)
  const days = abs / 86_400_000
  const text = days < 1 ? formatInterval(days) : formatInterval(days)
  return diff >= 0 ? `${text}后` : `已过期 ${text}`
}

export function formatDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Retention → colour, matching the insight buckets in the design tokens. */
export function retentionColor(r: number): string {
  if (r >= 0.9) return 'var(--brand)'
  if (r >= 0.75) return 'var(--blue)'
  if (r >= 0.5) return 'var(--gold)'
  return 'var(--red)'
}

export function retentionLabel(r: number): string {
  if (r >= 0.9) return '牢记'
  if (r >= 0.75) return '稳固'
  if (r >= 0.5) return '不稳'
  return '脆弱'
}

export const SRS_STATE_LABEL: Record<string, string> = {
  new: '新词',
  learning: '学习中',
  review: '复习中',
  relearning: '重学',
}

export const REASON_LABEL: Record<string, string> = {
  due: '到期复习',
  new: '新词',
  weak: '易忘',
}

export function pct(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`
}

export function plural(n: number, unit: string): string {
  return `${n} ${unit}`
}

/**
 * 「今日目标」卡片的引导语。原文案只要没达标就写「连续天数不会断」，
 * 对词库为空或 streak = 0 的新用户是假的，所以按状态分支。
 *
 * 分支顺序有意义：词库为空必须排在最前。达标分支承诺的
 * 「会加长明天的复习队列」在 deckTotal = 0 时同样不成立 ——
 * 先学完再清空词库（POST /items/delete）就能落进那个状态，
 * 此时页面上连 SRS 总览都不会渲染。
 */
export function goalHint(input: {
  todayMin: number
  goalMin: number
  streak: number
  deckTotal: number
}): string {
  const { todayMin, goalMin, streak, deckTotal } = input
  const reached = todayMin >= goalMin

  // 没有词就没有课程，也没有明天的到期队列：
  // 这一档里「连续天数」「复习队列」的说法一律不成立。
  if (deckTotal === 0) {
    return reached
      ? '今日目标已完成 —— 不过词库还是空的，拍几张照片，明天才有内容可复习。'
      : '词库还是空的，先拍几张照片攒几个词，今天就有内容可学。'
  }

  if (reached) return '今天的量已经够了 —— 再加一节会加长明天的复习队列。'
  const left = Math.max(1, goalMin - todayMin)
  if (streak <= 0) return `再学 ${left} 分钟就能完成今天的 ${goalMin} 分钟目标。`
  return `再学 ${left} 分钟就能收工，连续 ${streak} 天不会断。`
}
