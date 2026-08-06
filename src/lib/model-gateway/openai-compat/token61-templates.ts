/**
 * token61 (NEW-API 中转站) 媒体模型内置模板
 *
 * token61 使用自有媒体接口：
 * - 视频：POST /v1/video/generations          创建任务（返回 task_id）
 *         GET  /v1/video/generations/{task_id} 查询状态
 * - 图像：POST /v1/images/generations          同步生成（返回 { data: [{ url }] }）
 *         带参考图时多数中转兼容 image_url 参数
 *
 * 当用户配置的 token61 媒体模型未显式配置 compatMediaTemplate 时，
 * 系统自动注入以下内置模板，避免任务因缺少模板而失败。
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
    // token61 状态接口返回 { code, message, data: { status, result_url, fail_reason } }
    statusPath: '$.data.status',
    outputUrlPath: '$.data.result_url',
    errorPath: '$.data.fail_reason',
  },
  polling: {
    intervalMs: 3000,
    timeoutMs: 600000,
    // token61 状态值：IN_PROGRESS(生成中) / SUCCESS(完成) / FAILED(失败)
    doneStates: ['success', 'succeeded', 'completed'],
    failStates: ['failed', 'error', 'canceled'],
  },
}

/** token61 图像模型内置模板（同步模式，OpenAI 兼容 generations 接口） */
export const TOKEN61_IMAGE_TEMPLATE: OpenAICompatMediaTemplate = {
  version: 1,
  mediaType: 'image',
  mode: 'sync',
  create: {
    method: 'POST',
    path: '/v1/images/generations',
    contentType: 'application/json',
    bodyTemplate: {
      model: '{{model}}',
      prompt: '{{prompt}}',
      size: '{{size}}',
      image_url: '{{image}}',
    },
  },
  response: {
    outputUrlsPath: '$.data',
    outputUrlPath: '$.data[0].url',
    errorPath: '$.error.message',
  },
}

/** token61 provider key */
export const TOKEN61_PROVIDER_KEY = 'token61'

/**
 * 为 token61 媒体模型解析内置模板：
 * 用户已显式配置模板时优先使用用户配置，否则回退到内置模板。
 */
export function resolveToken61MediaTemplate(input: {
  mediaType: 'image' | 'video'
  userTemplate: OpenAICompatMediaTemplate | undefined
}): OpenAICompatMediaTemplate | undefined {
  if (input.userTemplate) return input.userTemplate
  return input.mediaType === 'video' ? TOKEN61_VIDEO_TEMPLATE : TOKEN61_IMAGE_TEMPLATE
}
