/**
 * token61 (NEW-API 中转站) 媒体模型内置模板
 *
 * token61 使用自有视频接口：
 * - POST /v1/video/generations          创建视频任务（返回 task_id）
 * - GET  /v1/video/generations/{task_id} 查询任务状态（queued/in_progress/completed/failed）
 *
 * 当用户配置的 token61 媒体模型未显式配置 compatMediaTemplate 时，
 * 系统自动注入以下内置模板，避免视频任务因缺少模板而失败。
 */

import type { OpenAICompatMediaTemplate } from '@/lib/openai-compat-media-template'

/** token61 视频模型内置模板（异步任务模式） */
export const TOKEN61_VIDEO_TEMPLATE: OpenAICompatMediaTemplate = {
  version: 1,
  mediaType: 'video',
  mode: 'async',
  create: {
    method: 'POST',
    path: '/v1/video/generations',
    contentType: 'application/json',
    bodyTemplate: {
      model: '{{model}}',
      prompt: '{{prompt}}',
      image_url: '{{image}}',
      aspect_ratio: '{{aspect_ratio}}',
      duration: '{{duration}}',
      resolution: '{{resolution}}',
      size: '{{size}}',
    },
  },
  status: {
    method: 'GET',
    path: '/v1/video/generations/{{task_id}}',
  },
  response: {
    taskIdPath: '$.task_id',
    statusPath: '$.status',
    outputUrlPath: '$.video_url',
    errorPath: '$.error.message',
  },
  polling: {
    intervalMs: 3000,
    timeoutMs: 600000,
    doneStates: ['completed', 'succeeded'],
    failStates: ['failed', 'error', 'canceled'],
  },
}

/** token61 provider key */
export const TOKEN61_PROVIDER_KEY = 'token61'

/**
 * 为 token61 视频模型解析内置模板：
 * 用户已显式配置模板时优先使用用户配置，否则回退到内置模板。
 */
export function resolveToken61VideoTemplate(
  userTemplate: OpenAICompatMediaTemplate | undefined,
): OpenAICompatMediaTemplate | undefined {
  return userTemplate ?? TOKEN61_VIDEO_TEMPLATE
}
