import type { Rect } from "../draw"
import { font, theme } from "../theme"
import { measureTextWidth } from "./rich"

export type TextGeometryConfig = {
  value: string
  rect: Rect
  padX?: number
  scrollX?: number
}

export function textGeometryFont() {
  return font(theme, theme.typography.body)
}

export function measureTextPrefix(ctx: CanvasRenderingContext2D, value: string, index: number) {
  const prefix = value.slice(0, Math.max(0, Math.min(value.length, index)))
  return measureTextWidth(ctx, prefix, textGeometryFont())
}

export function resolveTextIndexFromPoint(ctx: CanvasRenderingContext2D, config: TextGeometryConfig, x: number) {
  const padX = config.padX ?? 8
  const localX = x - config.rect.x - padX + (config.scrollX ?? 0)
  if (localX <= 0) return 0
  let bestIndex = config.value.length
  let bestDistance = Number.POSITIVE_INFINITY
  ctx.save()
  ctx.font = textGeometryFont()
  for (let i = 0; i <= config.value.length; i++) {
    const width = measureTextPrefix(ctx, config.value, i)
    const distance = Math.abs(width - localX)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = i
    }
  }
  ctx.restore()
  return bestIndex
}

export function ensureTextCaretVisible(ctx: CanvasRenderingContext2D, config: TextGeometryConfig, caretIndex: number, innerW: number) {
  const caretX = measureTextPrefix(ctx, config.value, caretIndex)
  let scrollX = Math.max(0, config.scrollX ?? 0)
  if (caretX - scrollX > innerW) scrollX = caretX - innerW
  if (caretX - scrollX < 0) scrollX = caretX
  return Math.max(0, scrollX)
}
