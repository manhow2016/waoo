/**
 * token61 (NEW-API 中转站) OpenAI 兼容 TTS 合成
 *
 * 调用 token61 的 OpenAI 兼容 /audio/speech 接口：
 * - POST {baseUrl}/audio/speech
 * - body: { model, input: text, voice: voiceId, response_format: 'wav' }
 * - 响应：二进制音频（wav）
 *
 * voice 使用 AI 设计音色的 voiceId（由 token61 /audio/design 创建）。
 */

import { logInfo as _ulogInfo } from '@/lib/logging/core'

export interface Token61TTSInput {
  text: string
  voiceId: string
  modelId: string
  baseUrl?: string
  responseFormat?: 'wav' | 'mp3'
}

export interface Token61TTSResult {
  success: boolean
  audioData?: Buffer
  contentType?: string
  error?: string
  requestId?: string
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function synthesizeWithToken61TTS(
  input: Token61TTSInput,
  apiKey: string,
): Promise<Token61TTSResult> {
  const text = readTrimmedString(input.text)
  const voiceId = readTrimmedString(input.voiceId)
  const modelId = readTrimmedString(input.modelId)

  if (!apiKey.trim()) {
    return { success: false, error: 'TOKEN61_API_KEY_REQUIRED' }
  }
  if (!text) {
    return { success: false, error: 'TOKEN61_TTS_TEXT_REQUIRED' }
  }
  if (!voiceId) {
    return { success: false, error: 'TOKEN61_TTS_VOICE_ID_REQUIRED' }
  }
  if (!modelId) {
    return { success: false, error: 'TOKEN61_TTS_MODEL_REQUIRED' }
  }

  const baseUrl = (input.baseUrl?.trim() || 'https://token61.com/v1').replace(/\/+$/, '')
  const endpoint = `${baseUrl}/audio/speech`
  const body = {
    model: modelId,
    input: text,
    voice: voiceId,
    response_format: input.responseFormat || 'wav',
  }

  _ulogInfo('[Token61TTS] 请求:', JSON.stringify({ endpoint, model: modelId, voice: voiceId, textLength: text.length }))

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        accept: '*/*',
      },
      body: JSON.stringify(body),
    })

    const contentType = response.headers.get('content-type') || ''
    const requestId = response.headers.get('x-request-id') || undefined

    if (!response.ok) {
      const rawText = await response.text().catch(() => '')
      return {
        success: false,
        error: parseToken61Error(rawText) || `TOKEN61_TTS_FAILED(${response.status})`,
        requestId,
      }
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length === 0) {
      return { success: false, error: 'TOKEN61_TTS_EMPTY_RESPONSE', requestId }
    }

    return {
      success: true,
      audioData: buffer,
      contentType,
      requestId,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '网络请求失败'
    return { success: false, error: message || 'TOKEN61_TTS_NETWORK_ERROR' }
  }
}

function parseToken61Error(rawText: string): string | null {
  if (!rawText) return null
  try {
    const parsed = JSON.parse(rawText) as {
      error?: { message?: unknown }
      message?: unknown
    }
    if (typeof parsed.error?.message === 'string' && parsed.error.message.trim()) {
      return parsed.error.message.trim()
    }
    if (typeof parsed.message === 'string' && parsed.message.trim()) {
      return parsed.message.trim()
    }
  } catch {
    // 非 JSON
  }
  return rawText.slice(0, 300)
}
