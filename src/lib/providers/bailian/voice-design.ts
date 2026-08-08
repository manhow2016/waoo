import { logInfo as _ulogInfo } from '@/lib/logging/core'

export interface VoiceDesignInput {
  voicePrompt: string
  previewText: string
  preferredName?: string
  language?: 'zh' | 'en'
  /** 可选的 DashScope 兼容 baseUrl（默认官方） */
  baseUrl?: string
  /** provider key：bailian（DashScope 接口）或 token61（NEW-API /audio/design 接口） */
  providerKey?: string
}

export interface VoiceDesignResult {
  success: boolean
  voiceId?: string
  targetModel?: string
  audioBase64?: string
  sampleRate?: number
  responseFormat?: string
  usageCount?: number
  requestId?: string
  error?: string
  errorCode?: string
}

export async function createVoiceDesign(
  input: VoiceDesignInput,
  apiKey: string,
): Promise<VoiceDesignResult> {
  if (!apiKey) {
    return {
      success: false,
      error: '请配置声音设计服务 API Key',
    }
  }

  const requestBody = {
    model: 'qwen-voice-design',
    input: {
      action: 'create',
      target_model: 'qwen3-tts-vd-2026-01-26',
      voice_prompt: input.voicePrompt,
      preview_text: input.previewText,
      preferred_name: input.preferredName || 'custom_voice',
      language: input.language || 'zh',
    },
    parameters: {
      sample_rate: 24000,
      response_format: 'wav',
    },
  }

  _ulogInfo('[VoiceDesign] 请求体:', JSON.stringify(requestBody, null, 2))

  // providerKey 决定接口路径与响应格式：
  // - token61：POST {baseUrl}/audio/design，响应 { voice, preview_audio: { data, type } }
  // - bailian/其它：POST DashScope /services/audio/tts/customization，响应 { output: {...} }
  const isToken61 = input.providerKey === 'token61'
  const endpointBase = input.baseUrl?.trim()
    ? input.baseUrl.replace(/\/+$/, '')
    : 'https://dashscope.aliyuncs.com/api/v1'
  const endpoint = isToken61
    ? `${endpointBase}/audio/design`
    : `${endpointBase}/services/audio/tts/customization`

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    const rawText = await response.text().catch(() => '')
    let data: Record<string, unknown> = {}
    try {
      data = JSON.parse(rawText) as Record<string, unknown>
    } catch {
      // 非 JSON 响应
    }

    if (!response.ok) {
      const rawMessage = readErrorMessage(data) || `声音设计 API 调用失败 (${response.status})`
      // token61 中转未正确配置声音设计渠道时给出清晰提示
      const isRelayError = /invalid relay format|gen_relay_info_failed|voice_prompt is required/i.test(rawMessage)
      return {
        success: false,
        error: isToken61 && isRelayError
          ? `声音设计暂不可用：token61 中转未正确配置 qwen-voice-design 渠道（${rawMessage}）。请联系 token61 平台确认，或改在设置中心配置 bailian（阿里百炼）API Key。`
          : rawMessage,
        errorCode: readErrorCode(data) || (isRelayError ? 'RELAY_UNCONFIGURED' : undefined),
      }
    }

    // token61 响应：{ voice, preview_audio: { data, type } }
    if (isToken61) {
      const voiceId = typeof data.voice === 'string' ? data.voice.trim() : ''
      const preview = data.preview_audio as { data?: unknown; type?: unknown } | undefined
      const audioBase64 = typeof preview?.data === 'string' ? preview.data : ''
      if (voiceId && audioBase64) {
        return {
          success: true,
          voiceId,
          targetModel: 'qwen3-tts-vd-2026-01-26',
          audioBase64,
          responseFormat: typeof preview?.type === 'string' ? preview.type : 'wav',
          sampleRate: 24000,
        }
      }
      return {
        success: false,
        error: readErrorMessage(data) || '声音设计返回缺少 voice 或 preview_audio',
        errorCode: readErrorCode(data),
      }
    }

    // bailian 响应：{ output: { voice, preview_audio: { data, sample_rate, response_format } }, request_id }
    const output = data.output as {
      voice?: unknown
      target_model?: unknown
      preview_audio?: { data?: unknown; sample_rate?: unknown; response_format?: unknown }
    } | undefined
    const voiceId = typeof output?.voice === 'string' ? output.voice.trim() : ''
    const audioBase64 = typeof output?.preview_audio?.data === 'string' ? output.preview_audio.data : ''
    if (voiceId && audioBase64) {
      return {
        success: true,
        voiceId,
        targetModel: typeof output?.target_model === 'string' ? output.target_model : undefined,
        audioBase64,
        sampleRate: typeof output?.preview_audio?.sample_rate === 'number' ? output.preview_audio.sample_rate : undefined,
        responseFormat: typeof output?.preview_audio?.response_format === 'string' ? output.preview_audio.response_format : undefined,
        requestId: typeof data.request_id === 'string' ? data.request_id : undefined,
      }
    }

    return {
      success: false,
      error: readErrorMessage(data) || '声音设计 API 调用失败',
      errorCode: readErrorCode(data),
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '网络请求失败'
    return {
      success: false,
      error: message || '网络请求失败',
    }
  }
}

function readErrorMessage(data: Record<string, unknown>): string | undefined {
  const candidates = [
    data.message,
    data.error_message,
    (data.error as Record<string, unknown> | undefined)?.message,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return undefined
}

function readErrorCode(data: Record<string, unknown>): string | undefined {
  const candidates = [
    data.code,
    (data.error as Record<string, unknown> | undefined)?.code,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return undefined
}

export function validateVoicePrompt(voicePrompt: string): { valid: boolean; error?: string } {
  if (!voicePrompt || voicePrompt.trim().length === 0) {
    return { valid: false, error: '声音提示词不能为空' }
  }
  if (voicePrompt.length > 500) {
    return { valid: false, error: '声音提示词不能超过500个字符' }
  }
  return { valid: true }
}

export function validatePreviewText(previewText: string): { valid: boolean; error?: string } {
  if (!previewText || previewText.trim().length === 0) {
    return { valid: false, error: '预览文本不能为空' }
  }
  if (previewText.length < 5) {
    return { valid: false, error: '预览文本至少需要5个字符' }
  }
  if (previewText.length > 200) {
    return { valid: false, error: '预览文本不能超过200个字符' }
  }
  return { valid: true }
}
