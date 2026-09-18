import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

/**
 * crypto.randomUUID 只在安全上下文（HTTPS / localhost）存在，
 * 局域网 HTTP 或旧 WebKit 下是 undefined —— uuid() 必须有兜底，
 * 否则拍照加词一选图片就崩（Capture.tsx 的实际事故）。
 */
describe('uuid()', () => {
  const realCrypto = globalThis.crypto
  const fake = (impl: Partial<Crypto>) =>
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      get: () => impl,
    })

  afterEach(() => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      get: () => realCrypto,
    })
  })

  describe('crypto.randomUUID 存在时', () => {
    const STUB: ReturnType<Crypto['randomUUID']> = '00000000-0000-4000-8000-000000000000'
    beforeEach(() => fake({ randomUUID: () => STUB }))

    test('直接透传 randomUUID 的结果', async () => {
      const { uuid } = await import('./device.ts')
      assert.equal(uuid(), STUB)
    })
  })

  describe('crypto.randomUUID 不存在时（不安全上下文 / 旧 WebKit）', () => {
    beforeEach(() => fake({}))

    test('fallback 仍返回非空字符串，且两次调用不重复', async () => {
      const { uuid } = await import('./device.ts')
      const a = uuid()
      const b = uuid()
      assert.equal(typeof a, 'string')
      assert.ok(a.length > 0)
      assert.notEqual(a, b)
    })
  })

  describe('crypto 整个不可用时', () => {
    beforeEach(() => fake(undefined as unknown as Partial<Crypto>))

    test('fallback 仍返回非空字符串', async () => {
      const { uuid } = await import('./device.ts')
      assert.ok(uuid().length > 0)
    })
  })
})
