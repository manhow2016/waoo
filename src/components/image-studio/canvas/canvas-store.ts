/**
 * 无限画布状态存储（zustand + IndexedDB 持久化）
 *
 * 移植自 nova-image-studio 的 use-canvas-store，适配 waoowaoo 模型配置。
 * 使用 localforage（IndexedDB）持久化，避免图片 data URL 超出 localStorage 容量限制。
 */

'use client'

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import localforage from 'localforage'

const canvasStorage = localforage.createInstance({
  name: 'waoowaoo-image-studio',
  storeName: 'canvas-projects',
})

export type CanvasNodeType = 'image' | 'text' | 'config' | 'textAnnotation'

export interface CanvasNode {
  id: string
  type: CanvasNodeType
  x: number
  y: number
  width: number
  height: number
  /** 图片节点：data URL 或 /m/ URL */
  content?: string
  /** 文本节点内容 */
  text?: string
  /** 文本节点：可选的生成提示词 */
  prompt?: string
  /** 配置节点：生成配置 */
  genConfig?: {
    model: string
    outputSize: string
    aspectRatio: string
    temperature: number
    count: number
  }
  /** 配置节点：合成提示词 */
  composerContent?: string
  /** 注释节点颜色 */
  backgroundColor?: string
  color?: string
}

export interface CanvasConnection {
  id: string
  fromNodeId: string
  toNodeId: string
}

export interface CanvasProject {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  nodes: CanvasNode[]
  connections: CanvasConnection[]
}

export interface CanvasStore {
  projects: CanvasProject[]
  activeProjectId: string | null
  createProject: (name: string) => string
  renameProject: (projectId: string, name: string) => void
  deleteProject: (projectId: string) => void
  setActiveProject: (projectId: string | null) => void
  updateProject: (projectId: string, updater: (project: CanvasProject) => CanvasProject) => void
  importProject: (project: CanvasProject) => void
}

function nowIso(): string {
  return new Date().toISOString()
}

