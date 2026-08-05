/**
 * nova-image-studio API 代理路由
 * 将请求转发到 nova-image-studio 后端服务
 */
import { NextRequest, NextResponse } from 'next/server'

// nova-image-studio 后端地址，从环境变量读取
const NOVA_IMAGE_STUDIO_BASE_URL = process.env.NOVA_IMAGE_STUDIO_URL || 'http://localhost:3001'

// 代理超时时间（30分钟，与 nova-image-studio 保持一致）
const PROXY_TIMEOUT_MS = 30 * 60 * 1000

/**
 * 构建目标 URL
 */
function buildTargetUrl(path: string[], searchParams: URLSearchParams): string {
  const pathStr = path.join('/')
  const queryString = searchParams.toString()
  const targetPath = `/api/nova/${pathStr}`
  return queryString
    ? `${NOVA_IMAGE_STUDIO_BASE_URL}${targetPath}?${queryString}`
    : `${NOVA_IMAGE_STUDIO_BASE_URL}${targetPath}`
}

/**
 * 转发请求到 nova-image-studio 后端
 */
async function proxyRequest(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path } = await params
  const url = new URL(request.url)
  const targetUrl = buildTargetUrl(path, url.searchParams)

  try {
    // 构建请求头
    const headers: Record<string, string> = {
      'Content-Type': request.headers.get('Content-Type') || 'application/json',
    }

    // 转发请求体
    const init: RequestInit = {
      method: request.method,
      headers,
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = await request.text()
    }

    // 使用 AbortController 实现超时
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS)
    init.signal = controller.signal

    const response = await fetch(targetUrl, init)
    clearTimeout(timeoutId)

    // 获取响应内容
    const contentType = response.headers.get('Content-Type') || ''
    
    // 对于图片等二进制内容，直接返回
    if (contentType.startsWith('image/') || contentType.startsWith('application/octet-stream')) {
      const buffer = await response.arrayBuffer()
      return new NextResponse(buffer, {
        status: response.status,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
    }

    // 对于 JSON 响应
    if (contentType.includes('application/json')) {
      const data = await response.json()
      return NextResponse.json(data, { status: response.status })
    }

    // 对于其他文本响应
    const text = await response.text()
    return new NextResponse(text, {
      status: response.status,
      headers: { 'Content-Type': contentType },
    })
  } catch (error) {
    console.error('[nova-image-studio proxy] Error:', error)
    
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: '请求超时，请稍后重试' },
        { status: 504 }
      )
    }

    return NextResponse.json(
      { error: '代理请求失败', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 502 }
    )
  }
}

// 导出所有 HTTP 方法的处理器
export const GET = proxyRequest
export const POST = proxyRequest
export const PUT = proxyRequest
export const DELETE = proxyRequest
export const PATCH = proxyRequest
