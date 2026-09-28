/**
 * API 配置类型定义和预设常量
 */
import {
  composeModelKey,
  parseModelKeyStrict,
  type ModelCapabilities,
  type UnifiedModelType,
} from '@/lib/model-config-contract';
import type {
  OpenAICompatMediaTemplate,
  OpenAICompatMediaTemplateSource,
} from '@/lib/openai-compat-media-template';

// 统一提供商接口
export interface Provider {
  id: string;
  name: string;
  baseUrl?: string;
  apiKey?: string;
  hasApiKey?: boolean;
  hidden?: boolean;
  apiMode?: 'gemini-sdk' | 'openai-official';
  gatewayRoute?: 'official' | 'openai-compat';
}

export interface LlmCustomPricing {
  inputPerMillion?: number;
  outputPerMillion?: number;
}

export interface MediaCustomPricing {
  basePrice?: number;
  optionPrices?: Record<string, Record<string, number>>;
}

// 用户自定义定价 V2（能力参数可定价）
export interface CustomModelPricing {
  llm?: LlmCustomPricing;
  image?: MediaCustomPricing;
  video?: MediaCustomPricing;
}

// 模型接口
export interface CustomModel {
  modelId: string; // 唯一标识符（如 anthropic/claude-sonnet-4.5）
  modelKey: string; // 唯一主键（provider::modelId）
  name: string; // 显示名称
  type: UnifiedModelType;
  provider: string;
  llmProtocol?: 'responses' | 'chat-completions';
  llmProtocolCheckedAt?: string;
  compatMediaTemplate?: OpenAICompatMediaTemplate;
  compatMediaTemplateCheckedAt?: string;
  compatMediaTemplateSource?: OpenAICompatMediaTemplateSource;
  price: number;
  priceMin?: number;
  priceMax?: number;
  priceLabel?: string;
  priceInput?: number;
  priceOutput?: number;
  enabled: boolean;
  capabilities?: ModelCapabilities;
  customPricing?: CustomModelPricing;
}

export interface PricingDisplayItem {
  min: number;
  max: number;
  label: string;
  input?: number;
  output?: number;
}

export type PricingDisplayMap = Record<string, PricingDisplayItem>;

// API 配置响应
export interface ApiConfig {
  models: CustomModel[];
  providers: Provider[];
  workflowConcurrency?: {
    analysis: number;
    image: number;
    video: number;
  };
  pricingDisplay?: PricingDisplayMap;
}

type PresetModel = Omit<CustomModel, 'enabled' | 'modelKey' | 'price'>;

