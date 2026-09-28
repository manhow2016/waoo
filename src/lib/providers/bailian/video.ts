import {
  assertOfficialModelRegistered,
  type OfficialModelModality,
} from '@/lib/providers/official/model-registry'
import { getProviderConfig } from '@/lib/api-config'
import type { GenerateResult } from '@/lib/generators/base'
import { toFetchableUrl } from '@/lib/storage/utils'
import { ensureBailianCatalogRegistered } from './catalog'
import type { BailianGenerateRequestOptions } from './types'

export interface BailianVideoGenerateParams {
  userId: string
  imageUrl: string
  prompt?: string
  options: BailianGenerateRequestOptions
}

function assertRegistered(modelId: string): void {
  ensureBailianCatalogRegistered()
  assertOfficialModelRegistered({
    provider: 'bailian',
    modality: 'video' satisfies OfficialModelModality,
    modelId,
  })
}

const BAILIAN_VIDEO_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis'
const BAILIAN_KF2V_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/image2video/video-synthesis'
/**
 * wan2.7 系改用 media 数组承载输入图（type 为语义值 first_frame/last_frame），
 * 老模型仍用 img_url / first_frame_url / last_frame_url 字符串字段。
 */
const BAILIAN_MEDIA_ARRAY_MODELS = new Set([
  'wan2.7-i2v',
])

const BAILIAN_FIRST_LAST_FRAME_ONLY_MODELS = new Set([
  'wan2.2-kf2v-flash',
  'wanx2.1-kf2v-plus',
])
const BAILIAN_FIRST_LAST_FRAME_CAPABLE_MODELS = new Set([
  ...BAILIAN_FIRST_LAST_FRAME_ONLY_MODELS,
  'wan2.7-i2v',
])

interface BailianVideoSubmitResponse {
  request_id?: string
  code?: string
  message?: string
  output?: {
    task_id?: string
    task_status?: string
  }
}

interface BailianVideoSubmitParameters {
  resolution?: string
  size?: string
  watermark?: boolean
  prompt_extend?: boolean
  duration?: number
}

interface BailianVideoSubmitBody {
  model: string
  // media 为数组形态（wan2.7 系），其余为字符串字段
  input: Record<string, string | Array<{ type: string; url: string }>>
  parameters?: BailianVideoSubmitParameters
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`BAILIAN_VIDEO_OPTION_INVALID_${fieldName.toUpperCase()}`)
  }
  return value
}

function supportsFirstLastFrame(modelId: string): boolean {
  return BAILIAN_FIRST_LAST_FRAME_CAPABLE_MODELS.has(modelId)
}

function isFirstLastFrameOnlyModel(modelId: string): boolean {
  return BAILIAN_FIRST_LAST_FRAME_ONLY_MODELS.has(modelId)
}

function assertNoUnsupportedOptions(options: BailianGenerateRequestOptions): void {
  const allowedOptionKeys = new Set([
    'provider',
    'modelId',
    'modelKey',
    'prompt',
    // 仅接受不下发：百炼 i2v 的输出比例由输入图片决定，
    // 实测 size/aspect_ratio 均被服务端静默忽略（详见 apply 脚本注释与单测）
    'aspectRatio',
    'resolution',
    'size',
    'watermark',
    'promptExtend',
    'duration',
    'lastFrameImageUrl',
  ])
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue
    if (!allowedOptionKeys.has(key)) {
      throw new Error(`BAILIAN_VIDEO_OPTION_UNSUPPORTED: ${key}`)
    }
  }
}

