/**
 * POST /api/image-studio/prompt-optimize
 *
 * 提示词优化流式接口（SSE）。
 * 使用 waoowaoo 统一 LLM 网关（modelKey = provider::modelId）。
 * 事件：start / delta / done / error
 */

import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { isPromptOptimizeMode, streamPromptOptimize } from '@/lib/image-studio/prompt-optimize'

type RequestBody = {
  modelKey?: unknown
  prompt?: unknown
  mode?: unknown
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
  if (typeof body.prompt !== 'string' || !body.prompt.trim()) {
    throw new ApiError('INVALID_PARAMS', { field: 'prompt' })
  }
  const mode = typeof body.mode === 'string' && isPromptOptimizeMode(body.mode) ? body.mode : 'text-to-image'

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const safeEnqueue = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {}
      }

      try {
        await streamPromptOptimize({
          userId: session.user.id,
          modelKey: body.modelKey as string,
          mode,
          prompt: body.prompt as string,
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
