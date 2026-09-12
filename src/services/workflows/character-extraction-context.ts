const DEFAULT_HEAD_RATIO = 0.35
const ELLIPSIS = '\n\n[中间正文已省略，保留开头与结尾用于人物状态提取]\n\n'

/**
 * Keeps late chapter appearances visible to character extraction while
 * bounding the prompt. The full text remains the source of truth; this is
 * only a model-input window.
 */
export function buildCharacterExtractionContext(
  content: string,
  maxCharacters: number,
): string {
  if (!Number.isSafeInteger(maxCharacters) || maxCharacters <= 0) {
    throw new Error('人物提取上下文上限无效')
  }
  if (content.length <= maxCharacters) return content
  if (maxCharacters <= ELLIPSIS.length + 2) return content.slice(0, maxCharacters)

  const available = maxCharacters - ELLIPSIS.length
  const headLength = Math.max(1, Math.floor(available * DEFAULT_HEAD_RATIO))
  const tailLength = Math.max(1, available - headLength)
  return `${content.slice(0, headLength)}${ELLIPSIS}${content.slice(-tailLength)}`.slice(0, maxCharacters)
}
