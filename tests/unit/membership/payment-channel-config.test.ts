import { beforeEach, describe, expect, it, vi } from 'vitest'

const systemConfigMock = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { systemConfig: systemConfigMock },
}))

import { encryptApiKey } from '@/lib/crypto-utils'
import {
  buildPaymentChannelsStatus,
  encryptChannelValues,
  findMissingRequiredFields,
  getPaymentChannelConfigKey,
  maskChannelSecret,
  readChannelValues,
} from '@/lib/payment/config'
import { getPaymentChannelSpec, PAYMENT_CHANNEL_SPECS } from '@/lib/payment/channels'
import {
  HMAC_WEBHOOK_SIGNATURE_HEADER,
  applyPayUrlTemplate,
  hmacWebhookPaymentAdapter,
} from '@/lib/payment/hmac-webhook'
import { createHmacSignature } from '@/lib/payment/signature'
import { PAYMENT_METHOD } from '@/lib/payment/types'

process.env.API_ENCRYPTION_KEY =
  process.env.API_ENCRYPTION_KEY || 'test-key-for-payment-channel-config'

function mockChannelConfig(method: string, value: unknown) {
  systemConfigMock.findUnique.mockImplementation(
    async ({ where }: { where: { key: string } }) =>
      where.key === getPaymentChannelConfigKey(method)
        ? { key: where.key, value, updatedAt: new Date() }
        : null,
  )
}

describe('payment channels / 声明式字段规格', () => {
  it('每个渠道都有规格，敏感字段被显式标注', () => {
    expect(Object.keys(PAYMENT_CHANNEL_SPECS).sort()).toEqual([
      'alipay',
      'hmac-webhook',
      'manual',
      'stripe',
      'wechat',
    ])

    const manual = getPaymentChannelSpec(PAYMENT_METHOD.MANUAL)
    expect(manual?.fields).toEqual([])

    const hmac = getPaymentChannelSpec(PAYMENT_METHOD.HMAC_WEBHOOK)
    expect(hmac?.fields.find((field) => field.key === 'secret')?.secret).toBe(true)

    const alipay = getPaymentChannelSpec(PAYMENT_METHOD.ALIPAY)
    expect(alipay?.fields.find((field) => field.key === 'privateKey')?.secret).toBe(true)
    expect(alipay?.fields.find((field) => field.key === 'appId')?.secret).toBe(false)
  })

  it('必填校验只认非空值', () => {
    expect(findMissingRequiredFields(PAYMENT_METHOD.MANUAL, {})).toEqual([])
    expect(findMissingRequiredFields(PAYMENT_METHOD.HMAC_WEBHOOK, {})).toEqual(['secret'])
    expect(findMissingRequiredFields(PAYMENT_METHOD.HMAC_WEBHOOK, { secret: '   ' })).toEqual(['secret'])
    expect(findMissingRequiredFields(PAYMENT_METHOD.HMAC_WEBHOOK, { secret: 'x' })).toEqual([])
  })

  it('未知渠道不返回规格', () => {
    expect(getPaymentChannelSpec('ghost')).toBeNull()
  })
})

describe('payment channels / 加密与掩码', () => {
  it('敏感字段加密落库、普通字段原样落库', () => {
    const stored = encryptChannelValues(PAYMENT_METHOD.HMAC_WEBHOOK, {
      secret: 'plain-secret',
      payUrlTemplate: 'https://pay.example.com?order={orderNo}',
    })

    expect(stored.secret).not.toContain('plain-secret')
    expect(stored.payUrlTemplate).toBe('https://pay.example.com?order={orderNo}')
  })

  it('掩码只保留末四位，短值全部打码', () => {
    expect(maskChannelSecret('abcdefgh')).toBe('****efgh')
    expect(maskChannelSecret('abc')).toBe('****')
    expect(maskChannelSecret('')).toBe('')
  })

  it('读取时按规格解密敏感字段，解密失败按未配置处理', async () => {
    mockChannelConfig(PAYMENT_METHOD.HMAC_WEBHOOK, {
      secret: encryptApiKey('real-secret'),
      payUrlTemplate: 'https://pay.example.com',
    })

    const values = await readChannelValues(PAYMENT_METHOD.HMAC_WEBHOOK)
    expect(values.secret).toBe('real-secret')
    expect(values.payUrlTemplate).toBe('https://pay.example.com')

    mockChannelConfig(PAYMENT_METHOD.HMAC_WEBHOOK, { secret: 'not-a-ciphertext' })
    const broken = await readChannelValues(PAYMENT_METHOD.HMAC_WEBHOOK)
    expect(broken.secret).toBeUndefined()
  })
})

describe('payment channels / 后台状态汇总', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('已配置的敏感字段只回掩码，未实现的渠道标记为未实现', async () => {
    systemConfigMock.findUnique.mockImplementation(
      async ({ where }: { where: { key: string } }) => {
        if (where.key === getPaymentChannelConfigKey(PAYMENT_METHOD.HMAC_WEBHOOK)) {
          return {
            key: where.key,
            value: {
              secret: encryptApiKey('top-secret-value'),
              payUrlTemplate: 'https://pay.example.com',
            },
            updatedAt: new Date(),
          }
        }
        return null
      },
    )

    const statuses = await buildPaymentChannelsStatus({
      implementedMethods: [PAYMENT_METHOD.MANUAL, PAYMENT_METHOD.HMAC_WEBHOOK],
    })

    const hmac = statuses.find((item) => item.method === PAYMENT_METHOD.HMAC_WEBHOOK)
    const alipay = statuses.find((item) => item.method === PAYMENT_METHOD.ALIPAY)
    const manual = statuses.find((item) => item.method === PAYMENT_METHOD.MANUAL)

    expect(hmac?.values.secret).toBe('****alue')
    expect(hmac?.configured).toBe(true)
    expect(hmac?.implemented).toBe(true)
    expect(JSON.stringify(statuses)).not.toContain('top-secret-value')

    // 未实现但可预填参数
    expect(alipay?.implemented).toBe(false)
    expect(alipay?.configured).toBe(false)
    expect(alipay?.missingFields.length).toBeGreaterThan(0)

    expect(manual?.implemented).toBe(true)
    expect(manual?.configured).toBe(true)
    // 默认启用 manual
    expect(manual?.enabledInConfig).toBe(true)
    expect(manual?.effective).toBe(true)
  })
})

