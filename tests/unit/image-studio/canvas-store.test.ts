import { describe, expect, it } from 'vitest'
import {
  createNode,
  connectNodes,
  deleteNode,
  collectUpstreamResources,
  composeConfigPrompt,
  type CanvasNode,
  type CanvasConnection,
} from '@/components/image-studio/canvas/canvas-store'

function makeText(id: string, text: string): CanvasNode {
  return {
    id,
    type: 'text',
    x: 0,
    y: 0,
    width: 200,
    height: 140,
    text,
    prompt: '',
  }
}

function makeImage(id: string, content: string): CanvasNode {
  return {
    id,
    type: 'image',
    x: 0,
    y: 0,
    width: 220,
    height: 180,
    content,
  }
}

function makeConfig(id: string): CanvasNode {
  return {
    id,
    type: 'config',
    x: 0,
    y: 0,
    width: 260,
    height: 260,
    composerContent: '',
    genConfig: { model: 'google::gemini-3-pro-image-preview', outputSize: '1K', aspectRatio: '1:1', count: 1 },
  }
}

describe('canvas-store node helpers', () => {
  it('creates a text node with defaults', () => {
    const node = createNode('text', 10, 20)
    expect(node.type).toBe('text')
    expect(node.x).toBe(10)
    expect(node.y).toBe(20)
    expect(node.text).toBe('')
    expect(node.id).toMatch(/^node_/)
  })

  it('creates a config node with default genConfig', () => {
    const node = createNode('config', 0, 0)
    expect(node.type).toBe('config')
    expect(node.genConfig).toEqual({
      model: '',
      outputSize: '1K',
      aspectRatio: '1:1',
      count: 1,
    })
  })

  it('toggles connections on same pair', () => {
    const a = makeText('a', 'hello')
    const b = makeText('b', 'world')
    const nodes = [a, b]
    const first = connectNodes(nodes, [], 'a', 'b')
    expect(first.connections).toHaveLength(1)
    const second = connectNodes(first.nodes, first.connections, 'a', 'b')
    expect(second.connections).toHaveLength(0)
  })

  it('rejects self connections', () => {
    const a = makeText('a', 'hello')
    const result = connectNodes([a], [], 'a', 'a')
    expect(result.connections).toHaveLength(0)
  })

  it('deletes node and its connections', () => {
    const a = makeText('a', 'hello')
    const b = makeText('b', 'world')
    const connected = connectNodes([a, b], [], 'a', 'b')
    const result = deleteNode(connected.nodes, connected.connections, 'a')
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0].id).toBe('b')
    expect(result.connections).toHaveLength(0)
  })
})

describe('canvas-store upstream resource collection', () => {
  it('collects text and image nodes upstream of config node via BFS', () => {
    const config = makeConfig('cfg')
    const textA = makeText('t1', '少年在雪原奔跑')
    const textB = makeText('t2', '黄昏的光')
    const image = makeImage('img', 'data:image/png;base64,AAAA')
    const nodes = [config, textA, textB, image]
    const connections: CanvasConnection[] = [
      { id: 'c1', fromNodeId: 't1', toNodeId: 'cfg' },
      { id: 'c2', fromNodeId: 'img', toNodeId: 'cfg' },
      { id: 'c3', fromNodeId: 't2', toNodeId: 't1' },
    ]

    const upstream = collectUpstreamResources(nodes, connections, 'cfg')
    expect(upstream.texts.map((item) => item.node.id).sort()).toEqual(['t1', 't2'])
    expect(upstream.images.map((item) => item.node.id)).toEqual(['img'])
  })

  it('composes final prompt with text blocks and reference images', () => {
    const config = makeConfig('cfg')
    const textA = makeText('t1', '一个赛博朋克风格的街景')
    const image = makeImage('img', 'data:image/png;base64,AAAA')
    const nodes = [config, textA, image]
    const connections: CanvasConnection[] = [
      { id: 'c1', fromNodeId: 't1', toNodeId: 'cfg' },
      { id: 'c2', fromNodeId: 'img', toNodeId: 'cfg' },
    ]
    const upstream = collectUpstreamResources(nodes, connections, 'cfg')

    const { prompt, referenceImages } = composeConfigPrompt('基于以上内容，生成最终画面', upstream)
    expect(prompt).toContain('【文本1】')
    expect(prompt).toContain('一个赛博朋克风格的街景')
    expect(prompt).toContain('参考图')
    expect(referenceImages).toEqual(['data:image/png;base64,AAAA'])
  })

  it('resolves inline @[node:<id>] tokens', () => {
    const config = makeConfig('cfg')
    const textA = makeText('t1', '少女眺望远方')
    const nodes = [config, textA]
    const connections: CanvasConnection[] = [{ id: 'c1', fromNodeId: 't1', toNodeId: 'cfg' }]
    const upstream = collectUpstreamResources(nodes, connections, 'cfg')

    const { prompt } = composeConfigPrompt('@[node:t1] 的背影', upstream)
    expect(prompt).toContain('【文本1】 的背影')
  })
})
