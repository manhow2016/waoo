/**
 * 画布右键菜单
 *
 * 支持画布空白处、连线、节点右键操作，以及连线拖拽到空白处松开后的创建菜单。
 */

'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AppIcon } from '@/components/ui/icons'
import type { CanvasNodeType } from './canvas-store'

export type ContextMenuState =
  | { type: 'canvas'; x: number; y: number; worldX: number; worldY: number }
  | { type: 'connection'; x: number; y: number; connectionId: string }
  | { type: 'connection-create'; x: number; y: number; worldX: number; worldY: number; sourceNodeId: string; handleType: 'source' | 'target' }
  | { type: 'node'; x: number; y: number; nodeId: string }

export interface ContextMenuActions {
  onAddNodeAt?: (type: CanvasNodeType, worldX: number, worldY: number) => void
  onDeleteConnection?: (connectionId: string) => void
  onConnectionCreate?: (type: CanvasNodeType, worldX: number, worldY: number, sourceNodeId: string, handleType: 'source' | 'target') => void
}

export function CanvasContextMenu(props: {
  state: ContextMenuState | null
  onClose: () => void
  actions: ContextMenuActions
}) {
  useEffect(() => {
    if (!props.state) return
    const handleClose = () => props.onClose()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') props.onClose()
    }
    window.addEventListener('pointerdown', handleClose)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('pointerdown', handleClose)
      window.removeEventListener('keydown', handleKey)
    }
  }, [props.state, props.onClose])

  if (!props.state) return null

  const items: Array<{ label: string; icon: string; onClick: () => void; danger?: boolean }> = []

  if (props.state.type === 'connection-create') {
    const { worldX, worldY, sourceNodeId, handleType } = props.state
    items.push({ label: '图片', icon: 'image', onClick: () => props.actions.onConnectionCreate?.('image', worldX, worldY, sourceNodeId, handleType) })
    items.push({ label: '文本', icon: 'fileText', onClick: () => props.actions.onConnectionCreate?.('text', worldX, worldY, sourceNodeId, handleType) })
    items.push({ label: '注释', icon: 'edit', onClick: () => props.actions.onConnectionCreate?.('textAnnotation', worldX, worldY, sourceNodeId, handleType) })
    items.push({ label: '编排', icon: 'sparkles', onClick: () => props.actions.onConnectionCreate?.('config', worldX, worldY, sourceNodeId, handleType) })
  } else if (props.state.type === 'canvas') {
    const { worldX, worldY } = props.state
    items.push({ label: '添加图片节点', icon: 'image', onClick: () => props.actions.onAddNodeAt?.('image', worldX, worldY) })
    items.push({ label: '添加文本节点', icon: 'fileText', onClick: () => props.actions.onAddNodeAt?.('text', worldX, worldY) })
    items.push({ label: '添加注释', icon: 'edit', onClick: () => props.actions.onAddNodeAt?.('textAnnotation', worldX, worldY) })
    items.push({ label: '添加编排节点', icon: 'sparkles', onClick: () => props.actions.onAddNodeAt?.('config', worldX, worldY) })
  } else if (props.state.type === 'connection') {
    const { connectionId } = props.state
    items.push({ label: '删除连线', icon: 'trash', onClick: () => props.actions.onDeleteConnection?.(connectionId), danger: true })
  }

  return createPortal(
    <div
      data-canvas-no-zoom
      className="fixed z-[130] min-w-40 overflow-hidden rounded-xl border border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-surface-strong)] p-1 text-[var(--glass-text-primary)] shadow-xl"
      style={{ left: props.state.x, top: props.state.y }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-[var(--glass-bg-muted)] ${item.danger ? 'text-[var(--glass-tone-danger-fg)] hover:bg-[var(--glass-tone-danger-fg)]/10' : 'text-[var(--glass-text-primary)]'}`}
          onClick={() => {
            item.onClick()
            props.onClose()
          }}
        >
          <AppIcon name={item.icon as never} className="w-4 h-4" />
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  )
}