describe('payment channels / hmac-webhook 适配器', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('未配置密钥时未就绪，也不会被用于下单', async () => {
    mockChannelConfig(PAYMENT_METHOD.HMAC_WEBHOOK, null)
    await expect(hmacWebhookPaymentAdapter.isReady()).resolves.toBe(false)

    mockChannelConfig(PAYMENT_METHOD.HMAC_WEBHOOK, { secret: encryptApiKey('s3cret') })
    await expect(hmacWebhookPaymentAdapter.isReady()).resolves.toBe(true)
  })

  it('收银台地址模板会替换订单号与金额并做 URL 编码', () => {
    const url = applyPayUrlTemplate('https://pay.example.com/c?o={orderNo}&a={amount}', {
      orderNo: 'WOO 1',
      amount: 29,
    })
    expect(url).toBe('https://pay.example.com/c?o=WOO%201&a=29')

    // 未知占位符原样保留
    expect(applyPayUrlTemplate('https://x/{unknown}', { orderNo: 'A', amount: 1 })).toBe(
      'https://x/{unknown}',
    )
  })

  it('createPayment 返回收银台地址与指引', async () => {
    mockChannelConfig(PAYMENT_METHOD.HMAC_WEBHOOK, {
      secret: encryptApiKey('s3cret'),
      payUrlTemplate: 'https://pay.example.com/c?o={orderNo}&a={amount}',
    })

    const intent = await hmacWebhookPaymentAdapter.createPayment({
      orderNo: 'WOO-1',
      amount: 29,
      planCode: 'monthly',
      userId: 'user-1',
      createdAt: new Date(),
    })

    expect(intent.method).toBe(PAYMENT_METHOD.HMAC_WEBHOOK)
    expect(intent.autoActivate).toBe(false)
    expect(intent.payUrl).toBe('https://pay.example.com/c?o=WOO-1&a=29')
  })

  it('回调验签通过后归一化支付结果', async () => {
    mockChannelConfig(PAYMENT_METHOD.HMAC_WEBHOOK, { secret: encryptApiKey('s3cret') })

    const rawBody = JSON.stringify({ orderNo: 'WOO-1', amount: 29, externalId: 'ext-9' })
    const notification = await hmacWebhookPaymentAdapter.verifyWebhook({
      headers: new Headers({
        [HMAC_WEBHOOK_SIGNATURE_HEADER]: `sha256=${createHmacSignature(rawBody, 's3cret')}`,
      }),
      rawBody,
    })

    expect(notification).toMatchObject({
      orderNo: 'WOO-1',
      paidAmount: 29,
      method: PAYMENT_METHOD.HMAC_WEBHOOK,
      externalId: 'ext-9',
    })
    expect(notification?.paidAt).toBeInstanceOf(Date)
  })

  it('签名不符时抛错，不返回支付结果', async () => {
    mockChannelConfig(PAYMENT_METHOD.HMAC_WEBHOOK, { secret: encryptApiKey('s3cret') })

    const rawBody = JSON.stringify({ orderNo: 'WOO-1', amount: 29 })

    await expect(
      hmacWebhookPaymentAdapter.verifyWebhook({
        headers: new Headers({ [HMAC_WEBHOOK_SIGNATURE_HEADER]: 'deadbeef' }),
        rawBody,
      }),
    ).rejects.toThrow(/PAYMENT_SIGNATURE_INVALID/)
  })

  it('未配置密钥时回调直接报配置缺失，避免静默放行', async () => {
    mockChannelConfig(PAYMENT_METHOD.HMAC_WEBHOOK, null)

    await expect(
      hmacWebhookPaymentAdapter.verifyWebhook({
        headers: new Headers(),
        rawBody: JSON.stringify({ orderNo: 'WOO-1', amount: 1 }),
      }),
    ).rejects.toThrow(/MISSING_CONFIG/)
  })

  it('请求体缺少 orderNo 或金额非法时拒绝', async () => {
    mockChannelConfig(PAYMENT_METHOD.HMAC_WEBHOOK, { secret: encryptApiKey('s3cret') })

    const badBody = JSON.stringify({ amount: 29 })
    await expect(
      hmacWebhookPaymentAdapter.verifyWebhook({
        headers: new Headers({
          [HMAC_WEBHOOK_SIGNATURE_HEADER]: createHmacSignature(badBody, 's3cret'),
        }),
        rawBody: badBody,
      }),
    ).rejects.toThrow(/PAYMENT_PAYLOAD_INVALID/)

    const badAmount = JSON.stringify({ orderNo: 'WOO-1', amount: 'abc' })
    await expect(
      hmacWebhookPaymentAdapter.verifyWebhook({
        headers: new Headers({
          [HMAC_WEBHOOK_SIGNATURE_HEADER]: createHmacSignature(badAmount, 's3cret'),
        }),
        rawBody: badAmount,
      }),
    ).rejects.toThrow(/PAYMENT_PAYLOAD_INVALID/)
  })
})
