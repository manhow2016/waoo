/**
 * 无限画布（Canvas Workspace）
 *
 * 移植自 nova-image-studio 的 CanvasWorkspace + CanvasEditor 核心能力，
 * 通过 zustand 持久化项目，节点连线驱动生成，生成走 /api/image-studio/generate。
 */

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import { AppIcon } from '@/components/ui/icons'
import CanvasConnections from './canvas/CanvasConnections'
import {
  useCanvasStore,
  createNode,
  connectNodes,
  deleteNode,
  collectUpstreamResources,
  composeConfigPrompt,
  type CanvasNode,
  type CanvasConnection,
  type CanvasNodeType,
  type CanvasProject,
} from './canvas/canvas-store'
import { useStudioModels, getStudioOutputSizeOptions } from '@/lib/image-studio/models'
import { studioGenerate } from '@/lib/image-studio/client'
import { prepareImageFile, extractImageFiles } from './image-utils'
import { GlassSlider, StudioSpinner, StudioModal, StudioEmptyState, cx } from './ui'
import { useRouter } from '@/i18n/navigation'

const ZOOM_MIN = 0.25
const ZOOM_MAX = 2

export default function CanvasWorkspace() {
  const { projects, activeProjectId, createProject, deleteProject, setActiveProject, updateProject } = useCanvasStore()
  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) || null,
    [projects, activeProjectId],
  )

  if (activeProject) {
    return (
      <CanvasEditor
        project={activeProject}
        onBack={() => setActiveProject(null)}
        onUpdate={(updater) => updateProject(activeProject.id, updater)}
      />
    )
  }

  return (
    <CanvasProjectList
      projects={projects}
      onCreate={createProject}
      onDelete={deleteProject}
      onOpen={setActiveProject}
    />
  )
}

function CanvasProjectList(props: {
  projects: CanvasProject[]
  onCreate: (name: string) => string
  onDelete: (projectId: string) => void
  onOpen: (projectId: string) => void
}) {
  const t = useTranslations('imageStudio')
  const tc = useTranslations('imageStudio.common')
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<CanvasProject | null>(null)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[var(--glass-text-primary)]">
          {t('canvas.projectList')}
        </h3>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="glass-btn-base glass-btn-primary px-4 py-2 flex items-center gap-2"
        >
          <AppIcon name="plus" className="w-4 h-4" />
          {t('canvas.newProject')}
        </button>
      </div>

      {props.projects.length === 0 ? (
        <StudioEmptyState
          title={t('canvas.emptyProjects')}
          description={t('canvas.emptyProjectsDesc')}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {props.projects.map((project) => {
            const imageNodes = project.nodes.filter((node) => node.type === 'image' && node.content)
            return (
              <div
                key={project.id}
                className="glass-surface rounded-2xl overflow-hidden group cursor-pointer"
                onClick={() => props.onOpen(project.id)}
              >
                <div className="h-36 bg-[var(--glass-bg-muted)] flex items-center justify-center overflow-hidden">
                  {imageNodes[0]?.content ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageNodes[0].content} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <AppIcon name="image" className="w-10 h-10 text-[var(--glass-text-tertiary)]" />
                  )}
                </div>
                <div className="p-4 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-[var(--glass-text-primary)]">{project.name}</h4>
                    <p className="text-[10px] text-[var(--glass-text-tertiary)] mt-1">
                      {project.nodes.length} 节点 · {new Date(project.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleteTarget(project)
                    }}
                    className="glass-btn-base glass-btn-ghost p-1.5 rounded-lg text-[var(--glass-tone-danger-fg)] opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <AppIcon name="trash" className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showCreate && (
        <StudioModal title={t('canvas.newProject')} onClose={() => setShowCreate(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (name.trim()) {
                props.onCreate(name.trim())
                setShowCreate(false)
                setName('')
              }
            }}
          >
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('canvas.projectNamePlaceholder')}
              className="glass-input-base w-full px-3 py-2 mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowCreate(false)} className="glass-btn-base glass-btn-secondary px-4 py-2">
                {tc('cancel')}
              </button>
              <button type="submit" disabled={!name.trim()} className="glass-btn-base glass-btn-primary px-4 py-2 disabled:opacity-50">
                {t('canvas.createProject')}
              </button>
            </div>
          </form>
        </StudioModal>
      )}

      {deleteTarget && (
        <StudioModal title={tc('delete')} onClose={() => setDeleteTarget(null)}>
          <p className="text-sm text-[var(--glass-text-secondary)] mb-4">
            {t('canvas.deleteConfirm', { name: deleteTarget.name })}
          </p>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setDeleteTarget(null)} className="glass-btn-base glass-btn-secondary px-4 py-2">
              {tc('cancel')}
            </button>
            <button
              type="button"
              onClick={() => {
                props.onDelete(deleteTarget.id)
                setDeleteTarget(null)
              }}
              className="glass-btn-base glass-btn-danger px-4 py-2"
            >
              {tc('delete')}
            </button>
          </div>
        </StudioModal>
      )}
    </div>
  )
}

