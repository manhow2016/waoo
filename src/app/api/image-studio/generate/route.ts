/**
 * POST /api/image-studio/generate
 *
 * 生图工作台 / 无限画布 / 动图生成 共用生图入口。
 * 模型使用 waoowaoo 统一模型配置（provider::modelId）。
 * 生成结果存储到 MediaObject，返回 /m/{publicId} 稳定 URL。
 */

import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { handleStudioGenerate, isStudioGenerateError } from '@/lib/image-studio/service'
import type { StudioGenerateRequest } from '@/lib/image-studio/types'

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  let body: StudioGenerateRequest
  try {
    body = (await request.json()) as StudioGenerateRequest
  } catch {
    throw new ApiError('INVALID_PARAMS', {
      code: 'BODY_PARSE_FAILED',
      field: 'body',
      message: 'request body must be valid JSON',
    })
  }

  if (typeof body.modelKey !== 'string' || !body.modelKey.trim()) {
    throw new ApiError('INVALID_PARAMS', { field: 'modelKey' })
  }
  if (typeof body.prompt !== 'string' || !body.prompt.trim()) {
    throw new ApiError('INVALID_PARAMS', { field: 'prompt' })
  }

  try {
    const result = await handleStudioGenerate({ userId: session.user.id, body })
    return NextResponse.json({
      success: true,
      images: result.images,
      ...(result.warning ? { warning: result.warning } : {}),
    })
  } catch (error) {
    const detail = isStudioGenerateError(error)
    throw new ApiError(detail.code === 'GENERATION_FAILED' ? 'GENERATION_FAILED' : 'EXTERNAL_ERROR', {
      code: detail.code,
      message: detail.message,
    })
  }
})
