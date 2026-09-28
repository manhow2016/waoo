import { describe, expect, it } from 'vitest'
import {
  PRESET_MODELS,
  PRESET_PROVIDERS,
  getProviderDisplayName,
} from '@/app/[locale]/profile/components/api-config/types'
import { BAILIAN_CATALOG } from '@/lib/providers/bailian/catalog'

/**
 * 阿里云百炼预设支持的一致性保护。
 *
 * 背景：百炼是「官方直连」provider，运行时 completeBailianLlm / generateBailianImage /
 * generateBailianVideo / synthesizeWithBailianTTS 都会先调用 assertOfficialModelRegistered，
 * 模型不在 catalog 白名单内会直接抛 MODEL_NOT_REGISTERED。
 * 因此 PRESET_MODELS 里给用户启用的百炼模型必须与 catalog 严格一致。
 */
describe('bailian 预设厂商与模型一致性', () => {
  it('PRESET_PROVIDERS 暴露 bailian 厂商入口', () => {
    const provider = PRESET_PROVIDERS.find((entry) => entry.id === 'bailian')
    expect(provider).toBeDefined()
    expect(provider?.baseUrl).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1')
    // 百炼是官方直连，运行时由 OFFICIAL_ONLY_PROVIDER_KEYS 强制 official 路由
    expect(provider?.gatewayRoute).toBe('official')
  })

  it('中文环境下显示名为「阿里百炼」', () => {
    expect(getProviderDisplayName('bailian', 'zh')).toBe('阿里百炼')
  })

  it('PRESET_MODELS 中每个百炼模型都在 catalog 白名单内（否则运行时报 MODEL_NOT_REGISTERED）', () => {
    const presetModels = PRESET_MODELS.filter((entry) => entry.provider === 'bailian')
    expect(presetModels.length).toBeGreaterThan(0)

    const unregistered = presetModels
      .filter((entry) => !BAILIAN_CATALOG[entry.type as keyof typeof BAILIAN_CATALOG]
        ?.includes(entry.modelId))
      .map((entry) => `${entry.type}:${entry.modelId}`)

    expect(unregistered).toEqual([])
  })

  it('文本预设为 deepseek-v4.1-flash，音频预设含声音设计模型 qwen-voice-design', () => {
    const bailianLlm = PRESET_MODELS
      .filter((entry) => entry.provider === 'bailian' && entry.type === 'llm')
      .map((entry) => entry.modelId)
    expect(bailianLlm).toEqual(['deepseek-v4.1-flash'])

    const bailianAudio = PRESET_MODELS
      .filter((entry) => entry.provider === 'bailian' && entry.type === 'audio')
      .map((entry) => entry.modelId)
    expect(bailianAudio).toContain('qwen-voice-design')
    expect(bailianAudio).toContain('qwen3-tts-vd-2026-01-26')
  })

  it('图像预设与 catalog image 白名单非空且一一对应', () => {
    const presetImages = PRESET_MODELS
      .filter((entry) => entry.provider === 'bailian' && entry.type === 'image')
      .map((entry) => entry.modelId)

    expect(presetImages.length).toBeGreaterThan(0)
    expect([...presetImages].sort()).toEqual([...BAILIAN_CATALOG.image].sort())
  })

  it('catalog 中每个已注册模型都有对应预设（保证用户可一键启用）', () => {
    const missing = Object.entries(BAILIAN_CATALOG)
      .flatMap(([modality, modelIds]) => modelIds.map((modelId) => ({ modality, modelId })))
      .filter(({ modality, modelId }) => !PRESET_MODELS.some(
        (entry) => entry.provider === 'bailian'
          && entry.type === modality
          && entry.modelId === modelId,
      ))
      .map(({ modality, modelId }) => `${modality}:${modelId}`)

    expect(missing).toEqual([])
  })
})
