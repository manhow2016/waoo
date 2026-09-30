/**
 * 供应商主键解析（叶模块）
 *
 * providerId 支持带实例后缀的形式，例如 `gemini-compatible:uuid`，
 * 其 provider key 为 `gemini-compatible`。
 *
 * 之所以单独成模块：本函数同时被配置读取层（src/lib/api-config.ts）与
 * 会员准入层（src/lib/provider-access.ts）使用。若放在 api-config 中，
 * 准入层会在 api-config 内引入 api-config ⇄ provider-access 的循环依赖。
 */
export function getProviderKey(providerId?: string): string {
  if (!providerId) return ''
  const colonIndex = providerId.indexOf(':')
  return colonIndex === -1 ? providerId : providerId.slice(0, colonIndex)
}