// ===== 画布编辑器 =====

function CanvasEditor(props: {
  project: CanvasProject
  onBack: () => void
  onUpdate: (updater: (project: CanvasProject) => CanvasProject) => void
}) {
  const t = useTranslations('imageStudio')
  const tc = useTranslations('imageStudio.common')
  const { imageModels } = useStudioModels()
  const { data: session } = useSession()
  const router = useRouter()

  const [nodes, setNodes] = useState<CanvasNode[]>(props.project.nodes)
  const [connections, setConnections] = useState(props.project.connections)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 })
  const [interactionMode, setInteractionMode] = useState<'select' | 'pan'>('select')
  const [backgroundMode, setBackgroundMode] = useState<'lines' | 'dots' | 'blank'>(props.project.backgroundMode || 'lines')
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null)
  const [runningNodeId, setRunningNodeId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState(props.project.name)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const canvasRef = useRef<HTMLDivElement>(null)

  // 撤销/重做历史栈
  interface CanvasSnapshot {
    nodes: CanvasNode[]
    connections: CanvasConnection[]
  }
  const historyRef = useRef<CanvasSnapshot[]>([])
  const redoRef = useRef<CanvasSnapshot[]>([])
  const historyLockRef = useRef(false)

  const cloneSnapshot = (): CanvasSnapshot => ({
    nodes: JSON.parse(JSON.stringify(nodes)) as CanvasNode[],
    connections: JSON.parse(JSON.stringify(connections)) as CanvasConnection[],
  })

  /** 记录一次可撤销的变更（在修改前调用） */
  const commitHistory = () => {
    if (historyLockRef.current) return
    historyRef.current.push(cloneSnapshot())
    if (historyRef.current.length > 100) historyRef.current.shift()
    redoRef.current = []
    setCanUndo(true)
    setCanRedo(false)
  }

  const handleUndo = () => {
    const snapshot = historyRef.current.pop()
    if (!snapshot) return
    historyLockRef.current = true
    redoRef.current.push(cloneSnapshot())
    setNodes(snapshot.nodes)
    setConnections(snapshot.connections)
    setSelectedNodeId(null)
    historyLockRef.current = false
    setCanUndo(historyRef.current.length > 0)
    setCanRedo(true)
  }

  const handleRedo = () => {
    const snapshot = redoRef.current.pop()
    if (!snapshot) return
    historyLockRef.current = true
    historyRef.current.push(cloneSnapshot())
    setNodes(snapshot.nodes)
    setConnections(snapshot.connections)
    setSelectedNodeId(null)
    historyLockRef.current = false
    setCanRedo(redoRef.current.length > 0)
    setCanUndo(true)
  }

  // 键盘快捷键：Ctrl+Z / Ctrl+Shift+Z
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.closest('input, textarea, select')) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          handleRedo()
        } else {
          handleUndo()
        }
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        handleRedo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, connections])

  // 同步到 store（防抖保存）
  useEffect(() => {
    setSaveStatus('saving')
    const timer = setTimeout(() => {
      try {
        props.onUpdate((project) => ({ ...project, nodes, connections, backgroundMode }))
        setSaveStatus('saved')
      } catch {
        setSaveStatus('error')
      }
    }, 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, connections, backgroundMode])

  const handleRename = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) props.onUpdate((project) => ({ ...project, name: name.trim() }))
  }

  const addNode = (type: CanvasNodeType) => {
    commitHistory()
    const offset = 30 * (nodes.length % 5)
    const node = createNode(type, 80 + offset, 80 + offset)
    setNodes((prev) => [...prev, node])
    setSelectedNodeId(node.id)
  }

  const handleDropOnCanvas = (e: React.DragEvent) => {
    e.preventDefault()
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const files = extractImageFiles(e.dataTransfer.items)
    if (files.length === 0) return
    commitHistory()
    const worldX = (e.clientX - rect.left - view.x) / view.zoom
    const worldY = (e.clientY - rect.top - view.y) / view.zoom
    void (async () => {
      for (const file of files.slice(0, 4)) {
        try {
          const prepared = await prepareImageFile(file)
          const node = createNode('image', worldX + Math.random() * 40, worldY + Math.random() * 40)
          node.content = prepared.dataUrl
          setNodes((prev) => [...prev, node])
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err))
        }
      }
    })()
  }

  const handleNodePointerDown = (node: CanvasNode, e: React.PointerEvent) => {
    if (e.button === 2) return
    e.preventDefault()
    e.stopPropagation()
    setSelectedNodeId(node.id)
    commitHistory()
    const startPointer = { x: e.clientX, y: e.clientY }
    const startNode = { x: node.x, y: node.y }
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startPointer.x) / view.zoom
      const dy = (ev.clientY - startPointer.y) / view.zoom
      setNodes((prev) =>
        prev.map((n) => (n.id === node.id ? { ...n, x: startNode.x + dx, y: startNode.y + dy } : n)),
      )
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const handleBackgroundPointerDown = (e: React.PointerEvent) => {
    // 仅当点击画布空白区域（非节点、非输入控件）时启动平移
    const target = e.target as HTMLElement
    if (target.closest('[data-node-id]')) return
    if (target.closest('input, textarea, select, button, a')) return
    setSelectedNodeId(null)
    setConnectingFrom(null)
    const start = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }
    const shouldPan = interactionMode === 'pan' || e.button === 1
    const move = (ev: PointerEvent) => {
      if (shouldPan) {
        setView((prev) => ({ ...prev, x: start.vx + (ev.clientX - start.x), y: start.vy + (ev.clientY - start.y) }))
      }
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const handleResetView = () => {
    setView({ x: 0, y: 0, zoom: 1 })
  }

  const handleResizeStart = (nodeId: string, corner: string, e: React.PointerEvent) => {
    const node = nodes.find((n) => n.id === nodeId)
    if (!node) return
    commitHistory()
    const startPointer = { x: e.clientX, y: e.clientY }
    const startNode = { x: node.x, y: node.y, width: node.width, height: node.height }

    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startPointer.x) / view.zoom
      const dy = (ev.clientY - startPointer.y) / view.zoom
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== nodeId) return n
          const next = { ...n }
          if (corner.includes('e')) {
            next.width = Math.max(180, startNode.width + dx)
          }
          if (corner.includes('s')) {
            next.height = Math.max(120, startNode.height + dy)
          }
          if (corner.includes('w')) {
            next.width = Math.max(180, startNode.width - dx)
            next.x = startNode.x + (startNode.width - next.width)
          }
          if (corner.includes('n')) {
            next.height = Math.max(120, startNode.height - dy)
            next.y = startNode.y + (startNode.height - next.height)
          }
          return next
        }),
      )
    }

    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const handleZoom = (factor: number) => {
    setView((prev) => {
      const zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, prev.zoom * factor))
      return { ...prev, zoom }
    })
  }

  // 使用原生 wheel 监听（passive: false）以支持 preventDefault 阻止页面滚动
  useEffect(() => {
    const element = canvasRef.current
    if (!element) return

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      const factor = event.deltaY < 0 ? 1.1 : 0.9
      const mouseX = event.clientX - rect.left
      const mouseY = event.clientY - rect.top
      setView((prev) => {
        const zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, prev.zoom * factor))
        return {
          zoom,
          x: mouseX - ((mouseX - prev.x) / prev.zoom) * zoom,
          y: mouseY - ((mouseY - prev.y) / prev.zoom) * zoom,
        }
      })
    }

    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  const runConfigNode = async (node: CanvasNode) => {
    if (!node.genConfig || runningNodeId) return
    if (!session?.user) {
      router.push({ pathname: '/auth/signin' })
      return
    }
    const config = node.genConfig
    if (!config.model) {
      setError(tc('noModels'))
      return
    }

    const upstream = collectUpstreamResources(nodes, connections, node.id)
    const { prompt, referenceImages } = composeConfigPrompt(node.composerContent || '', upstream)
    if (!prompt) {
      setError('配置节点需要提示词或上游文本节点')
      return
    }

    setRunningNodeId(node.id)
    setError(null)
    try {
      const count = Math.max(1, Math.min(4, config.count || 1))
      const result = await studioGenerate({
        modelKey: config.model,
        prompt,
        referenceImages,
        options: {
          outputSize: config.outputSize as never,
          aspectRatio: config.aspectRatio,
          temperature: config.temperature,
        },
        parallelCount: count,
      })

      // 创建结果图片节点并连线
      const resultNodes: CanvasNode[] = result.images.map((url, index) => {
        const resultNode = createNode('image', node.x + 320 + index * 40, node.y + index * 40)
        resultNode.content = url
        resultNode.width = 220
        resultNode.height = 220
        return resultNode
      })
      setNodes((prev) => {
        const next = [...prev, ...resultNodes]
        const nextConnections = [
          ...connections,
          ...resultNodes.map((resultNode) => ({
            id: `conn_${node.id}_${resultNode.id}`,
            fromNodeId: node.id,
            toNodeId: resultNode.id,
          })),
        ]
        setConnections(nextConnections)
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunningNodeId(null)
    }
  }

  const updateConfigNode = (nodeId: string, patch: Partial<CanvasNode>) => {
    setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, ...patch } : node)))
  }

  const canvasKey = props.project.id
  useEffect(() => {
    setNodes(props.project.nodes)
    setConnections(props.project.connections)
  }, [canvasKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const connectionPaths = connections
    .map((connection) => {
      const from = nodes.find((node) => node.id === connection.fromNodeId)
      const to = nodes.find((node) => node.id === connection.toNodeId)
      if (!from || !to) return null
      const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 }
      const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 }
      const dx = Math.abs(toCenter.x - fromCenter.x)
      const curvature = Math.max(dx * 0.4, 50)
      return {
        key: connection.id,
        d: `M ${fromCenter.x} ${fromCenter.y} C ${fromCenter.x + curvature} ${fromCenter.y}, ${toCenter.x - curvature} ${toCenter.y}, ${toCenter.x} ${toCenter.y}`,
      }
    })
    .filter((path): path is { key: string; d: string } => path !== null)

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* 画布（接近全屏，工具条/头部/缩放均为浮动覆盖层） */}
      <div
        ref={canvasRef}
        onPointerDown={handleBackgroundPointerDown}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDropOnCanvas}
        className="relative h-[calc(100vh-260px)] min-h-[560px] rounded-2xl overflow-hidden border border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-muted)]/20"
        style={{ touchAction: 'none' }}
      >
        {/* 背景（网格/圆点/空白，随缩放同步） */}
        {backgroundMode !== 'blank' && (
          <div
            className="absolute inset-0 pointer-events-none opacity-40"
            style={{
              backgroundImage: backgroundMode === 'dots'
                ? 'radial-gradient(circle, var(--glass-stroke-soft) 1.2px, transparent 1.4px)'
                : 'linear-gradient(var(--glass-stroke-soft) 1px, transparent 1px), linear-gradient(90deg, var(--glass-stroke-soft) 1px, transparent 1px)',
              backgroundSize: `${48 * view.zoom}px ${48 * view.zoom}px`,
              backgroundPosition: `${view.x % (48 * view.zoom)}px ${view.y % (48 * view.zoom)}px`,
            }}
          />
        )}

        {/* 连线 */}
        <CanvasConnections
          paths={connectionPaths}
          zoom={view.zoom}
          offsetX={view.x / view.zoom}
          offsetY={view.y / view.zoom}
        />

        {/* 节点 */}
        <div
          className="absolute"
          style={{
            transform: `scale(${view.zoom})`,
            transformOrigin: '0 0',
            left: view.x,
            top: view.y,
          }}
        >
          {nodes.map((node) => (
            <CanvasNodeView
              key={node.id}
              node={node}
              selected={selectedNodeId === node.id}
              imageModels={imageModels}
              running={runningNodeId === node.id}
              connectingFrom={connectingFrom}
              onPointerDown={(e) => handleNodePointerDown(node, e)}
              onSelect={() => setSelectedNodeId(node.id)}
              onUpdate={(patch) => {
                commitHistory()
                updateConfigNode(node.id, patch)
              }}
              onDelete={() => {
                commitHistory()
                const result = deleteNode(nodes, connections, node.id)
                setNodes(result.nodes)
                setConnections(result.connections)
                setSelectedNodeId(null)
              }}
              onRun={() => void runConfigNode(node)}
              onStartConnect={() => setConnectingFrom(node.id)}
              onEndConnect={(targetId) => {
                if (connectingFrom) {
                  commitHistory()
                  const result = connectNodes(nodes, connections, connectingFrom, targetId)
                  setNodes(result.nodes)
                  setConnections(result.connections)
                }
                setConnectingFrom(null)
              }}
              onUploadImage={async (files) => {
                if (files.length === 0) return
                commitHistory()
                for (const file of files) {
                  const prepared = await prepareImageFile(file)
                  updateConfigNode(node.id, { content: prepared.dataUrl })
                }
              }}
              onResizeStart={handleResizeStart}
            />
          ))}
        </div>

        {/* 空画布提示 */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-sm text-[var(--glass-text-tertiary)]">{t('canvas.canvasEmpty')}</p>
          </div>
        )}

        {/* 左上角：返回 + 标题 + 保存状态 */}
        <div
          data-canvas-no-zoom
          className="absolute top-4 left-4 z-50 flex items-center gap-2"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={props.onBack}
            className="glass-btn-base glass-btn-ghost p-2 rounded-lg"
            title={t('canvas.back')}
          >
            <AppIcon name="chevronLeft" className="w-4 h-4" />
          </button>
          <form onSubmit={handleRename} className="flex items-center">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="glass-input-base px-3 py-1.5 text-sm w-44"
            />
          </form>
          <span className="flex items-center gap-1 text-[11px] text-[var(--glass-text-tertiary)]">
            {saveStatus === 'saving' ? (
              <StudioSpinner className="w-3 h-3" />
            ) : saveStatus === 'error' ? (
              <AppIcon name="alert" className="w-3 h-3 text-[var(--glass-tone-danger-fg)]" />
            ) : (
              <AppIcon name="check" className="w-3 h-3 text-[var(--glass-tone-success-fg)]" />
            )}
            {saveStatus === 'saving'
              ? t('canvas.saveStatus.saving')
              : saveStatus === 'error'
                ? t('canvas.saveStatus.error')
                : t('canvas.saveStatus.saved')}
          </span>
        </div>

        {/* 顶部中央：浮动工具条 */}
        <div
          data-canvas-no-zoom
          className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 rounded-2xl glass-surface px-2 py-1.5 shadow-lg max-w-[calc(100%-2rem)] overflow-x-auto"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* 选择/抓手模式切换 */}
          <div className="inline-flex rounded-xl p-0.5 bg-[var(--glass-bg-muted)] gap-0.5 mr-1">
            <button
              type="button"
              onClick={() => setInteractionMode('select')}
              title={t('canvas.toolbar.selectMode')}
              className={cx(
                'px-2 py-1.5 rounded-lg transition-all',
                interactionMode === 'select'
                  ? 'bg-[var(--glass-bg-surface-strong)] text-[var(--glass-text-primary)] shadow-sm'
                  : 'text-[var(--glass-text-secondary)]',
              )}
            >
              <AppIcon name="copy" className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setInteractionMode('pan')}
              title={t('canvas.toolbar.panMode')}
              className={cx(
                'px-2 py-1.5 rounded-lg transition-all',
                interactionMode === 'pan'
                  ? 'bg-[var(--glass-bg-surface-strong)] text-[var(--glass-text-primary)] shadow-sm'
                  : 'text-[var(--glass-text-secondary)]',
              )}
            >
              <AppIcon name="move" className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mx-1 h-5 w-px bg-[var(--glass-stroke-soft)]" />

          <button
            type="button"
            onClick={() => addNode('image')}
            className="glass-btn-base glass-btn-ghost p-2 rounded-lg"
            title={t('canvas.addImageNode')}
          >
            <AppIcon name="image" className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => addNode('text')}
            className="glass-btn-base glass-btn-ghost p-2 rounded-lg"
            title={t('canvas.addTextNode')}
          >
            <AppIcon name="fileText" className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => addNode('textAnnotation')}
            className="glass-btn-base glass-btn-ghost p-2 rounded-lg"
            title={t('canvas.addAnnotationNode')}
          >
            <AppIcon name="edit" className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => addNode('config')}
            className="glass-btn-base glass-btn-ghost p-2 rounded-lg"
            title={t('canvas.addConfigNode')}
          >
            <AppIcon name="sparkles" className="w-4 h-4" />
          </button>

          <div className="mx-1 h-5 w-px bg-[var(--glass-stroke-soft)]" />

          {/* 撤销/重做 */}
          <button
            type="button"
            onClick={handleUndo}
            disabled={!canUndo}
            className="glass-btn-base glass-btn-ghost p-2 rounded-lg disabled:opacity-40"
            title={t('canvas.toolbar.undo')}
          >
            <AppIcon name="undo" className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={!canRedo}
            className="glass-btn-base glass-btn-ghost p-2 rounded-lg disabled:opacity-40"
            title={t('canvas.toolbar.redo')}
          >
            <AppIcon name="redo" className="w-4 h-4" />
          </button>

          <div className="mx-1 h-5 w-px bg-[var(--glass-stroke-soft)]" />

          {/* 画布背景模式 */}
          <div className="inline-flex rounded-xl p-0.5 bg-[var(--glass-bg-muted)] gap-0.5">
            <button
              type="button"
              onClick={() => setBackgroundMode('lines')}
              title={t('canvas.background.lines')}
              className={cx(
                'px-2 py-1.5 rounded-lg transition-all',
                backgroundMode === 'lines'
                  ? 'bg-[var(--glass-bg-surface-strong)] text-[var(--glass-text-primary)] shadow-sm'
                  : 'text-[var(--glass-text-secondary)]',
              )}
            >
              <AppIcon name="grid" className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setBackgroundMode('dots')}
              title={t('canvas.background.dots')}
              className={cx(
                'px-2 py-1.5 rounded-lg transition-all',
                backgroundMode === 'dots'
                  ? 'bg-[var(--glass-bg-surface-strong)] text-[var(--glass-text-primary)] shadow-sm'
                  : 'text-[var(--glass-text-secondary)]',
              )}
            >
              <AppIcon name="circleDot" className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setBackgroundMode('blank')}
              title={t('canvas.background.blank')}
              className={cx(
                'px-2 py-1.5 rounded-lg transition-all',
                backgroundMode === 'blank'
                  ? 'bg-[var(--glass-bg-surface-strong)] text-[var(--glass-text-primary)] shadow-sm'
                  : 'text-[var(--glass-text-secondary)]',
              )}
            >
              <AppIcon name="minus" className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 右下角：缩放控制 */}
        <div
          data-canvas-no-zoom
          className="absolute bottom-4 right-4 z-50 flex items-center gap-1 rounded-xl glass-surface px-2 py-1.5 shadow-lg"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => handleZoom(0.9)}
            className="glass-btn-base glass-btn-ghost px-2 py-1"
            title={t('canvas.toolbar.zoomOut')}
          >
            <AppIcon name="minus" className="w-3.5 h-3.5" />
          </button>
          <input
            type="range"
            min={ZOOM_MIN * 100}
            max={ZOOM_MAX * 100}
            step={1}
            value={Math.round(view.zoom * 100)}
            onChange={(e) => setView((prev) => ({ ...prev, zoom: Number(e.target.value) / 100 }))}
            className="w-24 accent-[var(--glass-tone-info-fg)]"
            aria-label={t('canvas.toolbar.zoomOut')}
          />
          <span className="w-10 text-right text-xs tabular-nums text-[var(--glass-text-secondary)]">
            {Math.round(view.zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => handleZoom(1.1)}
            className="glass-btn-base glass-btn-ghost px-2 py-1"
            title={t('canvas.toolbar.zoomIn')}
          >
            <AppIcon name="plus" className="w-3.5 h-3.5" />
          </button>
          <div className="mx-1 h-5 w-px bg-[var(--glass-stroke-soft)]" />
          <button
            type="button"
            onClick={handleResetView}
            className="glass-btn-base glass-btn-ghost px-2 py-1"
            title={t('canvas.toolbar.resetView')}
          >
            <AppIcon name="focus" className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 连线提示 */}
        {connectingFrom && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 glass-chip glass-chip-info px-3 py-1.5 text-xs z-50">
            {t('canvas.connectHint')}
          </div>
        )}
      </div>
    </div>
  )
}

