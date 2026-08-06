/**
 * image-studio 模块共享类型
 *
 * 生图工作台 / 无限画布 / 反推提示词 / 动图生成 四个功能统一使用
 * waoowaoo 的模型配置（provider::modelId 复合键），本文件定义它们共用的请求/响应契约。
 */

/** 图像模型输出尺寸档位（对应能力目录中的 resolutionOptions） */
export type StudioOutputSize = '512' | '1K' | '2K' | '4K'

/** 宽高比，如 1:1 / 16:9 */
export type StudioAspectRatio = string

/** 参考图描述（前端上传后转 data URL 传入） */
export interface StudioReferenceImage {
  id: string
  name: string
  dataUrl: string
  mimeType: string
}

/** 生图请求选项（与模型能力解耦，由后端按模型路由） */
export interface StudioGenerateOptions {
  /** 输出尺寸档位：512/1K/2K/4K */
  outputSize?: StudioOutputSize
  /** 宽高比，如 1:1 / 16:9 */
  aspectRatio?: StudioAspectRatio
  /** OpenAI 兼容自定义像素尺寸，优先于 aspectRatio */
  customSize?: string
  /** 生成温度（不支持温度的原生模型忽略） */
  temperature?: number
  /** GPT Image 高级参数：质量 */
  quality?: 'auto' | 'low' | 'medium' | 'high'
  /** GPT Image 高级参数：风格 */
  style?: 'auto' | 'vivid' | 'natural'
  /** GPT Image 高级参数：背景 */
  background?: 'auto' | 'transparent' | 'opaque'
  /** 输出格式：png/jpeg/webp */
  outputFormat?: string
}

/** 生图请求体 */
export interface StudioGenerateRequest {
  /** waoowaoo 模型复合键：provider::modelId */
  modelKey: string
  prompt: string
  /** 图生图参考图（data URL） */
  referenceImages?: string[]
  options?: StudioGenerateOptions
  /** 并行生成张数 1-4 */
  parallelCount?: number
}

/** 生图响应体 */
export interface StudioGenerateResponse {
  success: boolean
  /** 生成图片 URL（/m/{publicId}） */
  images: string[]
  /** 部分失败时的警告 */
  warning?: string
}

/** 反推提示词模式 */
export type StudioReversePromptMode = 'style-extract' | 'replicate'

/** 提示词优化模式 */
export type StudioPromptOptimizeMode = 'text-to-image' | 'image-to-image' | 'gif'
