import {
  assertOfficialModelRegistered,
  type OfficialModelModality,
} from '@/lib/providers/official/model-registry'
import { getProviderConfig } from '@/lib/api-config'
import type { GenerateResult } from '@/lib/generators/base'
import { ensureBailianCatalogRegistered } from './catalog'
import type { BailianGenerateRequestOptions } from './types'

export interface BailianImageGenerateParams {
  userId: string
  prompt: string
  referenceImages?: string[]
  options: BailianGenerateRequestOptions
}

function assertRegistered(modelId: string): void {
  ensureBailianCatalogRegistered()
  assertOfficialModelRegistered({
    provider: 'bailian',
    modality: 'image' satisfies OfficialModelModality,
    modelId,
  })
}

/**
 * 百炼新系图像模型（qwen-image-2.0 系 / wan2.7-image 系 / z-image 系）统一走
 * 同步 multimodal-generation 接口：
 * - 纯文本内容 = 文生图
 * - 图像 + 文本内容 = 图像编辑 / 多图融合
 *
 * 注意：不可携带 X-DashScope-Async 头，否则会被判定为异步调用而返回 403
 * `AccessDenied: current user api does not support asynchronous calls`。
 * 旧接口 services/aigc/text2image/image-synthesis（异步）仅支持 wan2.5 及更低版本，
 * 对新系模型会返回 400 `url error`。
 */
const BAILIAN_MULTIMODAL_ENDPOINT =
  'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'

/** 常见比例推荐分辨率（DashScope size 格式为「宽*高」） */
const BAILIAN_SIZE_BY_ASPECT_RATIO: Readonly<Record<string, string>> = {
  '1:1': '1024*1024',
  '2:3': '768*1152',
  '3:2': '1152*768',
  '3:4': '960*1280',
  '4:3': '1280*960',
  '9:16': '720*1280',
  '16:9': '1280*720',
  '21:9': '1344*576',
}

/** 图像编辑最多支持 3 张输入图（DashScope 限制） */
const BAILIAN_MAX_INPUT_IMAGES = 3

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * 归一化输出尺寸。
 * 项目链路可能传入三种形态：size（"5016x3344"）、resolution（"1K"/"2K" 档位）、aspectRatio（"16:9"）。
 * DashScope 只接受「宽*高」，因此统一转换；都无法转换时不传，由服务端按默认规则决定。
 */
function resolveSize(options: BailianGenerateRequestOptions): string | undefined {
  const size = readTrimmedString(options.size)
  if (size) {
    // 兼容 x / X / * 三种分隔符
    const parts = size.split(/[xX*]/).map((part) => part.trim())
    if (parts.length === 2 && parts.every((part) => /^\d+$/.test(part))) {
      return `${parts[0]}*${parts[1]}`
    }
    throw new Error(`BAILIAN_IMAGE_SIZE_INVALID: ${size}`)
  }

  const aspectRatio = readTrimmedString(options.aspectRatio)
  if (aspectRatio) {
    const mapped = BAILIAN_SIZE_BY_ASPECT_RATIO[aspectRatio]
    if (mapped) return mapped
    throw new Error(`BAILIAN_IMAGE_ASPECT_RATIO_UNSUPPORTED: ${aspectRatio}`)
  }

  // resolution 档位无法直接映射为像素，交由服务端默认规则处理
  return undefined
}

/**
 * 参考图统一转成 base64 data URL。
 * 项目链路传入的参考图可能是 MinIO 签名 URL（如 http://localhost:19000/...），
 * 百炼服务端无法访问该地址，必须内联传输。
 */
async function toInlineImages(referenceImages: string[]): Promise<string[]> {
  const { normalizeToBase64ForGeneration } = await import('@/lib/media/outbound-image')
  const inline: string[] = []
  for (const url of referenceImages) {
    const trimmed = readTrimmedString(url)
    if (!trimmed) continue
    if (trimmed.startsWith('data:')) {
      inline.push(trimmed)
      continue
    }
    inline.push(await normalizeToBase64ForGeneration(trimmed))
  }
  return inline
}

interface BailianImageResponse {
  request_id?: string
  code?: string
  message?: string
  output?: {
    choices?: Array<{
      message?: {
        content?: Array<{ image?: string; text?: string }>
      }
    }>
  }
}

async function parseJsonResponse(response: Response): Promise<BailianImageResponse> {
  const raw = await response.text().catch(() => '')
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('RESPONSE_NOT_OBJECT')
    }
    return parsed as BailianImageResponse
  } catch {
    throw new Error('BAILIAN_IMAGE_RESPONSE_INVALID_JSON')
  }
}

function readFailureDetail(data: BailianImageResponse): string {
  return readTrimmedString(data.message) || readTrimmedString(data.code)
}

/**
 * 阿里云百炼图像生成 / 编辑。
 * 无参考图时等价于文生图；有参考图时为图像编辑（最多 3 张输入图）。
 */
export async function generateBailianImage(params: BailianImageGenerateParams): Promise<GenerateResult> {
  assertRegistered(params.options.modelId)

  const modelId = readTrimmedString(params.options.modelId)
  const prompt = readTrimmedString(params.prompt)
  if (!prompt) throw new Error('BAILIAN_IMAGE_PROMPT_REQUIRED')

  const { apiKey } = await getProviderConfig(params.userId, params.options.provider)
  if (!apiKey) throw new Error('BAILIAN_API_KEY_MISSING')

  const referenceImages = (params.referenceImages ?? []).filter(
    (url): url is string => typeof url === 'string' && url.trim().length > 0,
  )
  const inlineImages = await toInlineImages(referenceImages)
  if (inlineImages.length > BAILIAN_MAX_INPUT_IMAGES) {
    throw new Error(
      `BAILIAN_IMAGE_REFERENCE_TOO_MANY: 最多支持 ${BAILIAN_MAX_INPUT_IMAGES} 张参考图，实际 ${inlineImages.length} 张`,
    )
  }

  // 参考图在前、文本指令在后（DashScope 约定：多图输入时输出比例以最后一张图为准）
  const content: Array<Record<string, string>> = inlineImages.map((image) => ({ image }))
  content.push({ text: prompt })

  const body: Record<string, unknown> = {
    model: modelId,
    input: {
      messages: [{ role: 'user', content }],
    },
  }
  const size = resolveSize(params.options)
  if (size) body.parameters = { size, n: 1 }

  const response = await fetch(BAILIAN_MULTIMODAL_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = await parseJsonResponse(response)
  if (!response.ok) {
    throw new Error(
      `BAILIAN_IMAGE_FAILED(${response.status}): ${readFailureDetail(data) || 'unknown error'}`,
    )
  }

  const choices = data.output?.choices
  const imageUrls = (Array.isArray(choices) ? choices : [])
    .flatMap((choice) => (Array.isArray(choice?.message?.content) ? choice.message.content : []))
    .map((item) => readTrimmedString(item?.image))
    .filter((url) => url.length > 0)

  if (imageUrls.length === 0) {
    throw new Error('BAILIAN_IMAGE_RESULT_MISSING')
  }

  return {
    success: true,
    imageUrl: imageUrls[0],
    imageUrls,
    requestId: readTrimmedString(data.request_id) || undefined,
  }
}