function buildSubmitRequest(params: BailianVideoGenerateParams): {
  endpoint: string
  body: BailianVideoSubmitBody
} {
  const imageUrl = readTrimmedString(params.imageUrl)
  if (!imageUrl) {
    throw new Error('BAILIAN_VIDEO_IMAGE_URL_REQUIRED')
  }
  const modelId = readTrimmedString(params.options.modelId)
  if (!modelId) {
    throw new Error('BAILIAN_VIDEO_MODEL_ID_REQUIRED')
  }

  const firstFrameUrl = toFetchableUrl(imageUrl)
  const lastFrameImageUrl = readTrimmedString(params.options.lastFrameImageUrl)
  const firstLastFrame = !!lastFrameImageUrl
  if (isFirstLastFrameOnlyModel(modelId) && !firstLastFrame) {
    throw new Error('BAILIAN_VIDEO_LAST_FRAME_IMAGE_URL_REQUIRED')
  }
  if (firstLastFrame && !supportsFirstLastFrame(modelId)) {
    throw new Error(`BAILIAN_VIDEO_LAST_FRAME_UNSUPPORTED_FOR_MODEL: ${modelId}`)
  }

  // 注意：params.options.aspectRatio 在此**有意忽略**。
  // 百炼 i2v 仅按输入图片比例出图，传 size / aspect_ratio 都不会生效（已实测），
  // 下发反而会让调用方误以为比例受控。
  const prompt = readTrimmedString(params.prompt) || readTrimmedString(params.options.prompt)
  const resolution = readTrimmedString(params.options.resolution)
  const size = readTrimmedString(params.options.size)
  const watermark = readOptionalBoolean(params.options.watermark)
  const promptExtend = readOptionalBoolean(params.options.promptExtend)
  const duration = readOptionalPositiveInteger(params.options.duration, 'duration')

  // wan2.7 系用 media 数组，老模型用字符串字段（实测差异，见文件头注释）
  const usesMediaArray = BAILIAN_MEDIA_ARRAY_MODELS.has(modelId)
  const mediaItems: Array<{ type: string; url: string }> = usesMediaArray
    ? [
      { type: 'first_frame', url: firstFrameUrl },
      ...(firstLastFrame ? [{ type: 'last_frame', url: toFetchableUrl(lastFrameImageUrl) }] : []),
    ]
    : []

  const submitBody: BailianVideoSubmitBody = {
    model: modelId,
    input: usesMediaArray
      ? { media: mediaItems }
      : firstLastFrame
        ? {
          first_frame_url: firstFrameUrl,
          last_frame_url: toFetchableUrl(lastFrameImageUrl),
        }
        : {
          img_url: firstFrameUrl,
        },
  }
  if (prompt) {
    submitBody.input.prompt = prompt
  }

  const submitParameters: BailianVideoSubmitParameters = {}
  if (resolution) {
    submitParameters.resolution = resolution
  }
  if (size) {
    submitParameters.size = size
  }
  if (typeof watermark === 'boolean') {
    submitParameters.watermark = watermark
  }
  if (typeof promptExtend === 'boolean') {
    submitParameters.prompt_extend = promptExtend
  }
  if (typeof duration === 'number') {
    submitParameters.duration = duration
  }
  if (Object.keys(submitParameters).length > 0) {
    submitBody.parameters = submitParameters
  }

  return {
    // wan2.7 系（media 数组）首尾帧也在主端点，走 kf2v 端点会 url error（实测）
    endpoint: firstLastFrame && !BAILIAN_MEDIA_ARRAY_MODELS.has(modelId)
      ? BAILIAN_KF2V_ENDPOINT
      : BAILIAN_VIDEO_ENDPOINT,
    body: submitBody,
  }
}

async function parseSubmitResponse(response: Response): Promise<BailianVideoSubmitResponse> {
  const raw = await response.text()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('BAILIAN_VIDEO_RESPONSE_INVALID')
    }
    return parsed as BailianVideoSubmitResponse
  } catch {
    throw new Error('BAILIAN_VIDEO_RESPONSE_INVALID_JSON')
  }
}

export async function generateBailianVideo(params: BailianVideoGenerateParams): Promise<GenerateResult> {
  assertRegistered(params.options.modelId)
  assertNoUnsupportedOptions(params.options)

  const { apiKey } = await getProviderConfig(params.userId, params.options.provider)
  const submitRequest = buildSubmitRequest(params)
  const response = await fetch(submitRequest.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify(submitRequest.body),
  })
  const data = await parseSubmitResponse(response)

  if (!response.ok) {
    const code = readTrimmedString(data.code)
    const message = readTrimmedString(data.message)
    throw new Error(`BAILIAN_VIDEO_SUBMIT_FAILED(${response.status}): ${code || message || 'unknown error'}`)
  }

  const taskId = readTrimmedString(data.output?.task_id)
  if (!taskId) {
    throw new Error('BAILIAN_VIDEO_TASK_ID_MISSING')
  }

  return {
    success: true,
    async: true,
    requestId: taskId,
    externalId: `BAILIAN:VIDEO:${taskId}`,
  }
}
