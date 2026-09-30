import { createElement, type ComponentProps, type ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'

import apiConfigMessages from '../../../messages/zh/apiConfig.json'
import providerSectionMessages from '../../../messages/zh/providerSection.json'
import commonMessages from '../../../messages/zh/common.json'

// 只替换应用自己的导航封装，避免连带加载 next-intl 的 createNavigation
vi.mock('@/i18n/navigation', () => ({
  Link: 'a',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/zh/profile',
  redirect: vi.fn(),
  getPathname: () => '/',
}))

/**
 * 只替换数据来源 hook，避免渲染测试触发真实网络请求。
 * 其余导出（ProviderCard 等）保持真实，确保测的是真实组件树。
 */
vi.mock('@/app/[locale]/profile/components/api-config', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    useProviders: () => ({
      providers: [],
      models: [],
      defaultModels: {},
      workflowConcurrency: { analysis: 1, image: 1, video: 1 },
      capabilityDefaults: {},
      loading: false,
      saveStatus: 'idle',
      flushConfig: async () => undefined,
      updateProviderHidden: () => undefined,
      updateProviderApiKey: () => undefined,
      updateProviderBaseUrl: () => undefined,
      reorderProviders: () => undefined,
      addProvider: () => undefined,
      deleteProvider: () => undefined,
      updateProviderInfo: () => undefined,
      toggleModel: () => undefined,
      updateModel: () => undefined,
      addModel: () => undefined,
      deleteModel: () => undefined,
      updateDefaultModel: () => undefined,
      batchUpdateDefaultModels: () => undefined,
      updateWorkflowConcurrency: () => undefined,
      updateCapabilityDefault: () => undefined,
      getModelsByType: () => [],
    }),
  }
})

import { ApiConfigTabContainer } from '@/app/[locale]/profile/components/api-config-tab/ApiConfigTabContainer'

const renderWithIntl = (node: ReactElement) => {
  const props: ComponentProps<typeof NextIntlClientProvider> = {
    locale: 'zh',
    messages: {
      apiConfig: apiConfigMessages,
      providerSection: providerSectionMessages,
      common: commonMessages,
    } as unknown as AbstractIntlMessages,
    timeZone: 'Asia/Shanghai',
    children: node,
  }
  return renderToStaticMarkup(createElement(NextIntlClientProvider, props))
}

/**
 * 设置中心的模型配置以「分页卡」呈现：模型服务商与默认模型各占一页。
 *
 * 契约：
 * 1. 分页顺序为「模型服务商」在前、「默认模型」在后；
 * 2. 首屏只渲染当前分页，另一分页的内容不得同时出现在 DOM 中，
 *    否则会退回成需要长时间滚动的单页布局。
 */
describe('模型配置 / 分页卡', () => {
  it('分页顺序为服务商在前，且默认只展示「模型服务商」分页', () => {
    const html = renderWithIntl(createElement(ApiConfigTabContainer))

    // 两个分页入口都存在，且服务商排在默认模型之前
    const providersIndex = html.indexOf(apiConfigMessages.page.providers)
    const modelsIndex = html.indexOf(apiConfigMessages.page.defaultModels)
    expect(providersIndex).toBeGreaterThan(-1)
    expect(modelsIndex).toBeGreaterThan(-1)
    expect(providersIndex).toBeLessThan(modelsIndex)

    // 默认分页（模型服务商）内容已渲染
    expect(html).toContain(apiConfigMessages.providerPool)

    // 另一分页（默认模型）内容未渲染：两个分页不会同时铺在一个长页面里
    expect(html).not.toContain(apiConfigMessages.defaultModels)
  })
})
