import OpenAI from 'openai'
import {
  assertOfficialModelRegistered,
  type OfficialModelModality,
} from '@/lib/providers/official/model-registry'
import { ensureBailianCatalogRegistered } from './catalog'
import type { BailianLlmMessage } from './types'

export interface BailianLlmCompletionParams {
  modelId: string
  messages: BailianLlmMessage[]
  apiKey: string
  baseUrl?: string
  temperature?: number
  /** 是否开启思考模式（DashScope 兼容参数 enable_thinking） */
  reasoning?: boolean
  /** 思考深度（DashScope 兼容参数 reasoning_effort），仅思考开启时有效 */
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high'
}

/**
 * 默认请求超时。
 *
 * 旧值 30s 对开启思考的推理模型严重不足：实测 deepseek-v4.1-flash 在
 * 小提示词下已需 20s（默认思考）/ 27.7s（reasoning_effort=high），
 * 而「片段切分」这类需要处理整篇原文的步骤会超过 80s，导致
 * 应用层反复判定 GENERATION_TIMEOUT。
 */
const DEFAULT_TIMEOUT_MS = 300_000

function resolveTimeoutMs(): number {
  const raw = process.env.BAILIAN_LLM_TIMEOUT_MS
  if (!raw) return DEFAULT_TIMEOUT_MS
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS
}

/** effort 档位映射：minimal 在 DashScope 侧没有对应值，归到 low */
function mapReasoningEffort(effort: BailianLlmCompletionParams['reasoningEffort']): string {
  if (effort === 'low' || effort === 'medium' || effort === 'high') return effort
  if (effort === 'minimal') return 'low'
  return 'high'
}

function assertRegistered(modelId: string): void {
  ensureBailianCatalogRegistered()
  assertOfficialModelRegistered({
    provider: 'bailian',
    modality: 'llm' satisfies OfficialModelModality,
    modelId,
  })
}

export async function completeBailianLlm(
  params: BailianLlmCompletionParams,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  assertRegistered(params.modelId)
  const baseURL = typeof params.baseUrl === 'string' && params.baseUrl.trim()
    ? params.baseUrl.trim()
    : 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  const client = new OpenAI({
    apiKey: params.apiKey,
    baseURL,
    timeout: resolveTimeoutMs(),
  })

  // DashScope 兼容层通过 enable_thinking / reasoning_effort 控制思考模式。
  // 不传 enable_thinking=false 时模型会自行思考，产生大段思维链并显著拖慢响应。
  const extraBody: Record<string, unknown> = {
    enable_thinking: params.reasoning !== false,
  }
  if (params.reasoning !== false && params.reasoningEffort) {
    extraBody.reasoning_effort = mapReasoningEffort(params.reasoningEffort)
  }

  const requestBody = {
    model: params.modelId,
    messages: params.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    temperature: params.temperature ?? 0.7,
    ...extraBody,
  }

  const completion = await client.chat.completions.create(
    requestBody as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  )
  return completion as OpenAI.Chat.Completions.ChatCompletion
}
