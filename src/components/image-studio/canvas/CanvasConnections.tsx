/**
 * 画布连线渲染
 *
 * 使用 SVG 三次贝塞尔曲线绘制节点间连线。
 * 路径坐标为世界坐标，组件放在世界坐标 div 内部，与节点共享 transform。
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
  /** 连接拖拽中的实时预览线（虚线，世界坐标） */
  activePath?: string | null
  /** 连线右键点击回调 */
  onConnectionContextMenu?: (connectionId: string, e: React.MouseEvent) => void
}) {
  return (
    <svg
      className="pointer-events-none absolute overflow-visible"
      style={{
        width: 1,
        height: 1,
        left: 0,
        top: 0,
      }}
    >
      {props.paths.map((path) => (
        <g key={path.key}>
          {/* 透明宽路径，用于点击检测 */}
          <path
            data-connection-id={path.key}
            d={path.d}
            stroke="transparent"
            strokeWidth="16"
            fill="none"
            style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              props.onConnectionContextMenu?.(path.key, e)
            }}
          />
          {/* 可见路径 */}
          <path
            d={path.d}
            fill="none"
            stroke="var(--glass-tone-info-fg)"
            strokeWidth={2}
            strokeOpacity={0.6}
            style={{ pointerEvents: 'none' }}
          />
        </g>
      ))}
      {props.activePath && (
        <path
          d={props.activePath}
          fill="none"
          stroke="var(--glass-tone-info-fg)"
          strokeWidth={2}
          strokeDasharray="5,5"
        />
      )}
    </svg>
  )
}
