/**
 * POST /api/image-studio/reverse-prompt
 *
 * 反推提示词流式接口（SSE）。
 * 使用 waoowaoo 统一 LLM 网关（modelKey = provider::modelId）。
 * 返回 text/event-stream，事件：
 *   - event: delta, data: { delta }
 *   - event: done, data: { text }
 *   - event: error, data: { message }
 */

import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import {
  isReversePromptMode,
  streamReversePrompt,
} from '@/lib/image-studio/reverse-prompt'

type RequestBody = {
  modelKey?: unknown
  imageDataUrl?: unknown
  mode?: unknown
}

function isImageDataUrl(value: unknown): value is string {
  return typeof value === 'string' && /^data:image\//.test(value) && value.includes(';base64,')
}

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    throw new ApiError('INVALID_PARAMS', { code: 'BODY_PARSE_FAILED' })
  }

  if (typeof body.modelKey !== 'string' || !body.modelKey.trim()) {
    throw new ApiError('INVALID_PARAMS', { field: 'modelKey' })
  }
  if (!isImageDataUrl(body.imageDataUrl)) {
    throw new ApiError('INVALID_PARAMS', { field: 'imageDataUrl', message: 'imageDataUrl 必须为 data:image 的 base64' })
  }
  const mode = typeof body.mode === 'string' && isReversePromptMode(body.mode) ? body.mode : 'style-extract'

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const safeEnqueue = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {}
      }

      try {
        await streamReversePrompt({
          userId: session.user.id,
          modelKey: body.modelKey as string,
          imageDataUrl: body.imageDataUrl as string,
          mode,
          callbacks: {
            onStage() {
              safeEnqueue('event: start\ndata: {"stage":"start"}\n\n')
            },
            onChunk(chunk) {
              if (chunk.kind !== 'text' || !chunk.delta) return
              safeEnqueue(`event: delta\ndata: ${JSON.stringify({ delta: chunk.delta })}\n\n`)
            },
            onComplete(text) {
              safeEnqueue(`event: done\ndata: ${JSON.stringify({ text })}\n\n`)
            },
            onError(error) {
              const message = error instanceof Error ? error.message : String(error)
              safeEnqueue(`event: error\ndata: ${JSON.stringify({ message })}\n\n`)
            },
          },
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        safeEnqueue(`event: error\ndata: ${JSON.stringify({ message })}\n\n`)
      } finally {
        try {
          controller.close()
        } catch {}
      }
    },
  })

  return new NextResponse(stream as unknown as BodyInit, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
})
