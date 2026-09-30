import crypto from 'crypto'

/**
 * 支付回调 HMAC-SHA256 验签
 *
 * 所有真实渠道（支付宝/微信/Stripe 等）的回调验签都基于「原始请求体 + 密钥」，
 * 差异只在签名算法与字段解析。这里提供统一的常量时间比较实现，
 * 新增适配器时直接复用，避免各写一份容易写错的比较逻辑。
 */

export function createHmacSignature(rawBody: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
}

/** 读取签名值，兼容 `sha256=xxx` 前缀形式 */
export function normalizeSignatureHeader(raw: string | null): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  const separatorIndex = trimmed.indexOf('=')
  if (separatorIndex === -1) return trimmed
  const scheme = trimmed.slice(0, separatorIndex).toLowerCase()
  if (scheme === 'sha256' || scheme === 'sha1' || scheme === 'md5') {
    return trimmed.slice(separatorIndex + 1).trim()
  }
  return trimmed
}

/**
 * 常量时间比较，避免通过响应耗时侧信道爆破签名。
 * 长度不同直接判否（长度本身不构成有效信息泄漏）。
 */
export function verifyHmacSignature(input: {
  rawBody: string
  signature: string
  secret: string
}): boolean {
  if (!input.secret || !input.signature) return false

  const expected = createHmacSignature(input.rawBody, input.secret)
  const expectedBuffer = Buffer.from(expected, 'utf8')
  const actualBuffer = Buffer.from(input.signature, 'utf8')
  if (expectedBuffer.length !== actualBuffer.length) return false

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer)
}
