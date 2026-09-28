import { describe, expect, it } from 'vitest'
import { resolveDashScopeNativeBaseUrl } from '@/lib/providers/bailian/endpoint-base'

/**
 * 回归保护：设置中心给 bailian 配的默认 baseUrl 是 OpenAI 兼容地址
 * （.../compatible-mode/v1），它不能作为 DashScope 原生 API 的根，
 * 否则声音设计 / TTS / 音色删除会拼出不存在的路径而返回 404。
 */
describe('resolveDashScopeNativeBaseUrl', () => {
  it('兼容模式地址归一化为原生 API 根（回归：直接拼接会 404）', () => {
    expect(resolveDashScopeNativeBaseUrl('https://dashscope.aliyuncs.com/compatible-mode/v1'))
      .toBe('https://dashscope.aliyuncs.com/api/v1')
  })

  it('兼容地址带尾斜杠同样归一化', () => {
    expect(resolveDashScopeNativeBaseUrl('https://dashscope.aliyuncs.com/compatible-mode/v1/'))
      .toBe('https://dashscope.aliyuncs.com/api/v1')
  })

  it('已是原生 API 根则保持不变', () => {
    expect(resolveDashScopeNativeBaseUrl('https://dashscope.aliyuncs.com/api/v1'))
      .toBe('https://dashscope.aliyuncs.com/api/v1')
  })

  it('空值回退到官方原生根', () => {
    expect(resolveDashScopeNativeBaseUrl()).toBe('https://dashscope.aliyuncs.com/api/v1')
    expect(resolveDashScopeNativeBaseUrl('')).toBe('https://dashscope.aliyuncs.com/api/v1')
    expect(resolveDashScopeNativeBaseUrl('   ')).toBe('https://dashscope.aliyuncs.com/api/v1')
  })

  it('国际站与业务空间域名保留 host', () => {
    expect(resolveDashScopeNativeBaseUrl('https://dashscope-intl.aliyuncs.com/compatible-mode/v1'))
      .toBe('https://dashscope-intl.aliyuncs.com/api/v1')
    expect(resolveDashScopeNativeBaseUrl('https://ws123.cn-beijing.maas.aliyuncs.com'))
      .toBe('https://ws123.cn-beijing.maas.aliyuncs.com/api/v1')
  })

  it('自建反代根路径会被补上 /api/v1', () => {
    expect(resolveDashScopeNativeBaseUrl('https://proxy.example.com/dashscope'))
      .toBe('https://proxy.example.com/dashscope/api/v1')
  })
})