// 预设模型
export const PRESET_MODELS: PresetModel[] = [
  // 文本模型
  {
    modelId: 'deepseek-v4-flash',
    name: 'deepseek-v4-flash',
    type: 'llm',
    provider: 'token61',
  },
  {
    modelId: 'qwen3.6-flash',
    name: 'qwen3.6-flash',
    type: 'llm',
    provider: 'token61',
  },

  //{ modelId: 'google/gemini-3-pro-preview', name: 'Gemini 3 Pro', type: 'llm', provider: 'token61' },
  //{ modelId: 'google/gemini-3-flash-preview', name: 'Gemini 3 Flash', type: 'llm', provider: 'token61' },
  // { modelId: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5', type: 'llm', provider: 'token61' },
  //  { modelId: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', type: 'llm', provider: 'token61' },
  // { modelId: 'openai/gpt-5.4', name: 'GPT-5.4', type: 'llm', provider: 'token61' },
  // { modelId: 'google/gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite', type: 'llm', provider: 'token61' },

  // 图像模型
  {
    modelId: 'qwen-image-2.0',
    name: 'qwen-image-2.0',
    type: 'image',
    provider: 'token61',
  },
  {
    modelId: 'qwen-image-2.0-pro',
    name: 'qwen-image-2.0-pro',
    type: 'image',
    provider: 'token61',
  },
  {
    modelId: 'wan2.7-image',
    name: 'wan2.7-image',
    type: 'image',
    provider: 'token61',
  },
  {
    modelId: 'wan2.7-image-pro',
    name: 'wan2.7-image-pro',
    type: 'image',
    provider: 'token61',
  },
  // 视频模型
  {
    modelId: 'wan2.7-t2v-2026-06-12',
    name: 'wan2.7-t2v-2026-06-12',
    type: 'video',
    provider: 'token61',
  },
  {
    modelId: 'happyhorse-1.1-t2v',
    name: 'happyhorse-1.1-t2v',
    type: 'video',
    provider: 'token61',
  },

  // 音频模型

  {
    modelId: 'qwen3-tts-vd-2026-01-26',
    name: 'qwen3-tts-vd-2026-01-26',
    type: 'audio',
    provider: 'token61',
  },
  {
    modelId: 'qwen-voice-design',
    name: 'qwen-voice-design',
    type: 'audio',
    provider: 'token61',
  },
  // ===== 阿里云百炼（bailian）预设模型 =====
  // 必须与 src/lib/providers/bailian/catalog.ts 的白名单一致，否则运行时抛 MODEL_NOT_REGISTERED
  {
    modelId: 'deepseek-v4.1-flash',
    name: 'deepseek-v4.1-flash',
    type: 'llm',
    provider: 'bailian',
  },

  {
    modelId: 'wan2.7-i2v',
    name: 'wan2.7-i2v',
    type: 'video',
    provider: 'bailian',
  },
  {
    modelId: 'wan2.6-i2v',
    name: 'wan2.6-i2v',
    type: 'video',
    provider: 'bailian',
  },
  {
    modelId: 'wan2.6-i2v-flash',
    name: 'wan2.6-i2v-flash',
    type: 'video',
    provider: 'bailian',
  },
  {
    modelId: 'wan2.5-i2v-preview',
    name: 'wan2.5-i2v-preview',
    type: 'video',
    provider: 'bailian',
  },
  {
    modelId: 'wan2.2-i2v-plus',
    name: 'wan2.2-i2v-plus',
    type: 'video',
    provider: 'bailian',
  },
  {
    modelId: 'wan2.2-kf2v-flash',
    name: 'wan2.2-kf2v-flash',
    type: 'video',
    provider: 'bailian',
  },
  {
    modelId: 'wanx2.1-kf2v-plus',
    name: 'wanx2.1-kf2v-plus',
    type: 'video',
    provider: 'bailian',
  },

  {
    modelId: 'qwen-image-2.0-pro',
    name: 'qwen-image-2.0-pro',
    type: 'image',
    provider: 'bailian',
  },
  {
    modelId: 'qwen-image-2.0',
    name: 'qwen-image-2.0',
    type: 'image',
    provider: 'bailian',
  },
  {
    modelId: 'wan2.7-image-pro',
    name: 'wan2.7-image-pro',
    type: 'image',
    provider: 'bailian',
  },
  {
    modelId: 'wan2.7-image',
    name: 'wan2.7-image',
    type: 'image',
    provider: 'bailian',
  },

  {
    modelId: 'qwen3-tts-vd-2026-01-26',
    name: 'qwen3-tts-vd-2026-01-26',
    type: 'audio',
    provider: 'bailian',
  },
  {
    // 声音设计模型：经 bailian/voice-design.ts 走 DashScope customization 接口
    modelId: 'qwen-voice-design',
    name: 'qwen-voice-design',
    type: 'audio',
    provider: 'bailian',
  },

  // 口型同步模型
  /*
  {
    modelId: 'fal-ai/kling-video/lipsync/audio-to-video',
    name: 'Kling Lip Sync',
    type: 'lipsync',
    provider: 'token61',
  },
  {
    modelId: 'vidu-lipsync',
    name: 'Vidu Lip Sync',
    type: 'lipsync',
    provider: 'token61',
  },
  {
    modelId: 'videoretalk',
    name: 'VideoRetalk Lip Sync',
    type: 'lipsync',
    provider: 'token61',
  },*/
];

const PRESET_COMING_SOON_MODEL_KEYS = new Set<string>([]);

export function isPresetComingSoonModel(
  provider: string,
  modelId: string,
): boolean {
  return PRESET_COMING_SOON_MODEL_KEYS.has(encodeModelKey(provider, modelId));
}

export function isPresetComingSoonModelKey(modelKey: string): boolean {
  return PRESET_COMING_SOON_MODEL_KEYS.has(modelKey);
}

// 预设提供商（API Key 唯一归属于 provider id）
export const PRESET_PROVIDERS: Omit<Provider, 'apiKey' | 'hasApiKey'>[] = [
  {
    id: 'token61',
    name: 'Token六一',
    baseUrl: 'https://token61.com/v1',
    gatewayRoute: 'openai-compat',
  },
  {
    // 阿里云百炼：官方直连模式（运行时由 OFFICIAL_ONLY_PROVIDER_KEYS 强制走 official 路由）
    id: 'bailian',
    name: '阿里百炼',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    gatewayRoute: 'official',
  },
];