// ===== 单个节点 =====

function CanvasNodeView(props: {
  node: CanvasNode
  selected: boolean
  imageModels: ReturnType<typeof useStudioModels>['imageModels']
  running: boolean
  connectingFrom: string | null
  onPointerDown: (e: React.PointerEvent) => void
  onSelect: () => void
  onUpdate: (patch: Partial<CanvasNode>) => void
  onDelete: () => void
  onRun: () => void
  onStartConnect: () => void
  onEndConnect: (targetId: string) => void
  onUploadImage: (files: File[]) => Promise<void>
  onResizeStart: (nodeId: string, corner: string, e: React.PointerEvent) => void
}) {
  const t = useTranslations('imageStudio')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isSelected = props.selected
  const isTextAnnotation = props.node.type === 'textAnnotation'
  const borderColor = isTextAnnotation
    ? 'border-amber-500/40'
    : isSelected
      ? 'border-[var(--glass-tone-info-fg)]'
      : 'border-[var(--glass-stroke-soft)]'
  const backgroundClass = isTextAnnotation ? 'bg-amber-500/10' : 'bg-[var(--glass-bg-surface-strong)]'

  const resizeCorners = [
    { corner: 'nw', className: '-top-1.5 -left-1.5 cursor-nwse-resize' },
    { corner: 'ne', className: '-top-1.5 -right-1.5 cursor-nesw-resize' },
    { corner: 'sw', className: '-bottom-1.5 -left-1.5 cursor-nesw-resize' },
    { corner: 'se', className: '-bottom-1.5 -right-1.5 cursor-nwse-resize' },
  ]

  return (
    <div
      data-node-id={props.node.id}
      className={cx(
        'group absolute rounded-xl border-2 shadow-md transition-[border-color,box-shadow] flex flex-col overflow-hidden',
        borderColor,
        backgroundClass,
        isSelected && 'shadow-[0_0_0_4px_color-mix(in_srgb,var(--glass-tone-info-fg)_18%,transparent)]',
      )}
      style={{
        left: props.node.x,
        top: props.node.y,
        width: props.node.width,
        height: props.node.height,
        zIndex: isSelected ? 10 : 1,
      }}
      onPointerDown={props.onPointerDown}
      onClick={props.onSelect}
    >
      {/* 头部：显示节点标题 */}
      <div className="flex min-h-7 items-center gap-2 px-2.5 py-1 text-[11px] font-medium text-[var(--glass-text-tertiary)] border-b border-[var(--glass-stroke-soft)] cursor-grab select-none">
        <NodeTypeIcon type={props.node.type} />
        <span className="truncate">{props.node.title || nodeTypeLabel(props.node.type)}</span>
      </div>

      {/* 内容区 */}
      <div
        className={cx(
          'relative min-h-0 flex-1 p-2 space-y-2',
          props.node.type === 'config' && 'overflow-y-auto',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {props.node.type === 'text' && (
          <>
            <textarea
              value={props.node.text || ''}
              onChange={(e) => props.onUpdate({ text: e.target.value })}
              placeholder={t('canvas.textNode.contentPlaceholder')}
              rows={4}
              className="glass-textarea-base w-full px-2 py-1.5 text-xs"
            />
            <input
              type="text"
              value={props.node.prompt || ''}
              onChange={(e) => props.onUpdate({ prompt: e.target.value })}
              placeholder={t('canvas.textNode.promptPlaceholder')}
              className="glass-input-base w-full px-2 py-1.5 text-xs"
            />
          </>
        )}

        {props.node.type === 'textAnnotation' && (
          <textarea
            value={props.node.text || ''}
            onChange={(e) => props.onUpdate({ text: e.target.value })}
            rows={4}
            className="w-full h-[calc(100%-24px)] bg-transparent text-sm text-[var(--glass-text-primary)] outline-none resize-none"
          />
        )}

        {props.node.type === 'image' && (
          <>
            {props.node.content ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={props.node.content}
                alt=""
                className="w-full h-[calc(100%-8px)] rounded-lg object-contain"
                onDragStart={(e) => e.preventDefault()}
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 h-[calc(100%-8px)] border border-dashed border-[var(--glass-stroke-soft)] rounded-lg">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) void props.onUploadImage(Array.from(e.target.files))
                    e.target.value = ''
                  }}
                />
                <AppIcon name="upload" className="w-5 h-5 text-[var(--glass-text-tertiary)]" />
                <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs text-[var(--glass-text-tertiary)] flex items-center gap-1.5">
                  {t('canvas.imageNode.uploadImage')}
                </button>
              </div>
            )}
          </>
        )}

        {props.node.type === 'config' && (
          <ConfigNodeBody
            node={props.node}
            imageModels={props.imageModels}
            running={props.running}
            onUpdate={props.onUpdate}
            onRun={props.onRun}
          />
        )}
      </div>

      {/* 顶部操作按钮（选中/悬停显示） */}
      {isSelected && (
        <div className="absolute top-0.5 right-0.5 flex items-center gap-1 z-20 opacity-100" onPointerDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            title={t('canvas.toolbar.connect')}
            onClick={(e) => {
              e.stopPropagation()
              if (props.connectingFrom === props.node.id) return
              if (props.connectingFrom) {
                props.onEndConnect(props.node.id)
              } else {
                props.onStartConnect()
              }
            }}
            className="glass-btn-base glass-btn-ghost p-1 rounded bg-[var(--glass-bg-surface-strong)]/90"
          >
            <AppIcon name="link" className="w-3 h-3" />
          </button>
          <button
            type="button"
            title={t('canvas.toolbar.delete')}
            onClick={(e) => {
              e.stopPropagation()
              props.onDelete()
            }}
            className="glass-btn-base glass-btn-ghost p-1 rounded bg-[var(--glass-bg-surface-strong)]/90 text-[var(--glass-tone-danger-fg)]"
          >
            <AppIcon name="trash" className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* 左右连接手柄 */}
      <button
        type="button"
        aria-label="连接输出"
        className={cx(
          'absolute top-1/2 -right-3.5 grid w-7 h-7 -translate-y-1/2 place-items-center transition-opacity',
          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
        onPointerDown={(e) => {
          e.stopPropagation()
          if (props.connectingFrom === props.node.id) return
          if (props.connectingFrom) {
            props.onEndConnect(props.node.id)
          } else {
            props.onStartConnect()
          }
        }}
      >
        <span className={cx('w-3 h-3 rounded-full border-2 shadow-sm', props.connectingFrom === props.node.id ? 'bg-[var(--glass-tone-info-fg)] border-[var(--glass-bg-surface-strong)]' : 'bg-[var(--glass-tone-info-fg)] border-[var(--glass-bg-surface-strong)]')} />
      </button>
      <button
        type="button"
        aria-label="连接输入"
        className={cx(
          'absolute top-1/2 -left-3.5 grid w-7 h-7 -translate-y-1/2 place-items-center transition-opacity',
          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
        onPointerDown={(e) => {
          e.stopPropagation()
          if (props.connectingFrom) {
            props.onEndConnect(props.node.id)
          }
        }}
      >
        <span className="w-3 h-3 rounded-full border-2 border-[var(--glass-bg-surface-strong)] bg-[var(--glass-text-tertiary)] shadow-sm" />
      </button>

      {/* 缩放手柄（选中显示） */}
      {isSelected && resizeCorners.map(({ corner, className }) => (
        <div
          key={corner}
          className={cx('absolute w-6 h-6 grid place-items-center', className)}
          onPointerDown={(e) => {
            e.stopPropagation()
            e.preventDefault()
            props.onResizeStart(props.node.id, corner, e)
          }}
        >
          <span className="w-3 h-3 rounded-sm border-2 border-[var(--glass-tone-info-fg)] bg-[var(--glass-bg-surface-strong)] shadow-sm" />
        </div>
      ))}
    </div>
  )
}

function nodeTypeLabel(type: CanvasNodeType): string {
  const labels: Record<CanvasNodeType, string> = {
    image: 'Image',
    text: 'Text',
    config: 'Config',
    textAnnotation: 'Note',
  }
  return labels[type]
}

function NodeTypeIcon(props: { type: CanvasNodeType }) {
  const icons: Record<CanvasNodeType, string> = {
    image: 'image',
    text: 'fileText',
    config: 'sparkles',
    textAnnotation: 'edit',
  }
  return <AppIcon name={icons[props.type] as never} className="w-3 h-3" />
}

function ConfigNodeBody(props: {
  node: CanvasNode
  imageModels: ReturnType<typeof useStudioModels>['imageModels']
  running: boolean
  onUpdate: (patch: Partial<CanvasNode>) => void
  onRun: () => void
}) {
  const t = useTranslations('imageStudio')
  const config = props.node.genConfig || { model: '', outputSize: '1K', aspectRatio: '1:1', temperature: 1, count: 1 }

  const sizeOptions = useMemo(() => {
    const model = props.imageModels.find((item) => item.value === config.model)
    return getStudioOutputSizeOptions(model).map((size) => ({ value: size, label: size }))
  }, [props.imageModels, config.model])

  const updateConfig = (patch: Partial<NonNullable<CanvasNode['genConfig']>>) => {
    props.onUpdate({ genConfig: { ...config, ...patch } })
  }

  return (
    <div className="space-y-2">
      <textarea
        value={props.node.composerContent || ''}
        onChange={(e) => props.onUpdate({ composerContent: e.target.value })}
        placeholder={t('canvas.configNode.promptPlaceholder')}
        rows={3}
        className="glass-textarea-base w-full px-2 py-1.5 text-xs"
      />
      <select
        value={config.model}
        onChange={(e) => updateConfig({ model: e.target.value })}
        className="glass-select-base px-2 py-1.5 text-xs w-full"
      >
        <option value="">{t('canvas.configNode.model')}</option>
        {props.imageModels.map((model) => (
          <option key={model.value} value={model.value}>{model.label}</option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <select
          value={config.outputSize}
          onChange={(e) => updateConfig({ outputSize: e.target.value })}
          className="glass-select-base px-2 py-1.5 text-xs"
        >
          {sizeOptions.map((size) => (
            <option key={size.value} value={size.value}>{size.label}</option>
          ))}
        </select>
        <select
          value={config.aspectRatio}
          onChange={(e) => updateConfig({ aspectRatio: e.target.value })}
          className="glass-select-base px-2 py-1.5 text-xs"
        >
          <option value="1:1">1:1</option>
          <option value="16:9">16:9</option>
          <option value="9:16">9:16</option>
          <option value="3:2">3:2</option>
          <option value="2:3">2:3</option>
        </select>
      </div>
      <GlassSlider
        label={t('canvas.configNode.temperature')}
        value={config.temperature}
        min={0}
        max={2}
        step={0.1}
        onChange={(value) => updateConfig({ temperature: value })}
      />
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs text-[var(--glass-text-secondary)]">{t('canvas.configNode.count')}</label>
        <select
          value={config.count}
          onChange={(e) => updateConfig({ count: Number(e.target.value) })}
          className="glass-select-base px-2 py-1 text-xs"
        >
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>
      <button
        type="button"
        onClick={props.onRun}
        disabled={props.running}
        className="glass-btn-base glass-btn-tone-info w-full py-1.5 text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
      >
        {props.running ? <StudioSpinner /> : <AppIcon name="sparkles" className="w-3 h-3" />}
        {props.running ? t('canvas.configNode.running') : t('canvas.configNode.run')}
      </button>
    </div>
  )
}
