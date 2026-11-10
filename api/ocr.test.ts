import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './ocr'

const ENV_KEYS = ['OCR_VISION_BASE_URL', 'OCR_VISION_API_KEY', 'OCR_VISION_MODEL', 'OCR_ACCESS_TOKEN'] as const
const original: Record<string, string | undefined> = {}

function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.body = payload
      return this
    },
    setHeader(key: string, value: string) {
      this.headers[key] = value
    },
  }
  return res
}

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    method: 'POST',
    headers: { 'x-ocr-token': 'secret' },
    body: { image: 'data:image/jpeg;base64,AAAA' },
    ...overrides,
  }
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    original[key] = process.env[key]
    delete process.env[key]
  }
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (original[key] === undefined) delete process.env[key]
    else process.env[key] = original[key]
  }
  vi.restoreAllMocks()
})

function configure() {
  process.env.OCR_VISION_BASE_URL = 'https://example.test/v1'
  process.env.OCR_VISION_API_KEY = 'key'
  process.env.OCR_VISION_MODEL = 'vision-model'
  process.env.OCR_ACCESS_TOKEN = 'secret'
}

describe('ocr api', () => {
  it('reports configured false without env', async () => {
    const res = makeRes()
    await handler(
      makeReq({ method: 'GET', headers: { 'x-ocr-token': 'secret' } }) as never,
      res as never,
    )
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ ok: true, configured: false })
  })

  it('reports configured true with env', async () => {
    configure()
    const res = makeRes()
    await handler(
      makeReq({ method: 'GET', headers: { 'x-ocr-token': 'secret' } }) as never,
      res as never,
    )
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ ok: true, configured: true, model: 'vision-model' })
  })

  it('rejects a wrong token', async () => {
    configure()
    const res = makeRes()
    await handler(makeReq({ headers: { 'x-ocr-token': 'wrong' } }) as never, res as never)
    expect(res.statusCode).toBe(401)
  })

  it('normalizes a provider response', async () => {
    configure()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                institution: '招商银行',
                kind: 'bank',
                asOf: '2026-11-06',
                balances: [
                  { label: '一卡通', amount: '12,345.67', confidence: '0.9', evidence: '可用余额 12,345.67' },
                  { label: '无效', amount: 'abc' },
                ],
              }),
            },
          },
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const res = makeRes()
    await handler(makeReq() as never, res as never)
    expect(res.statusCode).toBe(200)
    const body = res.body as { ok: boolean; data: { institution: string; balances: Array<{ amount: number }> } }
    expect(body.ok).toBe(true)
    expect(body.data.institution).toBe('招商银行')
    expect(body.data.balances).toHaveLength(1)
    expect(body.data.balances[0].amount).toBe(12345.67)
  })

  it('retries without json mode when the provider rejects response_format', async () => {
    configure()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'response_format unsupported' })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            { message: { content: '{"balances":[{"label":"零钱","amount":100,"confidence":0.8}]}' } },
          ],
        }),
      })
    vi.stubGlobal('fetch', fetchMock)
    const res = makeRes()
    await handler(makeReq() as never, res as never)
    expect(res.statusCode).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const body = res.body as { data: { balances: Array<{ amount: number }> } }
    expect(body.data.balances[0].amount).toBe(100)
  })

  it('infers the bank from the Chinese bank asset-management signature', async () => {
    configure()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                institution: '',
                kind: 'bank',
                balances: [
                  { label: '活钱管理', section: '现金', isTotal: true, amount: 12333.91 },
                  { label: '稳健投资', section: '理财', isTotal: true, amount: 33239.17 },
                ],
              }),
            },
          },
        ],
      }),
    }))
    const res = makeRes()
    await handler(makeReq() as never, res as never)
    const body = res.body as { data: { institution: string; balances: unknown[] } }
    expect(body.data.institution).toBe('中国银行')
    expect(body.data.balances).toHaveLength(2)
  })

  it('repairs a missing 招商银行 deposit with a targeted second pass', async () => {
    configure()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  institution: '招商银行',
                  kind: 'bank',
                  balances: [
                    { label: '活钱', section: '现金', isTotal: true, amount: 407.64 },
                    { label: '理财', section: '理财', isTotal: true, amount: 60780.74 },
                  ],
                }),
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  institution: '招商银行',
                  balances: [{ label: '存款', section: '储蓄', isTotal: true, amount: 96000 }],
                }),
              },
            },
          ],
        }),
      })
    vi.stubGlobal('fetch', fetchMock)
    const res = makeRes()
    await handler(makeReq() as never, res as never)
    const body = res.body as {
      data: { institution: string; balances: Array<{ label: string; amount: number }> }
    }
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(body.data.institution).toBe('招商银行')
    expect(body.data.balances.some((balance) => balance.label.includes('存款'))).toBe(true)
    expect(body.data.balances.find((balance) => balance.label.includes('存款'))?.amount).toBe(96000)
  })

})
