import { describe, expect, it } from 'vitest'
import {
  createHmacSignature,
  normalizeSignatureHeader,
  verifyHmacSignature,
} from '@/lib/payment/signature'

describe('payment/signature', () => {
  const secret = 'test-webhook-secret'
  const body = JSON.stringify({ orderNo: 'WOO1', amount: 29 })

  it('签名可被同密钥验证通过', () => {
    const signature = createHmacSignature(body, secret)

    expect(verifyHmacSignature({ rawBody: body, signature, secret })).toBe(true)
  })

  it('请求体被篡改时验签失败', () => {
    const signature = createHmacSignature(body, secret)
    const tampered = JSON.stringify({ orderNo: 'WOO1', amount: 1 })

    expect(verifyHmacSignature({ rawBody: tampered, signature, secret })).toBe(false)
  })

  it('密钥不匹配时验签失败', () => {
    const signature = createHmacSignature(body, 'another-secret')

    expect(verifyHmacSignature({ rawBody: body, signature, secret })).toBe(false)
  })

  it('缺少密钥或签名一律判否', () => {
    expect(verifyHmacSignature({ rawBody: body, signature: '', secret })).toBe(false)
    expect(verifyHmacSignature({ rawBody: body, signature: 'abc', secret: '' })).toBe(false)
  })

  it('兼容 sha256= 前缀形式的签名头', () => {
    expect(normalizeSignatureHeader('sha256=abcdef')).toBe('abcdef')
    expect(normalizeSignatureHeader('abcdef')).toBe('abcdef')
    expect(normalizeSignatureHeader(null)).toBe('')
  })
})
