/*
 * 题型巡检的页面侧驱动。这个文件是**纯浏览器 JS**，由
 * scripts/shoot-exercises.mjs 读取后通过 stdin 注入。
 *
 * 刻意不写成模板字符串：那样 \s、\u2019、\[ 这些转义会先被外层 JS 吃掉一层，
 * 导致注入的代码静默变形（曾把 /\s+/ 变成 /s+/，组句题直接失效）。
 */
window.__ex = {
  box(el) {
    const r = el.getBoundingClientRect()
    return {
      w: Math.round(r.width),
      h: Math.round(r.height),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      right: Math.round(r.right),
    }
  },

  /** 采一帧布局指标。 */
  snapshot() {
    const q = (s) => document.querySelector(s)
    const qa = (s) => [...document.querySelectorAll(s)]

    const opts = qa('.opts .opt')
    const bank = qa('.wb-pool .chip')
    const cols = qa('.split-2 .itemlist')
    const ta = q('textarea')
    const body = q('.lessonbody')
    const foot = q('.lessonfoot')

    const targets = qa('.lessonbody button, .lessonbody textarea, .lessonfoot button')
      .map((el) => this.box(el))
      .filter((b) => b.w > 0 && b.h > 0)

    return {
      kicker: q('.q-kicker')?.textContent?.trim() || '',
      title: q('.q-title')?.textContent?.trim() || '',
      src: q('.src')?.textContent?.trim() || '',
      progress: q('.lprog i')?.style.width || '',
      hearts: q('.hearts')?.textContent?.trim() || '',

      optCount: opts.length,
      optCols: opts.length ? getComputedStyle(q('.opts')).gridTemplateColumns.split(' ').length : 0,
      optMinH: opts.length ? Math.min(...opts.map((o) => Math.round(o.getBoundingClientRect().height))) : null,

      bankCount: bank.length,
      chipMinH: bank.length ? Math.min(...bank.map((c) => Math.round(c.getBoundingClientRect().height))) : null,
      ansAreaH: q('.wb-ans') ? Math.round(q('.wb-ans').getBoundingClientRect().height) : null,

      matchCols: cols.length,
      matchLeft: cols[0] ? cols[0].querySelectorAll('button').length : 0,
      matchRight: cols[1] ? cols[1].querySelectorAll('button').length : 0,

      inputH: ta ? Math.round(ta.getBoundingClientRect().height) : null,

      minTapW: targets.length ? Math.min(...targets.map((b) => b.w)) : null,
      minTapH: targets.length ? Math.min(...targets.map((b) => b.h)) : null,

      bodyScrolls: body ? body.scrollHeight > body.clientHeight + 1 : false,
      footVisible: foot ? foot.getBoundingClientRect().bottom <= window.innerHeight + 1 : null,

      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    }
  },

  /** 只填答，不提交 —— 截图需要停在「已作答、未判定」这一帧。 */
  async fill(payload) {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const q = (s) => document.querySelector(s)
    const qa = (s) => [...document.querySelectorAll(s)]
    const norm = (s) =>
      String(s || '')
        .toLowerCase()
        .replace(/[\u2019\u2018]/g, "'")
        .replace(/[.,!?;:。，！？；：、"'(\)\[\]{}]/g, '')
        .replace(/\s+/g, ' ')
        .trim()

    if (payload.kind === 'match_pairs') {
      const cols = qa('.split-2 .itemlist')
      for (let guard = 0; guard < 12; guard++) {
        const lefts = [...cols[0].querySelectorAll('button')].filter((b) => !b.disabled)
        if (!lefts.length) break
        const rights = [...cols[1].querySelectorAll('button')].filter((b) => !b.disabled)
        if (!rights.length) break
        const before = cols[0].querySelectorAll('button[disabled]').length
        for (const r of rights) {
          lefts[0].click()
          await sleep(60)
          r.click()
          await sleep(60)
          if (cols[0].querySelectorAll('button[disabled]').length > before) break
        }
      }
      await sleep(150)
    } else if (payload.kind === 'wordbank') {
      const tokens = payload.answer.split(/\s+/).filter(Boolean)
      for (const token of tokens) {
        const pool = qa('.wb-pool .chip').filter((c) => c.style.visibility !== 'hidden' && !c.disabled)
        const target =
          pool.find((c) => c.textContent.trim() === token) ||
          pool.find((c) => norm(c.textContent) === norm(token))
        if (!target) break
        target.click()
        await sleep(70)
      }
      await sleep(150)
    } else if (payload.kind === 'translate_input') {
      const ta = q('textarea')
      if (ta) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
        setter.call(ta, payload.answer)
        ta.dispatchEvent(new Event('input', { bubbles: true }))
        ta.dispatchEvent(new Event('change', { bubbles: true }))
      }
      await sleep(150)
    } else {
      const opts = qa('.opts .opt')
      const target =
        opts.find((o) => norm(o.textContent) === norm(payload.answer)) ||
        opts.find((o) => norm(o.textContent).includes(norm(payload.answer))) ||
        opts[1] ||
        opts[0]
      if (target) target.click()
      await sleep(150)
    }

    const checkBtn = q('.lessonfoot button')
    return { filled: true, checkDisabled: checkBtn ? checkBtn.disabled : null }
  },

  /** 点「检查」并回传判定结果。与 fill 分开，避免重复提交。 */
  async submit() {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const q = (s) => document.querySelector(s)
    const qa = (s) => [...document.querySelectorAll(s)]

    const checkBtn = q('.lessonfoot button')
    if (!checkBtn) return { submitted: false, diag: { checkButton: 'missing' } }
    if (checkBtn.disabled) {
      return {
        submitted: false,
        diag: {
          checkDisabled: true,
          matchedPairs: qa('.split-2 .itemlist')[0]?.querySelectorAll('button[disabled]').length ?? null,
          ansChips: qa('.wb-ans .chip').map((c) => c.textContent.trim()),
        },
      }
    }

    checkBtn.click()
    await sleep(450)

    const result = q('.result')
    return {
      submitted: true,
      diag: {
        ansChips: qa('.wb-ans .chip').map((c) => c.textContent.trim()),
        matchedPairs: qa('.split-2 .itemlist')[0]?.querySelectorAll('button[disabled]').length ?? null,
      },
      resultClass: result ? result.className : null,
      resultTitle: q('.res-t')?.textContent?.trim() || null,
      resultAnswer: q('.res-a')?.textContent?.trim() || null,
    }
  },

  /** 点「继续」进入下一题。 */
  async next() {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const btn = [...document.querySelectorAll('.result button')].find((b) => b.textContent.includes('继续'))
    if (!btn) return { advanced: false, url: location.pathname }
    btn.click()
    await sleep(500)
    return { advanced: true, url: location.pathname + location.search }
  },
}

'ex-driver-ready'
