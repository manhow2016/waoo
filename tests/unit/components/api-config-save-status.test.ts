import { createElement, type ComponentProps, type ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'

import commonMessages from '../../../messages/zh/common.json'
import { ApiConfigSaveStatus } from '@/app/[locale]/profile/components/api-config-tab/ApiConfigSaveStatus'

const labels = {
  savingLabel: '保存中...',
  savedLabel: '已保存',
  saveFailedLabel: '保存失败',
}

/** 组件的「保存中」分支会渲染 TaskStatusInline，它依赖 next-intl 上下文 */
const render = (saveStatus: 'idle' | 'saving' | 'saved' | 'error') => {
  const node: ReactElement = createElement(ApiConfigSaveStatus, {
    saveStatus,
    savingState: null,
    ...labels,
  })
  const props: ComponentProps<typeof NextIntlClientProvider> = {
    locale: 'zh',
    messages: { common: commonMessages } as unknown as AbstractIntlMessages,
    timeZone: 'Asia/Shanghai',
    children: node,
  }
  return renderToStaticMarkup(createElement(NextIntlClientProvider, props))
}

/**
 * 设置中心的模型配置是自动保存、没有「保存」按钮，
 * 因此状态反馈是用户唯一能判断配置是否真正写库的途径。
 *
 * 这里锁的关键一条是：保存失败必须给出可见提示，
 * 否则用户填完 API Key 后写库失败会完全静默，误以为已配置成功。
 */
describe('模型配置 / 保存状态反馈', () => {
  it('保存失败 -> 渲染危险态提示', () => {
    const html = render('error')
    expect(html).toContain(labels.saveFailedLabel)
    expect(html).toContain('glass-chip-danger')
  })

  it('已保存 -> 渲染成功态提示', () => {
    const html = render('saved')
    expect(html).toContain(labels.savedLabel)
    expect(html).toContain('glass-chip-success')
  })

  it('保存中 -> 渲染进行态提示', () => {
    const html = render('saving')
    expect(html).toContain(labels.savingLabel)
    expect(html).toContain('glass-chip-info')
  })

  it('空闲 -> 不渲染任何状态气泡，避免常驻占位', () => {
    const html = render('idle')
    expect(html).not.toContain(labels.savingLabel)
    expect(html).not.toContain(labels.savedLabel)
    expect(html).not.toContain(labels.saveFailedLabel)
    expect(html).not.toContain('glass-chip')
  })
})
