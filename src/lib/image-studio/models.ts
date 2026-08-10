/**
 * image-studio 前端模型配置适配层
 *
 * 统一采用 waoowaoo 的模型配置：通过 /api/user/models 获取用户启用的
 * 图像模型与 LLM 模型，能力选项来自内置能力目录（capabilities）。
 * 不再使用 nova-image-studio 的 localStorage 模型注册表。
 */

import { useUserModels, type UserModelOption } from '@/lib/query/hooks/useUserModels'

/** 图像模型展示选项 */
export interface StudioImageModelOption {
  /** 复合键：provider::modelId */
  value: string
  label: string
  provider?: string
  providerName?: string
  /** 能力目录中的分辨率档位，如 ['1K','2K','4K'] */
  resolutionOptions?: string[]
}

/** LLM 模型展示选项 */
export interface StudioLlmModelOption {
  value: string
  label: string
  provider?: string
  providerName?: string
}

function normalizeResolutionOptions(option: UserModelOption): string[] {
  const options = option.capabilities?.image?.resolutionOptions
  if (Array.isArray(options) && options.length > 0) {
    return options.map(String)
  }
  return []
}

export function useStudioModels() {  const query = useUserModels()

  const imageModels: StudioImageModelOption[] = (query.data?.image || []).map((option) => {
    const resolutionOptions = normalizeResolutionOptions(option)
    return {
      value: option.value,
      label: option.label,
      provider: option.provider,
      providerName: option.providerName,
      resolutionOptions,
    }
  })

  const llmModels: StudioLlmModelOption[] = (query.data?.llm || []).map((option) => ({
    value: option.value,
    label: option.label,
    provider: option.provider,
    providerName: option.providerName,
  }))

  return {
    ...query,
    imageModels,
    llmModels,
  }
}

/** 图像模型可选输出尺寸档位（固定三档，过滤 0.5K/512 等档位） */
const STUDIO_OUTPUT_SIZES: string[] = ['1K', '2K', '4K']

/** 从图像模型能力推导输出尺寸选项（固定 1K/2K/4K 三档） */
export function getStudioOutputSizeOptions(model?: StudioImageModelOption): string[] {
  if (!model) return [...STUDIO_OUTPUT_SIZES]
  const options = (model.resolutionOptions || []).filter((size) => STUDIO_OUTPUT_SIZES.includes(size))
  return options.length > 0 ? options : [...STUDIO_OUTPUT_SIZES]
}

/** 支持的宽高比选项（与能力目录解耦的通用集合） */
export const STUDIO_ASPECT_RATIOS: { value: string; label: string }[] = [
  { value: '1:1', label: '1:1 正方形' },
  { value: '16:9', label: '16:9 宽屏' },
  { value: '9:16', label: '9:16 竖屏' },
  { value: '3:2', label: '3:2 横向' },
  { value: '2:3', label: '2:3 竖向' },
  { value: '4:3', label: '4:3 横向' },
  { value: '3:4', label: '3:4 竖向' },
  { value: '21:9', label: '21:9 超宽屏' },
]

/** 找到第一个支持分辨率档位的模型（用于默认选择） */
export function findStudioImageModelWithSize(
  models: StudioImageModelOption[],
  size: string,
): StudioImageModelOption | undefined {
  return models.find((model) => model.resolutionOptions?.includes(size)) || models[0]
}