export function generateNodeId(): string {
  return `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function generateConnectionId(from: string, to: string): string {
  return `conn_${from}_${to}`
}

export function createNode(type: CanvasNodeType, x: number, y: number): CanvasNode {
  const base = {
    id: generateNodeId(),
    type,
    x,
    y,
    width: 220,
    height: type === 'image' ? 180 : type === 'config' ? 260 : 140,
  }
  if (type === 'text') {
    return { ...base, text: '', prompt: '' }
  }
  if (type === 'config') {
    return {
      ...base,
      composerContent: '',
      genConfig: {
        model: '',
        outputSize: '1K',
        aspectRatio: '1:1',
        temperature: 1,
        count: 1,
      },
    }
  }
  if (type === 'textAnnotation') {
    return { ...base, backgroundColor: 'rgba(255, 214, 10, 0.18)', text: '注释' }
  }
  return { ...base }
}

export function connectNodes(
  nodes: CanvasNode[],
  connections: CanvasConnection[],
  fromNodeId: string,
  toNodeId: string,
): { nodes: CanvasNode[]; connections: CanvasConnection[] } {
  if (fromNodeId === toNodeId) return { nodes, connections }
  const from = nodes.find((node) => node.id === fromNodeId)
  const to = nodes.find((node) => node.id === toNodeId)
  if (!from || !to) return { nodes, connections }

  // 已有相同连线则删除（toggle）
  const existing = connections.find(
    (connection) => connection.fromNodeId === fromNodeId && connection.toNodeId === toNodeId,
  )
  if (existing) {
    return { nodes, connections: connections.filter((connection) => connection.id !== existing.id) }
  }

  const connection: CanvasConnection = {
    id: generateConnectionId(fromNodeId, toNodeId),
    fromNodeId,
    toNodeId,
  }
  return { nodes, connections: [...connections, connection] }
}

export function deleteNode(
  nodes: CanvasNode[],
  connections: CanvasConnection[],
  nodeId: string,
): { nodes: CanvasNode[]; connections: CanvasConnection[] } {
  return {
    nodes: nodes.filter((node) => node.id !== nodeId),
    connections: connections.filter(
      (connection) => connection.fromNodeId !== nodeId && connection.toNodeId !== nodeId,
    ),
  }
}

/**
 * 收集配置节点上游的资源（文本 + 图片），按连线方向 BFS。
 */
export function collectUpstreamResources(
  nodes: CanvasNode[],
  connections: CanvasConnection[],
  configNodeId: string,
): { texts: Array<{ node: CanvasNode; index: number }>; images: Array<{ node: CanvasNode; index: number }> } {
  const texts: Array<{ node: CanvasNode; index: number }> = []
  const images: Array<{ node: CanvasNode; index: number }> = []
  const visited = new Set<string>()
  const queue: string[] = [configNodeId]
  let textIndex = 0
  let imageIndex = 0

  while (queue.length > 0) {
    const currentId = queue.shift()!
    if (visited.has(currentId)) continue
    visited.add(currentId)

    const incoming = connections.filter((connection) => connection.toNodeId === currentId)
    for (const connection of incoming) {
      const sourceNode = nodes.find((node) => node.id === connection.fromNodeId)
      if (!sourceNode || visited.has(sourceNode.id)) continue

      if (sourceNode.type === 'text') {
        textIndex += 1
        texts.push({ node: sourceNode, index: textIndex })
      } else if (sourceNode.type === 'image' && sourceNode.content) {
        imageIndex += 1
        images.push({ node: sourceNode, index: imageIndex })
      }
      queue.push(sourceNode.id)
    }
  }

  return { texts, images }
}

/**
 * 根据上游资源渲染配置节点的最终提示词：
 * - 文本节点按引用顺序编号为 【文本N】
 * - 图片节点编号为 图N 并作为参考图
 * - 支持 @[node:<id>] 内联引用 token
 */
export function composeConfigPrompt(
  composerContent: string,
  upstream: { texts: Array<{ node: CanvasNode; index: number }>; images: Array<{ node: CanvasNode; index: number }> },
): { prompt: string; referenceImages: string[] } {
  const referenceImages = upstream.images
    .map((item) => item.node.content || '')
    .filter((content) => content.length > 0)

  const textBlocks = upstream.texts
    .map((item) => `【文本${item.index}】\n${item.node.text || ''}`)
    .join('\n\n')

  const parts: string[] = []
  if (upstream.images.length > 0) {
    parts.push(`参考图（按顺序）：${upstream.images.map((item) => `图${item.index}`).join('、')}`)
  }
  if (textBlocks) {
    parts.push(textBlocks)
  }

  // 解析 @[node:<id>] 内联引用
  let prompt = composerContent || ''
  const tokenPattern = /@\[node:([^\]]+)\]/g
  prompt = prompt.replace(tokenPattern, (match, nodeId: string) => {
    const textItem = upstream.texts.find((item) => item.node.id === nodeId)
    if (textItem) return `【文本${textItem.index}】`
    const imageItem = upstream.images.find((item) => item.node.id === nodeId)
    if (imageItem) return `参考图${imageItem.index}`
    return ''
  })

  const finalPrompt = [parts.join('\n\n'), prompt].filter(Boolean).join('\n\n')
  return { prompt: finalPrompt.trim(), referenceImages }
}

export const useCanvasStore = create<CanvasStore>()(
  persist(
    (set) => ({
      projects: [],
      activeProjectId: null,

      createProject: (name) => {
        const id = `project_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
        const project: CanvasProject = {
          id,
          name: name || '未命名画布',
          createdAt: nowIso(),
          updatedAt: nowIso(),
          nodes: [],
          connections: [],
        }
        set((state) => ({
          projects: [project, ...state.projects],
          activeProjectId: id,
        }))
        return id
      },

      renameProject: (projectId, name) => {
        set((state) => ({
          projects: state.projects.map((project) =>
            project.id === projectId ? { ...project, name, updatedAt: nowIso() } : project,
          ),
        }))
      },

      deleteProject: (projectId) => {
        set((state) => ({
          projects: state.projects.filter((project) => project.id !== projectId),
          activeProjectId: state.activeProjectId === projectId ? null : state.activeProjectId,
        }))
      },

      setActiveProject: (projectId) => {
        set({ activeProjectId: projectId })
      },

      updateProject: (projectId, updater) => {
        set((state) => ({
          projects: state.projects.map((project) =>
            project.id === projectId ? { ...updater(project), updatedAt: nowIso() } : project,
          ),
        }))
      },

      importProject: (project) => {
        set((state) => ({
          projects: [{ ...project, updatedAt: nowIso() }, ...state.projects],
          activeProjectId: project.id,
        }))
      },
    }),
    {
      name: 'waoowaoo-image-studio-canvas-store',
      storage: createJSONStorage(() => canvasStorage),
    },
  ),
)
