/**
 * DashScope baseUrl 归一化。
 *
 * 背景：项目在设置中心给 bailian 配的默认 baseUrl 是 **OpenAI 兼容地址**
 * `https://dashscope.aliyuncs.com/compatible-mode/v1`，它只适用于
 * `/chat/completions` 这类兼容端点。
 *
 * 而声音设计、语音合成、视频合成等走的是 **DashScope 原生 API**，路径形如
 * `/api/v1/services/...`。若直接把兼容地址当根拼接，会得到
 * `https://dashscope.aliyuncs.com/compatible-mode/v1/services/audio/tts/customization`，
 * 该路径不存在，服务端返回 404。
 *
 * 因此这里统一把 baseUrl 归一化成原生 API 根 `{origin}/api/v1`：
 * - 空值 → 官方原生根
 * - 含 `/compatible-mode/` → 取 origin 后拼 `/api/v1`
 * - 已含 `/api/v1` → 原样保留
 * - 其它（如用户自建反代 `https://proxy.example.com/dashscope`）→ 末尾补 `/api/v1`
 */
const DASHSCOPE_NATIVE_API_BASE = 'https://dashscope.aliyuncs.com/api/v1'

export function resolveDashScopeNativeBaseUrl(baseUrl?: string): string {
  const trimmed = typeof baseUrl === 'string' ? baseUrl.trim() : ''
  if (!trimmed) return DASHSCOPE_NATIVE_API_BASE

  const withoutTrailingSlash = trimmed.replace(/\/+$/, '')
  if (!withoutTrailingSlash) return DASHSCOPE_NATIVE_API_BASE

  // 兼容模式地址：只保留 origin，回到原生 API 根
  const compatibleModeIndex = withoutTrailingSlash.indexOf('/compatible-mode/')
  if (compatibleModeIndex !== -1) {
    const origin = withoutTrailingSlash.slice(0, compatibleModeIndex)
    return origin ? `${origin}/api/v1` : DASHSCOPE_NATIVE_API_BASE
  }

  // 已经是原生 API 根
  if (withoutTrailingSlash.endsWith('/api/v1')) return withoutTrailingSlash

  // 未知形态：视作服务根，补上 /api/v1
  return `${withoutTrailingSlash}/api/v1`
}
