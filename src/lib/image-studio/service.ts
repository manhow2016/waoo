/**
 * image-studio 后端服务
 *
 * 统一封装图像生成、结果存储到 MediaObject、异步任务轮询，
 * 供 /api/image-studio/* 路由复用。
 */

import { logInfo as _ulogInfo } from '@/lib/logging/core'
import { generateImage } from '@/lib/generator-api'
import { processMediaResult } from '@/lib/media-process'
import { ensureMediaObjectFromStorageKey } from '@/lib/media/service'
import { normalizeReferenceImagesForGeneration } from '@/lib/media/outbound-image'
import { pollAsyncTask } from '@/lib/async-poll'
import type { StudioGenerateOptions, StudioGenerateRequest } from './types'

const PARALLEL_MAX = 4
const DEFAULT_POLL_TIMEOUT_MS = Number.parseInt(process.env.IMAGE_STUDIO_EXTERNAL_TIMEOUT_MS || String(20 * 60 * 1000), 10)
const DEFAULT_POLL_INTERVAL_MS = Number.parseInt(process.env.IMAGE_STUDIO_EXTERNAL_POLL_MS || '3000', 10)

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function clampParallelCount(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 1
  return Math.max(1, Math.min(PARALLEL_MAX, Math.floor(n)))
}

/**
 * 将生成结果（可能是同步 URL/base64，也可能是异步 externalId）解析为可下载的原始图片来源。
 */
async function resolveImageSource(
  userId: string,
  modelKey: string,
  prompt: string,
  options: StudioGenerateOptions,
  referenceImages: string[],
): Promise<string> {
  const normalizedRefs = referenceImages.length > 0
    ? await normalizeReferenceImagesForGeneration(referenceImages, {
        context: { module: 'image-studio', modelKey },
      })
    : []

  const result = await generateImage(userId, modelKey, prompt, {
    referenceImages: normalizedRefs,
    aspectRatio: options.aspectRatio,
    resolution: options.outputSize,
    outputFormat: options.outputFormat,
  })

  if (!result.success) {
    throw new Error(result.error || '图像生成失败')
  }

  if (result.imageUrl) return result.imageUrl
  if (result.imageBase64) return `data:image/png;base64,${result.imageBase64}`
  if (result.imageUrls && result.imageUrls.length > 0) return result.imageUrls[0]

  const externalId = typeof result.externalId === 'string' && result.externalId.trim()
    ? result.externalId.trim()
    : null
  if (!externalId) {
    throw new Error('图像生成未返回图片也未返回异步任务 ID')
  }

  _ulogInfo(`[image-studio] async task submitted: ${externalId}`)
  const startAt = Date.now()
  while (Date.now() - startAt <= DEFAULT_POLL_TIMEOUT_MS) {
    const status = await pollAsyncTask(externalId, userId)
    if (status.status === 'completed') {
      const url = status.resultUrl || status.imageUrl || status.videoUrl
      if (!url) throw new Error(`异步任务完成但缺少结果 URL: ${externalId}`)
      return url
    }
    if (status.status === 'failed') {
      throw new Error(status.error || `异步任务失败: ${externalId}`)
    }
    await sleep(DEFAULT_POLL_INTERVAL_MS)
  }
  throw new Error(`异步任务轮询超时 (${Math.round(DEFAULT_POLL_TIMEOUT_MS / 1000)}s): ${externalId}`)
}

/**
 * 下载生成结果并存储为 MediaObject，返回前端可用的 /m/{publicId} URL。
 */
async function storeToMedia(source: string, targetId: string): Promise<string> {
  const storageKey = await processMediaResult({
    source,
    type: 'image',
    keyPrefix: 'image-studio',
    targetId,
  })
  const mediaRef = await ensureMediaObjectFromStorageKey(storageKey, { mimeType: 'image/jpeg' })
  return mediaRef.url
}

/**
 * 单次生图（含存储），返回 /m/ URL。
 */
export async function generateSingleImage(
  userId: string,
  modelKey: string,
  prompt: string,
  options: StudioGenerateOptions,
  referenceImages: string[],
  targetId: string,
): Promise<string> {
  const source = await resolveImageSource(userId, modelKey, prompt, options, referenceImages)
  return await storeToMedia(source, targetId)
}

/**
 * 并行生图（parallelCount），返回 /m/ URL 列表。
 */
export async function generateParallelImages(input: {
  userId: string
  modelKey: string
  prompt: string
  options: StudioGenerateOptions
  referenceImages: string[]
  parallelCount: number
  targetId: string
}): Promise<{ images: string[]; warning?: string }> {
  const count = clampParallelCount(input.parallelCount)
  const tasks: string[] = []
  const warnings: string[] = []

  const results = await Promise.allSettled(
    Array.from({ length: count }, (_, index) =>
      generateSingleImage(
        input.userId,
        input.modelKey,
        input.prompt,
        input.options,
        input.referenceImages,
        `${input.targetId}-${index}`,
      ),
    ),
  )

  for (const result of results) {
    if (result.status === 'fulfilled') {
      tasks.push(result.value)
    } else {
      warnings.push(result.reason instanceof Error ? result.reason.message : String(result.reason))
    }
  }

  if (tasks.length === 0) {
    throw new Error(warnings[0] || '图像生成失败')
  }

  return {
    images: tasks,
    ...(warnings.length > 0 ? { warning: `${warnings.length} 张生成失败：${warnings[0]}` } : {}),
  }
}

/**
 * 处理 /api/image-studio/generate 请求体。
 */
export async function handleStudioGenerate(input: {
  userId: string
  body: StudioGenerateRequest
}): Promise<{ images: string[]; warning?: string }> {
  const { userId, body } = input
  if (!body.modelKey || !body.prompt?.trim()) {
    throw new Error('缺少必要的生成参数（modelKey / prompt）')
  }

  return await generateParallelImages({
    userId,
    modelKey: body.modelKey,
    prompt: body.prompt.trim(),
    options: body.options || {},
    referenceImages: Array.isArray(body.referenceImages) ? body.referenceImages : [],
    parallelCount: body.parallelCount || 1,
    targetId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  })
}

export function isStudioGenerateError(error: unknown): { code: string; message: string } {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('MODEL_KEY_INVALID')) return { code: 'MODEL_KEY_INVALID', message }
  if (message.includes('MODEL_NOT_ENABLED')) return { code: 'MODEL_NOT_ENABLED', message }
  if (message.includes('PROVIDER_API_KEY_REQUIRED')) return { code: 'PROVIDER_API_KEY_REQUIRED', message }
  return { code: 'GENERATION_FAILED', message }
}
