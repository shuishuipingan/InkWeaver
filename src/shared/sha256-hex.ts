/** Browser-safe SHA-256 hex digest (also works in Node 18+). */
export async function sha256Hex(value: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error('当前环境不支持 SHA-256 摘要')
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}