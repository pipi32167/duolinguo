import { normalize } from './answer.ts'

export interface Pair {
  left: string
  right: string
}

export interface PairPickState {
  /** 已配上的对：left → right。 */
  matches: Record<string, string>
  selLeft: string | null
  selRight: string | null
  /** 刚判错的组合，调用方展示红色闪烁后自行清掉。 */
  wrong: { left: string; right: string } | null
}

export const blankPick = (): PairPickState => ({ matches: {}, selLeft: null, selRight: null, wrong: null })

/**
 * 配对题的一次点击。左列 / 右列都可以先点：两边各有一个选中项时就立即判定，
 * 对了记进 matches 并清空选择，错了闪红（wrong）但不记分。
 * 已经配上的 chip 再点是无效操作，原样返回。
 */
export function pickPair(
  pairs: Pair[],
  state: PairPickState,
  side: 'left' | 'right',
  value: string,
): PairPickState {
  if (
    Object.keys(state.matches).includes(value) ||
    Object.values(state.matches).includes(value)
  ) {
    return state
  }

  const resolve = (left: string, right: string): PairPickState => {
    const pair = pairs.find((p) => normalize(p.left) === normalize(left))
    if (pair && normalize(pair.right) === normalize(right)) {
      return { matches: { ...state.matches, [pair.left]: right }, selLeft: null, selRight: null, wrong: null }
    }
    return { matches: state.matches, selLeft: null, selRight: null, wrong: { left, right } }
  }

  if (side === 'left') {
    return state.selRight ? resolve(value, state.selRight) : { ...state, selLeft: value, wrong: null }
  }
  return state.selLeft ? resolve(state.selLeft, value) : { ...state, selRight: value, wrong: null }
}
