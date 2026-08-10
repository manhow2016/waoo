/**
 * 无限画布（Canvas Workspace）
 *
 * 移植自 nova-image-studio 的 CanvasWorkspace + CanvasEditor 核心能力，
 * 通过 zustand 持久化项目，节点连线驱动生成，生成走 /api/image-studio/generate。
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { AppIcon } from '@/components/ui/icons';
import CanvasConnections from './canvas/CanvasConnections';
import {
  CanvasContextMenu,
  type ContextMenuState,
} from './canvas/CanvasContextMenu';
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
} from './canvas/canvas-store';
import {
  useStudioModels,
  getStudioOutputSizeOptions,
} from '@/lib/image-studio/models';
import { studioGenerate, streamStudioAiText } from '@/lib/image-studio/client';
import { prepareImageFile, extractImageFiles } from './image-utils';
import { StudioSpinner, StudioModal, StudioEmptyState, cx } from './ui';
import { useRouter } from '@/i18n/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2;

export default function CanvasWorkspace() {
  const {
    projects,
    activeProjectId,
    createProject,
    deleteProject,
    setActiveProject,
    updateProject,
  } = useCanvasStore();
  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) || null,
    [projects, activeProjectId],
  );

  if (activeProject) {
    return (
      <CanvasEditor
        project={activeProject}
        onBack={() => setActiveProject(null)}
        onUpdate={(updater) => updateProject(activeProject.id, updater)}
      />
    );
  }

  return (
    <CanvasProjectList
      projects={projects}
      onCreate={createProject}
      onDelete={deleteProject}
      onOpen={setActiveProject}
    />
  );
}

function CanvasProjectList(props: {
  projects: CanvasProject[];
  onCreate: (name: string) => string;
  onDelete: (projectId: string) => void;
  onOpen: (projectId: string) => void;
}) {
  const t = useTranslations('imageStudio');
  const tc = useTranslations('imageStudio.common');
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<CanvasProject | null>(null);

  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <h3 className='text-lg font-semibold text-[var(--glass-text-primary)]'>
          {t('canvas.projectList')}
        </h3>
        <button
          type='button'
          onClick={() => setShowCreate(true)}
          className='glass-btn-base glass-btn-primary px-4 py-2 flex items-center gap-2'
        >
          <AppIcon name='plus' className='w-4 h-4' />
          {t('canvas.newProject')}
        </button>
      </div>

      {props.projects.length === 0 ? (
        <StudioEmptyState
          title={t('canvas.emptyProjects')}
          description={t('canvas.emptyProjectsDesc')}
        />
      ) : (
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'>
          {props.projects.map((project) => {
            const imageNodes = project.nodes.filter(
              (node) => node.type === 'image' && node.content,
            );
            return (
              <div
                key={project.id}
                className='glass-surface rounded-2xl overflow-hidden group cursor-pointer'
                onClick={() => props.onOpen(project.id)}
              >
                <div className='h-36 bg-[var(--glass-bg-muted)] flex items-center justify-center overflow-hidden'>
                  {imageNodes[0]?.content ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imageNodes[0].content}
                      alt=''
                      className='w-full h-full object-cover'
                    />
                  ) : (
                    <AppIcon
                      name='image'
                      className='w-10 h-10 text-[var(--glass-text-tertiary)]'
                    />
                  )}
                </div>
                <div className='p-4 flex items-center justify-between'>
                  <div>
                    <h4 className='text-sm font-medium text-[var(--glass-text-primary)]'>
                      {project.name}
                    </h4>
                    <p className='text-[10px] text-[var(--glass-text-tertiary)] mt-1'>
                      {project.nodes.length} 节点 ·{' '}
                      {new Date(project.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    type='button'
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(project);
                    }}
                    className='glass-btn-base glass-btn-ghost p-1.5 rounded-lg text-[var(--glass-tone-danger-fg)] opacity-0 group-hover:opacity-100 transition-opacity'
                  >
                    <AppIcon name='trash' className='w-4 h-4' />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <StudioModal
          title={t('canvas.newProject')}
          onClose={() => setShowCreate(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) {
                props.onCreate(name.trim());
                setShowCreate(false);
                setName('');
              }
            }}
          >
            <input
              type='text'
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('canvas.projectNamePlaceholder')}
              className='glass-input-base w-full px-3 py-2 mb-4'
              autoFocus
            />
            <div className='flex justify-end gap-3'>
              <button
                type='button'
                onClick={() => setShowCreate(false)}
                className='glass-btn-base glass-btn-secondary px-4 py-2'
              >
                {tc('cancel')}
              </button>
              <button
                type='submit'
                disabled={!name.trim()}
                className='glass-btn-base glass-btn-primary px-4 py-2 disabled:opacity-50'
              >
                {t('canvas.createProject')}
              </button>
            </div>
          </form>
        </StudioModal>
      )}

      {deleteTarget && (
        <StudioModal title={tc('delete')} onClose={() => setDeleteTarget(null)}>
          <p className='text-sm text-[var(--glass-text-secondary)] mb-4'>
            {t('canvas.deleteConfirm', { name: deleteTarget.name })}
          </p>
          <div className='flex justify-end gap-3'>
            <button
              type='button'
              onClick={() => setDeleteTarget(null)}
              className='glass-btn-base glass-btn-secondary px-4 py-2'
            >
              {tc('cancel')}
            </button>
            <button
              type='button'
              onClick={() => {
                props.onDelete(deleteTarget.id);
                setDeleteTarget(null);
              }}
              className='glass-btn-base glass-btn-danger px-4 py-2'
            >
              {tc('delete')}
            </button>
          </div>
        </StudioModal>
      )}
    </div>
  );
}

// ===== 画布编辑器 =====

function CanvasEditor(props: {
  project: CanvasProject;
  onBack: () => void;
  onUpdate: (updater: (project: CanvasProject) => CanvasProject) => void;
}) {
  const t = useTranslations('imageStudio');
  const tc = useTranslations('imageStudio.common');
  const { imageModels, llmModels } = useStudioModels();
  const { data: session } = useSession();
  const router = useRouter();

  const [nodes, setNodes] = useState<CanvasNode[]>(props.project.nodes);
  const [connections, setConnections] = useState(props.project.connections);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [interactionMode, setInteractionMode] = useState<'select' | 'pan'>(
    'select',
  );
  const [backgroundMode, setBackgroundMode] = useState<
    'lines' | 'dots' | 'blank'
  >(props.project.backgroundMode || 'lines');
  const [connecting, setConnecting] = useState<{
    handle: { nodeId: string; handleType: 'source' | 'target' };
    mouseWorld: { x: number; y: number };
    targetId?: string;
  } | null>(null);
  const [runningNodeId, setRunningNodeId] = useState<string | null>(null);
  const [aiGeneratingNodeId, setAiGeneratingNodeId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(props.project.name);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>(
    'saved',
  );
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const aiStreamAbortRef = useRef<(() => void) | null>(null);
  const selectionBoxRef = useRef<typeof selectionBox>(null);
  const nodesRef = useRef(nodes);
  const connectionsRef = useRef(connections);

  useEffect(() => {
    selectionBoxRef.current = selectionBox;
  }, [selectionBox]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    connectionsRef.current = connections;
  }, [connections]);

  // 撤销/重做历史栈
  interface CanvasSnapshot {
    nodes: CanvasNode[];
    connections: CanvasConnection[];
  }
  const historyRef = useRef<CanvasSnapshot[]>([]);
  const redoRef = useRef<CanvasSnapshot[]>([]);
  const historyLockRef = useRef(false);

  const cloneSnapshot = (): CanvasSnapshot => ({
    nodes: JSON.parse(JSON.stringify(nodesRef.current)) as CanvasNode[],
    connections: JSON.parse(
      JSON.stringify(connectionsRef.current),
    ) as CanvasConnection[],
  });

  /** 记录一次可撤销的变更（在修改前调用） */
  const commitHistory = () => {
    if (historyLockRef.current) return;
    historyRef.current.push(cloneSnapshot());
    if (historyRef.current.length > 100) historyRef.current.shift();
    redoRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  };

  const handleUndo = () => {
    const snapshot = historyRef.current.pop();
    if (!snapshot) return;
    historyLockRef.current = true;
    redoRef.current.push(cloneSnapshot());
    setNodes(snapshot.nodes);
    setConnections(snapshot.connections);
    setSelectedNodeId(null);
    historyLockRef.current = false;
    setCanUndo(historyRef.current.length > 0);
    setCanRedo(true);
  };

  const handleRedo = () => {
    const snapshot = redoRef.current.pop();
    if (!snapshot) return;
    historyLockRef.current = true;
    historyRef.current.push(cloneSnapshot());
    setNodes(snapshot.nodes);
    setConnections(snapshot.connections);
    setSelectedNodeId(null);
    historyLockRef.current = false;
    setCanRedo(redoRef.current.length > 0);
    setCanUndo(true);
  };

  // 键盘快捷键：Ctrl+Z / Ctrl+Shift+Z
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'y'
      ) {
        event.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, connections]);

  // 同步到 store（防抖保存）
  useEffect(() => {
    setSaveStatus('saving');
    const timer = setTimeout(() => {
      try {
        props.onUpdate((project) => ({
          ...project,
          nodes,
          connections,
          backgroundMode,
        }));
        setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
      }
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, connections, backgroundMode]);

  const handleRename = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim())
      props.onUpdate((project) => ({ ...project, name: name.trim() }));
  };

  const addNode = (type: CanvasNodeType) => {
    commitHistory();
    // 新节点按网格布局（横向 380、纵向 260），避免默认重叠遮挡连接手柄
    const count = nodes.length;
    const col = count % 3;
    const row = Math.floor(count / 3);
    const node = createNode(type, 80 + col * 380, 80 + row * 260);
    setNodes((prev) => [...prev, node]);
    setSelectedNodeId(node.id);
  };

  const handleDropOnCanvas = (e: React.DragEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const files = extractImageFiles(e.dataTransfer.items);
    if (files.length === 0) return;
    commitHistory();
    const worldX = (e.clientX - rect.left - view.x) / view.zoom;
    const worldY = (e.clientY - rect.top - view.y) / view.zoom;
    void (async () => {
      for (const file of files.slice(0, 4)) {
        try {
          const prepared = await prepareImageFile(file);
          const node = createNode(
            'image',
            worldX + Math.random() * 40,
            worldY + Math.random() * 40,
          );
          node.content = prepared.dataUrl;
          setNodes((prev) => [...prev, node]);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
  };

  const handleNodePointerDown = (node: CanvasNode, e: React.PointerEvent) => {
    if (e.button === 2) return;
    // 点击节点内的输入控件时，允许其正常聚焦输入（不启动拖拽）
    const target = e.target as HTMLElement;
    if (
      target.closest(
        'input, textarea, select, button, a, [data-canvas-no-zoom]',
      )
    ) {
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setSelectedNodeId(node.id);
    // 连接拖拽中：点击目标节点本体即可完成连线
    if (connecting && connecting.handle.nodeId !== node.id) {
      const from =
        connecting.handle.handleType === 'source'
          ? connecting.handle.nodeId
          : node.id;
      const to =
        connecting.handle.handleType === 'source'
          ? node.id
          : connecting.handle.nodeId;
      if (
        !connections.some((c) => c.fromNodeId === from && c.toNodeId === to)
      ) {
        commitHistory();
        const result = connectNodes(nodes, connections, from, to);
        setNodes(result.nodes);
        setConnections(result.connections);
      }
      setConnecting(null);
      return;
    }
    commitHistory();
    const startPointer = { x: e.clientX, y: e.clientY };
    const startNode = { x: node.x, y: node.y };
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startPointer.x) / view.zoom;
      const dy = (ev.clientY - startPointer.y) / view.zoom;
      setNodes((prev) =>
        prev.map((n) =>
          n.id === node.id
            ? { ...n, x: startNode.x + dx, y: startNode.y + dy }
            : n,
        ),
      );
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // 客户端坐标 → 画布世界坐标
  const worldFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - view.x) / view.zoom,
        y: (clientY - rect.top - view.y) / view.zoom,
      };
    },
    [view.x, view.y, view.zoom],
  );

  // 连接拖拽开始：按住连接手柄（输出 source / 输入 target）
  const handleConnectStart = useCallback(
    (
      event: React.PointerEvent,
      nodeId: string,
      handleType: 'source' | 'target',
    ) => {
      event.stopPropagation();
      setConnecting({
        handle: { nodeId, handleType },
        mouseWorld: worldFromClient(event.clientX, event.clientY),
      });
    },
    [worldFromClient],
  );

  // 连接拖拽：跟随鼠标移动并检测悬停的目标节点，松开时建立连线
  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      setConnecting((prev) => {
        if (!prev) return prev;
        const world = worldFromClient(event.clientX, event.clientY);
        const overEl = document
          .elementFromPoint(event.clientX, event.clientY)
          ?.closest('[data-node-id]') as HTMLElement | null;
        const rawTarget = overEl?.getAttribute('data-node-id') || undefined;
        return {
          ...prev,
          mouseWorld: world,
          targetId:
            rawTarget && rawTarget !== prev.handle.nodeId
              ? rawTarget
              : undefined,
        };
      });
    };
    const handleUp = (event: PointerEvent) => {
      setConnecting((prev) => {
        if (!prev) return prev;
        if (prev.targetId) {
          const { handle, targetId } = prev;
          const from =
            handle.handleType === 'source' ? handle.nodeId : targetId;
          const to = handle.handleType === 'source' ? targetId : handle.nodeId;
          const currentConnections = connectionsRef.current;
          const currentNodes = nodesRef.current;
          if (
            from !== to &&
            !currentConnections.some(
              (c) => c.fromNodeId === from && c.toNodeId === to,
            )
          ) {
            commitHistory();
            const result = connectNodes(
              currentNodes,
              currentConnections,
              from,
              to,
            );
            setNodes(result.nodes);
            setConnections(result.connections);
          }
        } else {
          // 拖到空白处松开 → 弹出连线创建菜单
          const world = worldFromClient(event.clientX, event.clientY);
          setContextMenu({
            type: 'connection-create',
            x: event.clientX,
            y: event.clientY,
            worldX: world.x,
            worldY: world.y,
            sourceNodeId: prev.handle.nodeId,
            handleType: prev.handle.handleType,
          });
        }
        return null;
      });
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldFromClient]);

  const handleBackgroundPointerDown = (e: React.PointerEvent) => {
    // 仅当点击画布空白区域（非节点、非输入控件）时启动平移/框选
    const target = e.target as HTMLElement;
    if (target.closest('[data-node-id]')) return;
    if (target.closest('input, textarea, select, button, a')) return;
    setSelectedNodeId(null);
    setConnecting(null);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const shouldPan = interactionMode === 'pan' || e.button === 1;
    const worldStartX = (e.clientX - rect.left - view.x) / view.zoom;
    const worldStartY = (e.clientY - rect.top - view.y) / view.zoom;

    // select 模式：拖拽空白处框选节点
    if (!shouldPan) {
      const move = (ev: PointerEvent) => {
        setSelectionBox({
          startX: worldStartX,
          startY: worldStartY,
          currentX: (ev.clientX - rect.left - view.x) / view.zoom,
          currentY: (ev.clientY - rect.top - view.y) / view.zoom,
        });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        setSelectionBox(null);
        // 框选结束时选中与框选区域相交的节点（匹配 nova-image-studio 行为）
        setNodes((prev) => {
          if (selectionBoxRef.current) {
            const { startX, startY, currentX, currentY } =
              selectionBoxRef.current;
            const minX = Math.min(startX, currentX);
            const maxX = Math.max(startX, currentX);
            const minY = Math.min(startY, currentY);
            const maxY = Math.max(startY, currentY);
            const intersecting = prev.filter(
              (n) =>
                n.x + n.width >= minX &&
                n.x <= maxX &&
                n.y + n.height >= minY &&
                n.y <= maxY,
            );
            if (intersecting.length > 0) {
              setSelectedNodeId(intersecting[intersecting.length - 1].id);
            }
          }
          return prev;
        });
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      return;
    }

    // pan 模式：平移视图
    const start = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    const move = (ev: PointerEvent) => {
      setView((prev) => ({
        ...prev,
        x: start.vx + (ev.clientX - start.x),
        y: start.vy + (ev.clientY - start.y),
      }));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const handleResetView = () => {
    setView({ x: 0, y: 0, zoom: 1 });
  };

  const handleResizeStart = (
    nodeId: string,
    corner: string,
    e: React.PointerEvent,
  ) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    commitHistory();
    const startPointer = { x: e.clientX, y: e.clientY };
    const startNode = {
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
    };

    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startPointer.x) / view.zoom;
      const dy = (ev.clientY - startPointer.y) / view.zoom;
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== nodeId) return n;
          const next = { ...n };
          if (corner.includes('e')) {
            next.width = Math.max(180, startNode.width + dx);
          }
          if (corner.includes('s')) {
            next.height = Math.max(120, startNode.height + dy);
          }
          if (corner.includes('w')) {
            next.width = Math.max(180, startNode.width - dx);
            next.x = startNode.x + (startNode.width - next.width);
          }
          if (corner.includes('n')) {
            next.height = Math.max(120, startNode.height - dy);
            next.y = startNode.y + (startNode.height - next.height);
          }
          return next;
        }),
      );
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const handleToggleRenderMode = (nodeId: string) => {
    commitHistory();
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== nodeId) return n;
        return {
          ...n,
          renderMode: n.renderMode === 'markdown' ? 'plain' : 'markdown',
        };
      }),
    );
  };

  const handleAiGenerate = async (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node || aiGeneratingNodeId) return;
    if (!session?.user) {
      router.push({ pathname: '/auth/signin' });
      return;
    }
    const modelKey = llmModels[0]?.value;
    if (!modelKey) {
      setError(tc('noModels'));
      return;
    }
    const prompt = node.prompt?.trim() || node.text?.trim();
    if (!prompt) {
      setError(t('canvas.textNode.aiPromptRequired'));
      return;
    }

    commitHistory();
    setAiGeneratingNodeId(nodeId);
    setError(null);

    const handle = streamStudioAiText({
      modelKey,
      prompt,
      existingContent: node.text || '',
      callbacks: {
        onDelta: (delta) => {
          setNodes((prev) =>
            prev.map((n) =>
              n.id === nodeId ? { ...n, text: (n.text || '') + delta } : n,
            ),
          );
        },
        onDone: () => setAiGeneratingNodeId(null),
        onError: (err) => {
          setError(err.message);
          setAiGeneratingNodeId(null);
        },
      },
    });
    aiStreamAbortRef.current = handle.abort;
  };

  const handleZoom = (factor: number) => {
    setView((prev) => {
      const zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, prev.zoom * factor));
      return { ...prev, zoom };
    });
  };

  // 使用原生 wheel 监听（passive: false）以支持 preventDefault 阻止页面滚动
  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const factor = event.deltaY < 0 ? 1.1 : 0.9;
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      setView((prev) => {
        const zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, prev.zoom * factor));
        return {
          zoom,
          x: mouseX - ((mouseX - prev.x) / prev.zoom) * zoom,
          y: mouseY - ((mouseY - prev.y) / prev.zoom) * zoom,
        };
      });
    };

    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  const runConfigNode = async (node: CanvasNode) => {
    if (!node.genConfig || runningNodeId) return;
    if (!session?.user) {
      router.push({ pathname: '/auth/signin' });
      return;
    }
    const config = node.genConfig;
    if (!config.model) {
      setError(tc('noModels'));
      return;
    }

    const upstream = collectUpstreamResources(nodes, connections, node.id);
    const { prompt, referenceImages } = composeConfigPrompt(
      node.composerContent || '',
      upstream,
    );
    if (!prompt) {
      setError('配置节点需要提示词或上游文本节点');
      return;
    }

    setRunningNodeId(node.id);
    setError(null);
    try {
      const count = Math.max(1, Math.min(4, config.count || 1));
      const result = await studioGenerate({
        modelKey: config.model,
        prompt,
        referenceImages,
        options: {
          outputSize: config.outputSize as never,
          aspectRatio: config.aspectRatio,
        },
        parallelCount: count,
      });

      // 创建结果图片节点并连线
      const resultNodes: CanvasNode[] = result.images.map((url, index) => {
        const resultNode = createNode(
          'image',
          node.x + 320 + index * 40,
          node.y + index * 40,
        );
        resultNode.content = url;
        resultNode.width = 220;
        resultNode.height = 220;
        return resultNode;
      });
      setNodes((prev) => {
        const next = [...prev, ...resultNodes];
        const nextConnections = [
          ...connections,
          ...resultNodes.map((resultNode) => ({
            id: `conn_${node.id}_${resultNode.id}`,
            fromNodeId: node.id,
            toNodeId: resultNode.id,
          })),
        ];
        setConnections(nextConnections);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunningNodeId(null);
    }
  };

  const updateConfigNode = (nodeId: string, patch: Partial<CanvasNode>) => {
    setNodes((prev) =>
      prev.map((node) => (node.id === nodeId ? { ...node, ...patch } : node)),
    );
  };

  const canvasKey = props.project.id;
  useEffect(() => {
    setNodes(props.project.nodes);
    setConnections(props.project.connections);
  }, [canvasKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 连线路径（世界坐标）
  const connectionPaths = useMemo(
    () =>
      connections
        .map((connection) => {
          const from = nodes.find((node) => node.id === connection.fromNodeId);
          const to = nodes.find((node) => node.id === connection.toNodeId);
          if (!from || !to) return null;
          const startX = from.x + from.width;
          const startY = from.y + from.height / 2;
          const endX = to.x;
          const endY = to.y + to.height / 2;
          const dx = Math.abs(endX - startX);
          const curvature = Math.max(dx * 0.5, 50);
          return {
            key: connection.id,
            d: `M ${startX} ${startY} C ${startX + curvature} ${startY}, ${endX - curvature} ${endY}, ${endX} ${endY}`,
          };
        })
        .filter((path): path is { key: string; d: string } => path !== null),
    [connections, nodes],
  );

  // 连接拖拽预览线（世界坐标）
  const activeConnectionPath = useMemo(() => {
    if (!connecting) return null;
    const activeNode = nodes.find(
      (node) => node.id === connecting.handle.nodeId,
    );
    if (!activeNode) return null;
    const source = connecting.handle.handleType === 'source';
    const startX = source
      ? activeNode.x + activeNode.width
      : connecting.mouseWorld.x;
    const startY = source
      ? activeNode.y + activeNode.height / 2
      : connecting.mouseWorld.y;
    const endX = source ? connecting.mouseWorld.x : activeNode.x;
    const endY = source
      ? connecting.mouseWorld.y
      : activeNode.y + activeNode.height / 2;
    const targetNode = connecting.targetId
      ? nodes.find((node) => node.id === connecting.targetId)
      : undefined;
    let snappedStartX = startX;
    let snappedStartY = startY;
    let snappedEndX = endX;
    let snappedEndY = endY;
    if (targetNode) {
      if (source) {
        snappedEndX = targetNode.x;
        snappedEndY = targetNode.y + targetNode.height / 2;
      } else {
        snappedStartX = targetNode.x + targetNode.width;
        snappedStartY = targetNode.y + targetNode.height / 2;
      }
    }
    const dx = Math.abs(snappedEndX - snappedStartX);
    return `M ${snappedStartX} ${snappedStartY} C ${snappedStartX + dx * 0.5} ${snappedStartY}, ${snappedEndX - dx * 0.5} ${snappedEndY}, ${snappedEndX} ${snappedEndY}`;
  }, [connecting, nodes]);

  return (
    <div className='space-y-4'>
      {error && (
        <div className='rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400'>
          {error}
        </div>
      )}

      {/* 画布（接近全屏，工具条/头部/缩放均为浮动覆盖层） */}
      <div
        ref={canvasRef}
        onPointerDown={handleBackgroundPointerDown}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDropOnCanvas}
        className={cx(
          'relative h-[calc(100vh-260px)] min-h-[560px] rounded-2xl overflow-hidden border border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-muted)]/20 select-none',
          interactionMode === 'pan' ? 'cursor-grab' : 'cursor-crosshair',
        )}
        style={{ touchAction: 'none' }}
        onContextMenu={(e) => {
          e.preventDefault();
          const target = e.target as HTMLElement;
          if (target.closest('[data-node-id]')) return;
          if (target.closest('[data-connection-id]')) return;
          const rect = canvasRef.current?.getBoundingClientRect();
          if (!rect) return;
          const worldX = (e.clientX - rect.left - view.x) / view.zoom;
          const worldY = (e.clientY - rect.top - view.y) / view.zoom;
          setContextMenu({
            type: 'canvas',
            x: e.clientX,
            y: e.clientY,
            worldX,
            worldY,
          });
        }}
      >
        {/* 背景（网格/圆点/空白，随缩放同步） */}
        {backgroundMode !== 'blank' && (
          <CanvasBackground mode={backgroundMode} view={view} />
        )}

        {/* 节点 */}
        <div
          className='absolute'
          style={{
            transform: `scale(${view.zoom})`,
            transformOrigin: '0 0',
            left: view.x,
            top: view.y,
          }}
        >
          {/* 连线（含连接拖拽预览虚线，与节点共享 transform） */}
          <CanvasConnections
            paths={connectionPaths}
            activePath={activeConnectionPath}
            onConnectionContextMenu={(connectionId, e) => {
              setContextMenu({
                type: 'connection',
                x: e.clientX,
                y: e.clientY,
                connectionId,
              });
            }}
          />

          {nodes.map((node) => (
            <CanvasNodeView
              key={node.id}
              node={node}
              selected={selectedNodeId === node.id}
              imageModels={imageModels}
              running={runningNodeId === node.id}
              connecting={connecting}
              isConnectionTarget={connecting?.targetId === node.id}
              onPointerDown={(e) => handleNodePointerDown(node, e)}
              onSelect={() => setSelectedNodeId(node.id)}
              onUpdate={(patch) => {
                commitHistory();
                updateConfigNode(node.id, patch);
              }}
              onDelete={() => {
                commitHistory();
                const result = deleteNode(nodes, connections, node.id);
                setNodes(result.nodes);
                setConnections(result.connections);
                setSelectedNodeId(null);
              }}
              onRun={() => void runConfigNode(node)}
              onConnectStart={(e, handleType) =>
                handleConnectStart(e, node.id, handleType)
              }
              onUploadImage={async (files) => {
                if (files.length === 0) return;
                commitHistory();
                for (const file of files) {
                  const prepared = await prepareImageFile(file);
                  updateConfigNode(node.id, { content: prepared.dataUrl });
                }
              }}
              onResizeStart={handleResizeStart}
              onToggleRenderMode={handleToggleRenderMode}
              onAiGenerate={(nodeId) => void handleAiGenerate(nodeId)}
              aiGenerating={aiGeneratingNodeId === node.id}
              onContextMenu={(e) => {
                setSelectedNodeId(node.id)
                setContextMenu({
                  type: 'node',
                  x: e.clientX,
                  y: e.clientY,
                  nodeId: node.id,
                  nodeType: node.type,
                  hasImageContent: node.type === 'image' && Boolean(node.content),
                })
              }}
            />
          ))}

          {/* 框选矩形（与 nova-image-studio 选择框样式一致） */}
          {selectionBox && (
            <div
              className='pointer-events-none absolute rounded-md border-2'
              style={{
                left: Math.min(selectionBox.startX, selectionBox.currentX),
                top: Math.min(selectionBox.startY, selectionBox.currentY),
                width: Math.abs(selectionBox.currentX - selectionBox.startX),
                height: Math.abs(selectionBox.currentY - selectionBox.startY),
                borderColor: 'var(--primary)',
                background:
                  'color-mix(in srgb, var(--primary) 12%, transparent)',
              }}
            />
          )}
        </div>

        {/* 空画布提示 */}
        {nodes.length === 0 && (
          <div className='absolute inset-0 flex items-center justify-center pointer-events-none'>
            <p className='text-sm text-[var(--glass-text-tertiary)]'>
              {t('canvas.canvasEmpty')}
            </p>
          </div>
        )}

        {/* 左上角：返回 + 标题 + 保存状态 */}
        <div
          data-canvas-no-zoom
          className='absolute top-4 left-4 z-50 flex items-center gap-2'
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type='button'
            onClick={props.onBack}
            className='glass-btn-base glass-btn-ghost p-2 rounded-lg'
            title={t('canvas.back')}
          >
            <AppIcon name='chevronLeft' className='w-4 h-4' />
          </button>
          <form onSubmit={handleRename} className='flex items-center'>
            <input
              type='text'
              value={name}
              onChange={(e) => setName(e.target.value)}
              className='glass-input-base px-3 py-1.5 text-sm w-44'
            />
          </form>
          <span className='flex items-center gap-1 text-[11px] text-[var(--glass-text-tertiary)]'>
            {saveStatus === 'saving' ? (
              <StudioSpinner className='w-3 h-3' />
            ) : saveStatus === 'error' ? (
              <AppIcon
                name='alert'
                className='w-3 h-3 text-[var(--glass-tone-danger-fg)]'
              />
            ) : (
              <AppIcon
                name='check'
                className='w-3 h-3 text-[var(--glass-tone-success-fg)]'
              />
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
          className='absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 rounded-2xl glass-surface px-2 py-1.5 shadow-lg max-w-[calc(100%-2rem)] overflow-x-auto'
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* 选择/抓手模式切换 */}
          <div className='inline-flex rounded-xl p-0.5 bg-[var(--glass-bg-muted)] gap-0.5 mr-1'>
            <button
              type='button'
              onClick={() => setInteractionMode('select')}
              title={t('canvas.toolbar.selectMode')}
              className={cx(
                'px-2 py-1.5 rounded-lg transition-all',
                interactionMode === 'select'
                  ? 'bg-[var(--glass-bg-surface-strong)] text-[var(--glass-text-primary)] shadow-sm'
                  : 'text-[var(--glass-text-secondary)]',
              )}
            >
              <AppIcon name='copy' className='w-3.5 h-3.5' />
            </button>
            <button
              type='button'
              onClick={() => setInteractionMode('pan')}
              title={t('canvas.toolbar.panMode')}
              className={cx(
                'px-2 py-1.5 rounded-lg transition-all',
                interactionMode === 'pan'
                  ? 'bg-[var(--glass-bg-surface-strong)] text-[var(--glass-text-primary)] shadow-sm'
                  : 'text-[var(--glass-text-secondary)]',
              )}
            >
              <AppIcon name='move' className='w-3.5 h-3.5' />
            </button>
          </div>

          <div className='mx-1 h-5 w-px bg-[var(--glass-stroke-soft)]' />

          <button
            type='button'
            onClick={() => addNode('image')}
            className='glass-btn-base glass-btn-ghost p-2 rounded-lg'
            title={t('canvas.addImageNode')}
          >
            <AppIcon name='image' className='w-4 h-4' />
          </button>
          <button
            type='button'
            onClick={() => addNode('text')}
            className='glass-btn-base glass-btn-ghost p-2 rounded-lg'
            title={t('canvas.addTextNode')}
          >
            <AppIcon name='fileText' className='w-4 h-4' />
          </button>
          <button
            type='button'
            onClick={() => addNode('textAnnotation')}
            className='glass-btn-base glass-btn-ghost p-2 rounded-lg'
            title={t('canvas.addAnnotationNode')}
          >
            <AppIcon name='edit' className='w-4 h-4' />
          </button>
          <button
            type='button'
            onClick={() => addNode('config')}
            className='glass-btn-base glass-btn-ghost p-2 rounded-lg'
            title={t('canvas.addConfigNode')}
          >
            <AppIcon name='sparkles' className='w-4 h-4' />
          </button>

          <div className='mx-1 h-5 w-px bg-[var(--glass-stroke-soft)]' />

          {/* 撤销/重做 */}
          <button
            type='button'
            onClick={handleUndo}
            disabled={!canUndo}
            className='glass-btn-base glass-btn-ghost p-2 rounded-lg disabled:opacity-40'
            title={t('canvas.toolbar.undo')}
          >
            <AppIcon name='undo' className='w-4 h-4' />
          </button>
          <button
            type='button'
            onClick={handleRedo}
            disabled={!canRedo}
            className='glass-btn-base glass-btn-ghost p-2 rounded-lg disabled:opacity-40'
            title={t('canvas.toolbar.redo')}
          >
            <AppIcon name='redo' className='w-4 h-4' />
          </button>

          <div className='mx-1 h-5 w-px bg-[var(--glass-stroke-soft)]' />

          {/* 画布背景模式 */}
          <div className='inline-flex rounded-xl p-0.5 bg-[var(--glass-bg-muted)] gap-0.5'>
            <button
              type='button'
              onClick={() => setBackgroundMode('lines')}
              title={t('canvas.background.lines')}
              className={cx(
                'px-2 py-1.5 rounded-lg transition-all',
                backgroundMode === 'lines'
                  ? 'bg-[var(--glass-bg-surface-strong)] text-[var(--glass-text-primary)] shadow-sm'
                  : 'text-[var(--glass-text-secondary)]',
              )}
            >
              <AppIcon name='grid' className='w-3.5 h-3.5' />
            </button>
            <button
              type='button'
              onClick={() => setBackgroundMode('dots')}
              title={t('canvas.background.dots')}
              className={cx(
                'px-2 py-1.5 rounded-lg transition-all',
                backgroundMode === 'dots'
                  ? 'bg-[var(--glass-bg-surface-strong)] text-[var(--glass-text-primary)] shadow-sm'
                  : 'text-[var(--glass-text-secondary)]',
              )}
            >
              <AppIcon name='circleDot' className='w-3.5 h-3.5' />
            </button>
            <button
              type='button'
              onClick={() => setBackgroundMode('blank')}
              title={t('canvas.background.blank')}
              className={cx(
                'px-2 py-1.5 rounded-lg transition-all',
                backgroundMode === 'blank'
                  ? 'bg-[var(--glass-bg-surface-strong)] text-[var(--glass-text-primary)] shadow-sm'
                  : 'text-[var(--glass-text-secondary)]',
              )}
            >
              <AppIcon name='minus' className='w-3.5 h-3.5' />
            </button>
          </div>
        </div>

        {/* 右下角：缩放控制 */}
        <div
          data-canvas-no-zoom
          className='absolute bottom-4 right-4 z-50 flex items-center gap-1 rounded-xl glass-surface px-2 py-1.5 shadow-lg'
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type='button'
            onClick={() => handleZoom(0.9)}
            className='glass-btn-base glass-btn-ghost px-2 py-1'
            title={t('canvas.toolbar.zoomOut')}
          >
            <AppIcon name='minus' className='w-3.5 h-3.5' />
          </button>
          <input
            type='range'
            min={ZOOM_MIN * 100}
            max={ZOOM_MAX * 100}
            step={1}
            value={Math.round(view.zoom * 100)}
            onChange={(e) =>
              setView((prev) => ({
                ...prev,
                zoom: Number(e.target.value) / 100,
              }))
            }
            className='w-24 accent-[var(--glass-tone-info-fg)]'
            aria-label={t('canvas.toolbar.zoomOut')}
          />
          <span className='w-10 text-right text-xs tabular-nums text-[var(--glass-text-secondary)]'>
            {Math.round(view.zoom * 100)}%
          </span>
          <button
            type='button'
            onClick={() => handleZoom(1.1)}
            className='glass-btn-base glass-btn-ghost px-2 py-1'
            title={t('canvas.toolbar.zoomIn')}
          >
            <AppIcon name='plus' className='w-3.5 h-3.5' />
          </button>
          <div className='mx-1 h-5 w-px bg-[var(--glass-stroke-soft)]' />
          <button
            type='button'
            onClick={handleResetView}
            className='glass-btn-base glass-btn-ghost px-2 py-1'
            title={t('canvas.toolbar.resetView')}
          >
            <AppIcon name='focus' className='w-3.5 h-3.5' />
          </button>
        </div>

        {/* 连线提示 */}
        {connecting && (
          <div className='absolute top-16 left-1/2 -translate-x-1/2 glass-chip glass-chip-info px-3 py-1.5 text-xs z-50'>
            {t('canvas.connectHint')}
          </div>
        )}
      </div>

      {/* 右键菜单 */}
      <CanvasContextMenu
        state={contextMenu}
        onClose={() => setContextMenu(null)}
        actions={{
          onAddNodeAt: (type, worldX, worldY) => {
            commitHistory();
            const node = createNode(type, worldX, worldY);
            setNodes((prev) => [...prev, node]);
            setSelectedNodeId(node.id);
          },
          onDeleteConnection: (connectionId) => {
            commitHistory();
            setConnections((prev) => prev.filter((c) => c.id !== connectionId));
          },
          onConnectionCreate: (
            type,
            worldX,
            worldY,
            sourceNodeId,
            handleType,
          ) => {
            commitHistory();
            const newNode = createNode(type, worldX, worldY);
            const from = handleType === 'source' ? sourceNodeId : newNode.id;
            const to = handleType === 'source' ? newNode.id : sourceNodeId;
            const connection: CanvasConnection = {
              id: `conn_${from}_${to}`,
              fromNodeId: from,
              toNodeId: to,
            };
            setNodes((prev) => [...prev, newNode]);
            setConnections((prev) => [...prev, connection]);
            setSelectedNodeId(newNode.id);
          },
          onCopyNode: (nodeId) => {
            const node = nodes.find((n) => n.id === nodeId);
            if (node) {
              const data = JSON.stringify(node);
              navigator.clipboard.writeText(data).catch(() => {});
            }
          },
          onDuplicateNode: (nodeId) => {
            commitHistory();
            const node = nodes.find((n) => n.id === nodeId);
            if (node) {
              const newNode = { ...node, id: createNode(node.type, node.x + 40, node.y + 40).id, x: node.x + 40, y: node.y + 40 };
              setNodes((prev) => [...prev, newNode]);
              setSelectedNodeId(newNode.id);
            }
          },
          onDeleteNode: (nodeId) => {
            commitHistory();
            const result = deleteNode(nodes, connections, nodeId);
            setNodes(result.nodes);
            setConnections(result.connections);
            setSelectedNodeId(null);
          },
          onDeleteImageOnly: (nodeId) => {
            commitHistory();
            setNodes((prev) => prev.map((n) => n.id === nodeId ? { ...n, content: undefined } : n));
          },
        }}
      />
    </div>
  );
}

// ===== 单个节点 =====

function CanvasNodeView(props: {
  node: CanvasNode;
  selected: boolean;
  imageModels: ReturnType<typeof useStudioModels>['imageModels'];
  running: boolean;
  connecting: {
    handle: { nodeId: string; handleType: 'source' | 'target' };
    mouseWorld: { x: number; y: number };
    targetId?: string;
  } | null;
  isConnectionTarget: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onSelect: () => void;
  onUpdate: (patch: Partial<CanvasNode>) => void;
  onDelete: () => void;
  onRun: () => void;
  onConnectStart: (
    e: React.PointerEvent,
    handleType: 'source' | 'target',
  ) => void;
  onUploadImage: (files: File[]) => Promise<void>;
  onResizeStart: (
    nodeId: string,
    corner: string,
    e: React.PointerEvent,
  ) => void;
  onToggleRenderMode: (nodeId: string) => void;
  onAiGenerate: (nodeId: string) => void;
  aiGenerating: boolean;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const t = useTranslations('imageStudio');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleSavedRef = useRef(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const isSelected = props.selected;
  const isTextAnnotation = props.node.type === 'textAnnotation';
  const borderColor = isTextAnnotation
    ? 'border-amber-500/40'
    : isSelected || props.isConnectionTarget
      ? 'border-[var(--glass-tone-info-fg)]'
      : 'border-[var(--glass-stroke-soft)]';
  const backgroundClass = isTextAnnotation
    ? 'bg-amber-500/10'
    : 'bg-[var(--glass-bg-surface-strong)]';
  // 选中高亮：--glass-tone-info-fg 描边 + 外发光 + 阴影效果（与连线颜色一致）
  const selectedShadow = isSelected
    ? 'shadow-[0_0_0_4px_color-mix(in_srgb,var(--glass-tone-info-fg)_18%,transparent),0_8px_24px_-4px_color-mix(in_srgb,var(--glass-tone-info-fg)_30%,transparent)]'
    : props.isConnectionTarget
      ? 'shadow-[0_0_0_3px_color-mix(in_srgb,var(--glass-tone-info-fg)_12%,transparent),0_4px_12px_-2px_color-mix(in_srgb,var(--glass-tone-info-fg)_20%,transparent)]'
      : undefined;

  const resizeCorners = [
    { corner: 'nw', className: 'top-[-16px] left-[-16px] cursor-nwse-resize' },
    { corner: 'ne', className: 'top-[-16px] right-[-16px] cursor-nesw-resize' },
    {
      corner: 'sw',
      className: 'bottom-[-16px] left-[-16px] cursor-nesw-resize',
    },
    {
      corner: 'se',
      className: 'bottom-[-16px] right-[-16px] cursor-nwse-resize',
    },
  ];

  return (
    <div
      data-node-id={props.node.id}
      className={cx(
        'group absolute rounded-xl border-2 shadow-md transition-[border-color,box-shadow] flex flex-col',
        borderColor,
        backgroundClass,
        selectedShadow,
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
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        props.onContextMenu?.(e)
      }}
    >
      {/* 头部：显示节点标题，双击可重命名 */}
      <div
        className='flex min-h-7 items-center gap-2 px-2.5 py-1 text-[11px] font-medium text-[var(--glass-text-tertiary)] border-b border-[var(--glass-stroke-soft)] cursor-grab select-none'
        onDoubleClick={() => {
          setDraftTitle(props.node.title || nodeTypeLabel(props.node.type));
          setEditingTitle(true);
        }}
      >
        {editingTitle ? (
          <input
            autoFocus
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={() => {
              if (titleSavedRef.current) {
                titleSavedRef.current = false;
                return;
              }
              props.onUpdate({
                title: draftTitle.trim() || nodeTypeLabel(props.node.type),
              });
              setEditingTitle(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                titleSavedRef.current = true;
                props.onUpdate({
                  title: draftTitle.trim() || nodeTypeLabel(props.node.type),
                });
                setEditingTitle(false);
              } else if (e.key === 'Escape') {
                setEditingTitle(false);
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className='w-full min-w-0 bg-transparent outline-none border-b border-dashed border-[var(--glass-tone-info-fg)] text-[var(--glass-text-primary)]'
          />
        ) : (
          <span className='truncate'>
            {props.node.title || nodeTypeLabel(props.node.type)}
          </span>
        )}
      </div>

      {/* 内容区 */}
      <div
        className={cx(
          'relative min-h-0 flex-1 overflow-hidden',
          props.node.type === 'config' && 'p-2 space-y-2 overflow-y-auto',
          props.node.type === 'text' && 'p-0',
          (props.node.type === 'image' ||
            props.node.type === 'textAnnotation') &&
            'p-2',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {props.node.type === 'text' && (
          <div className='relative h-full w-full'>
            {/* 工具栏：Markdown 切换 + AI 生成 */}
            <div
              className='absolute right-1 top-1 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100'
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type='button'
                title={
                  props.node.renderMode === 'markdown'
                    ? t('canvas.textNode.toPlain')
                    : t('canvas.textNode.toMarkdown')
                }
                onClick={() => props.onToggleRenderMode(props.node.id)}
                className='inline-flex items-center justify-center rounded-md bg-[var(--glass-bg-surface-strong)]/90 p-1 text-[var(--glass-text-secondary)] shadow-sm transition-colors hover:bg-[var(--glass-bg-muted)] hover:text-[var(--glass-text-primary)]'
              >
                <span className='text-[10px] font-bold'>
                  {props.node.renderMode === 'markdown' ? 'Tx' : 'Md'}
                </span>
              </button>
              <button
                type='button'
                title={t('canvas.textNode.aiGenerate')}
                onClick={() => props.onAiGenerate(props.node.id)}
                disabled={props.aiGenerating}
                className='inline-flex items-center justify-center rounded-md bg-[var(--glass-bg-surface-strong)]/90 p-1 text-[var(--glass-text-secondary)] shadow-sm transition-colors hover:bg-[var(--glass-bg-muted)] hover:text-[var(--glass-text-primary)] disabled:opacity-50'
              >
                {props.aiGenerating ? (
                  <StudioSpinner className='w-3 h-3' />
                ) : (
                  <AppIcon name='sparkles' className='w-3 h-3' />
                )}
              </button>
            </div>

            {/* 内容 + 提示词 */}
            <div className='flex h-full flex-col gap-0'>
              {props.node.renderMode === 'markdown' ? (
                <div className='min-h-0 flex-1 overflow-auto px-2.5 py-1.5 text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_h1]:text-base [&_h1]:font-bold [&_h2]:text-sm [&_h2]:font-bold [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--glass-stroke-strong)] [&_blockquote]:pl-2 [&_blockquote]:italic [&_code]:rounded [&_code]:bg-[var(--glass-bg-muted)] [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-[var(--glass-bg-muted)] [&_pre]:p-2 [&_a]:text-[var(--glass-tone-info-fg)] [&_a]:underline'>
                  <MarkdownRenderer content={props.node.text || ''} />
                </div>
              ) : (
                <textarea
                  value={props.node.text || ''}
                  onChange={(e) => props.onUpdate({ text: e.target.value })}
                  placeholder={t('canvas.textNode.contentPlaceholder')}
                  className='min-h-0 w-full flex-1 cursor-text resize-none bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-[var(--glass-text-tertiary)]'
                />
              )}
              {/* 底部提示词输入 */}
              <div className='border-t border-[var(--glass-stroke-soft)] px-2.5 py-1'>
                <input
                  type='text'
                  value={props.node.prompt || ''}
                  onChange={(e) => props.onUpdate({ prompt: e.target.value })}
                  placeholder={t('canvas.textNode.promptPlaceholder')}
                  className='w-full bg-transparent text-xs outline-none placeholder:text-[var(--glass-text-tertiary)]'
                />
              </div>
            </div>
          </div>
        )}

        {props.node.type === 'textAnnotation' && (
          <textarea
            value={props.node.text || ''}
            onChange={(e) => props.onUpdate({ text: e.target.value })}
            rows={4}
            className='w-full h-[calc(100%-24px)] bg-transparent text-sm text-[var(--glass-text-primary)] outline-none resize-none'
          />
        )}

        {props.node.type === 'image' && (
          <>
            {props.node.content ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={props.node.content}
                alt=''
                className='w-full h-[calc(100%-8px)] rounded-lg object-contain'
                onDragStart={(e) => e.preventDefault()}
              />
            ) : (
              <div className='flex flex-col items-center justify-center gap-2 h-[calc(100%-8px)] border border-dashed border-[var(--glass-stroke-soft)] rounded-lg'>
                <input
                  ref={fileInputRef}
                  type='file'
                  accept='image/*'
                  multiple
                  className='hidden'
                  onChange={(e) => {
                    if (e.target.files)
                      void props.onUploadImage(Array.from(e.target.files));
                    e.target.value = '';
                  }}
                />
                <button
                  type='button'
                  onClick={() => fileInputRef.current?.click()}
                  className='flex flex-col items-center gap-2'
                >
                  <AppIcon
                    name='upload'
                    className='w-5 h-5 text-[var(--glass-text-tertiary)]'
                  />
                  <span className='text-xs text-[var(--glass-text-tertiary)]'>
                    {t('canvas.imageNode.uploadImage')}
                  </span>
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
        <div
          className='absolute top-0.5 right-0.5 flex items-center gap-1 z-20 opacity-100'
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type='button'
            title={t('canvas.toolbar.delete')}
            onClick={(e) => {
              e.stopPropagation();
              props.onDelete();
            }}
            className='glass-btn-base glass-btn-ghost p-1 rounded bg-[var(--glass-bg-surface-strong)]/90 text-[var(--glass-tone-danger-fg)]'
          >
            <AppIcon name='trash' className='w-3 h-3' />
          </button>
        </div>
      )}

      {/* 左右连接手柄（z-30 确保浮于节点内容之上可点击，按住拖拽到目标节点松手即可连线） */}
      <button
        type='button'
        aria-label='连接输出'
        className={cx(
          'absolute top-1/2 -right-3.5 grid w-7 h-7 -translate-y-1/2 place-items-center transition-opacity z-30',
          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
        onPointerDown={(e) => {
          props.onConnectStart(e, 'source');
        }}
      >
        <span className='w-3 h-3 rounded-full border-2 border-[var(--glass-bg-surface-strong)] bg-[var(--glass-tone-info-fg)] shadow-sm' />
      </button>
      <button
        type='button'
        aria-label='连接输入'
        className={cx(
          'absolute top-1/2 -left-3.5 grid w-7 h-7 -translate-y-1/2 place-items-center transition-opacity z-30',
          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
        onPointerDown={(e) => {
          props.onConnectStart(e, 'target');
        }}
      >
        <span className='w-3 h-3 rounded-full border-2 border-[var(--glass-bg-surface-strong)] bg-[var(--glass-text-tertiary)] shadow-sm' />
      </button>

      {/* 缩放手柄（选中显示） */}
      {isSelected &&
        resizeCorners.map(({ corner, className }) => (
          <div
            key={corner}
            className={cx(
              'absolute w-6 h-6 grid place-items-center',
              className,
            )}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              props.onResizeStart(props.node.id, corner, e);
            }}
          >
            <span className='w-3 h-3 rounded-sm border-2 border-[var(--glass-tone-info-fg)] bg-[var(--glass-bg-surface-strong)] shadow-sm' />
          </div>
        ))}
    </div>
  );
}

function nodeTypeLabel(type: CanvasNodeType): string {
  const labels: Record<CanvasNodeType, string> = {
    image: 'Image',
    text: 'Text',
    config: 'Config',
    textAnnotation: 'Note',
  };
  return labels[type];
}

/** 画布背景（网格/圆点），随视口偏移与缩放同步 */
function CanvasBackground(props: {
  mode: 'lines' | 'dots';
  view: { x: number; y: number; zoom: number };
}) {
  const size = 48 * props.view.zoom;
  const offsetX = ((props.view.x % size) + size) % size;
  const offsetY = ((props.view.y % size) + size) % size;

  return (
    <div
      className='absolute inset-0 pointer-events-none'
      style={{
        backgroundImage:
          props.mode === 'dots'
            ? 'radial-gradient(circle, color-mix(in srgb, var(--muted-foreground) 30%, transparent) 1.2px, transparent 1.4px)'
            : 'linear-gradient(color-mix(in srgb, var(--muted-foreground) 16%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--muted-foreground) 16%, transparent) 1px, transparent 1px)',
        backgroundSize: `${size}px ${size}px`,
        backgroundPosition: `${offsetX}px ${offsetY}px`,
      }}
    />
  );
}

/** Markdown 渲染（react-markdown + remark-gfm） */
function MarkdownRenderer({ content }: { content: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>;
}

function ConfigNodeBody(props: {
  node: CanvasNode;
  imageModels: ReturnType<typeof useStudioModels>['imageModels'];
  running: boolean;
  onUpdate: (patch: Partial<CanvasNode>) => void;
  onRun: () => void;
}) {
  const t = useTranslations('imageStudio');
  const config = props.node.genConfig || {
    model: '',
    outputSize: '1K',
    aspectRatio: '1:1',
    count: 1,
  };

  const sizeOptions = useMemo(() => {
    const model = props.imageModels.find((item) => item.value === config.model);
    return getStudioOutputSizeOptions(model).map((size) => ({
      value: size,
      label: size,
    }));
  }, [props.imageModels, config.model]);

  const updateConfig = (
    patch: Partial<NonNullable<CanvasNode['genConfig']>>,
  ) => {
    props.onUpdate({ genConfig: { ...config, ...patch } });
  };

  return (
    <div className='space-y-2'>
      <textarea
        value={props.node.composerContent || ''}
        onChange={(e) => props.onUpdate({ composerContent: e.target.value })}
        placeholder={t('canvas.configNode.promptPlaceholder')}
        rows={3}
        className='glass-textarea-base w-full px-2 py-1.5 text-xs'
      />
      <select
        value={config.model}
        onChange={(e) => updateConfig({ model: e.target.value })}
        className='glass-select-base px-2 py-1.5 text-xs w-full'
      >
        <option value=''>{t('canvas.configNode.model')}</option>
        {props.imageModels.map((model) => (
          <option key={model.value} value={model.value}>
            {model.label}
          </option>
        ))}
      </select>
      <div className='grid grid-cols-2 gap-2'>
        <select
          value={config.outputSize}
          onChange={(e) => updateConfig({ outputSize: e.target.value })}
          className='glass-select-base px-2 py-1.5 text-xs'
        >
          {sizeOptions.map((size) => (
            <option key={size.value} value={size.value}>
              {size.label}
            </option>
          ))}
        </select>
        <select
          value={config.aspectRatio}
          onChange={(e) => updateConfig({ aspectRatio: e.target.value })}
          className='glass-select-base px-2 py-1.5 text-xs'
        >
          <option value='1:1'>1:1</option>
          <option value='16:9'>16:9</option>
          <option value='9:16'>9:16</option>
          <option value='3:2'>3:2</option>
          <option value='2:3'>2:3</option>
        </select>
      </div>
      <div className='flex items-center justify-between gap-2'>
        <label className='text-xs text-[var(--glass-text-secondary)]'>
          {t('canvas.configNode.count')}
        </label>
        <select
          value={config.count}
          onChange={(e) => updateConfig({ count: Number(e.target.value) })}
          className='glass-select-base px-2 py-1 text-xs'
        >
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <button
        type='button'
        onClick={props.onRun}
        disabled={props.running}
        className='glass-btn-base glass-btn-tone-info w-full py-1.5 text-xs flex items-center justify-center gap-1.5 disabled:opacity-50'
      >
        {props.running ? (
          <StudioSpinner />
        ) : (
          <AppIcon name='sparkles' className='w-3 h-3' />
        )}
        {props.running
          ? t('canvas.configNode.running')
          : t('canvas.configNode.run')}
      </button>
    </div>
  );
}
