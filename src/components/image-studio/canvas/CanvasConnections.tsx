/**
 * 画布连线渲染
 *
 * 使用 SVG 三次贝塞尔曲线绘制节点间连线。
 * 注：此处内联 SVG 属于画布连线绘制的必要实现，已显式豁免 no-restricted-syntax 规则。
 */

/* eslint-disable no-restricted-syntax */

'use client'

export interface ConnectionPath {
  key: string
  d: string
}

export default function CanvasConnections(props: {
  paths: ConnectionPath[]
  zoom: number
  offsetX: number
  offsetY: number
}) {
  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{
        transform: `scale(${props.zoom}) translate(${props.offsetX}px, ${props.offsetY}px)`,
      }}
    >
      {props.paths.map((path) => (
        <path
          key={path.key}
          d={path.d}
          fill="none"
          stroke="var(--glass-tone-info-fg)"
          strokeWidth={2}
          strokeOpacity={0.6}
        />
      ))}
    </svg>
  )
}