const ZH_PROVIDER_NAME_MAP: Record<string, string> = {
  token61: 'Token六一',
  bailian: '阿里百炼',
};

function isZhLocale(locale?: string): boolean {
  return typeof locale === 'string' && locale.toLowerCase().startsWith('zh');
}

export function resolvePresetProviderName(
  providerId: string,
  fallbackName: string,
  locale?: string,
): string {
  if (!isZhLocale(locale)) return fallbackName;
  return ZH_PROVIDER_NAME_MAP[providerId] ?? fallbackName;
}

/**
 * 提取提供商主键（用于多实例场景，如 gemini-compatible:uuid）
 */
export function getProviderKey(providerId?: string): string {
  if (!providerId) return '';
  const colonIndex = providerId.indexOf(':');
  return colonIndex === -1 ? providerId : providerId.slice(0, colonIndex);
}

/**
 * 获取厂商的友好显示名称
 * @param providerId - 厂商ID（如 'ark', 'google'）
 * @returns 友好名称（如 '火山引擎(方舟)', 'Google AI Studio'）
 */
export function getProviderDisplayName(
  providerId?: string,
  locale?: string,
): string {
  if (!providerId) return '';
  const providerKey = getProviderKey(providerId);
  const provider = PRESET_PROVIDERS.find((p) => p.id === providerKey);
  if (!provider) return providerId;
  return resolvePresetProviderName(provider.id, provider.name, locale);
}

/**
 * 编码模型复合 Key（用于区分同名模型）
 * @param provider - 厂商 ID
 * @param modelId - 模型 ID
 * @returns 复合 Key，格式为 `provider::modelId`（使用双冒号避免与 provider ID 中的冒号冲突）
 */
export function encodeModelKey(provider: string, modelId: string): string {
  return composeModelKey(provider, modelId);
}

/**
 * 解析模型复合 Key
 * @param key - 复合 Key（provider::modelId）
 * @returns 解析后的 { provider, modelId }，如果无法解析返回 null
 */
export function parseModelKey(
  key: string | undefined | null,
): { provider: string; modelId: string } | null {
  const parsed = parseModelKeyStrict(key);
  if (!parsed) return null;
  return {
    provider: parsed.provider,
    modelId: parsed.modelId,
  };
}

/**
 * 检查一个复合 Key 是否匹配指定的模型
 * @param key - 复合 Key（provider::modelId）
 * @param provider - 目标厂商 ID
 * @param modelId - 目标模型 ID
 * @returns 是否匹配
 */
export function matchesModelKey(
  key: string | undefined | null,
  provider: string,
  modelId: string,
): boolean {
  const parsed = parseModelKeyStrict(key);
  if (!parsed) return false;
  return parsed.provider === provider && parsed.modelId === modelId;
}

// 教程步骤接口
export interface TutorialStep {
  text: string; // 步骤描述 (i18n key)
  url?: string; // 可选的链接地址
}

// 厂商教程接口
export interface ProviderTutorial {
  providerId: string;
  steps: TutorialStep[];
}

// 厂商开通教程配置
// 注意: text 字段使用 i18n key, 翻译在 apiConfig.tutorials 下
export const PROVIDER_TUTORIALS: ProviderTutorial[] = [
  {
    providerId: 'token61',
    steps: [
      {
        text: 'token61_step1',
        url: 'https://token61.com',
      },
    ],
  },
];

/**
 * 根据厂商ID获取教程配置
 * @param providerId - 厂商ID
 * @returns 教程配置，如果不存在则返回 undefined
 */
export function getProviderTutorial(
  providerId: string,
): ProviderTutorial | undefined {
  const providerKey = getProviderKey(providerId);
  return PROVIDER_TUTORIALS.find((t) => t.providerId === providerKey);
}

/**
 * 获取 Google 官方模型列表的克隆副本，provider 替换为指定 ID。
 * 用于 gemini-compatible 新增时自动预设模型。
 * 排除 batch 模型（Google 特有的异步批量处理）。
 */
export function getGoogleCompatiblePresetModels(
  providerId: string,
): PresetModel[] {
  return PRESET_MODELS.filter(
    (m) => m.provider === 'google' && !m.modelId.endsWith('-batch'),
  ).map((m) => ({ ...m, provider: providerId }));
}
