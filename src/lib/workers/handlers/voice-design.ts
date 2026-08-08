import type { Job } from 'bullmq'
import {
  createVoiceDesign,
  validatePreviewText,
  validateVoicePrompt,
  type VoiceDesignInput,
} from '@/lib/providers/bailian/voice-design'
import { findProviderConfig } from '@/lib/api-config'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

// 声音设计（自定义音色创建）：
// - bailian：DashScope customization 接口（POST /services/audio/tts/customization）
// - token61：NEW-API 中转（POST /v1/audio/design）
// 按优先级动态解析第一个已配置且带 API key 的 provider。
const VOICE_DESIGN_PROVIDER_KEYS = ['bailian', 'token61']

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is required`)
  }
  return value.trim()
}

function readLanguage(value: unknown): 'zh' | 'en' {
  return value === 'en' ? 'en' : 'zh'
}

export async function handleVoiceDesignTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Record<string, unknown>
  const voicePrompt = readRequiredString(payload.voicePrompt, 'voicePrompt')
  const previewText = readRequiredString(payload.previewText, 'previewText')
  const preferredName = typeof payload.preferredName === 'string' && payload.preferredName.trim()
    ? payload.preferredName.trim()
    : 'custom_voice'
  const language = readLanguage(payload.language)

  const promptValidation = validateVoicePrompt(voicePrompt)
  if (!promptValidation.valid) {
    throw new Error(promptValidation.error || 'invalid voicePrompt')
  }
  const textValidation = validatePreviewText(previewText)
  if (!textValidation.valid) {
    throw new Error(textValidation.error || 'invalid previewText')
  }

  await reportTaskProgress(job, 25, {
    stage: 'voice_design_submit',
    stageLabel: '提交声音设计任务',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'voice_design_submit')

  const providerConfig = await findProviderConfig(job.data.userId, VOICE_DESIGN_PROVIDER_KEYS)
  if (!providerConfig) {
    throw new Error('VOICE_DESIGN_PROVIDER_NOT_CONFIGURED: 声音设计需要配置 bailian（阿里百炼）或 token61 API Key')
  }

  const providerKey = providerConfig.id.includes(':')
    ? providerConfig.id.slice(0, providerConfig.id.indexOf(':'))
    : providerConfig.id

  const input: VoiceDesignInput = {
    voicePrompt,
    previewText,
    preferredName,
    language,
    // 传入 provider 的 baseUrl 与 key，区分 token61 / bailian 接口
    baseUrl: providerConfig.baseUrl,
    providerKey: providerKey.toLowerCase(),
  }
  const designed = await createVoiceDesign(input, providerConfig.apiKey)
  if (!designed.success) {
    throw new Error(designed.error || '声音设计失败')
  }

  await reportTaskProgress(job, 96, {
    stage: 'voice_design_done',
    stageLabel: '声音设计完成',
    displayMode: 'detail',
  })

  return {
    success: true,
    voiceId: designed.voiceId,
    targetModel: designed.targetModel,
    audioBase64: designed.audioBase64,
    sampleRate: designed.sampleRate,
    responseFormat: designed.responseFormat,
    usageCount: designed.usageCount,
    requestId: designed.requestId,
    taskType: job.data.type === TASK_TYPE.ASSET_HUB_VOICE_DESIGN ? TASK_TYPE.ASSET_HUB_VOICE_DESIGN : TASK_TYPE.VOICE_DESIGN,
  }
}
