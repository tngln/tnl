import { LineOp, RectOp, TextOp, draw, measureTextWidth, truncateToWidth, type FillStyle, type Paint, type Rect, type ShadowStyle, type StrokeStyle } from "../draw"
import { iconToShape, type IconDef } from "../icons"
import { font, theme } from "../theme"
import type { ControlState } from "./control"

export type VisualContext = {
  state: ControlState
  selected?: boolean
  checked?: boolean
  disabled?: boolean
}

export type EdgeInsets = {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

export type VisualImageSource =
  | { kind: "icon"; icon: IconDef }
  | { kind: "glyph"; text: string }
  | { kind: "bitmap"; image: CanvasImageSource | ImageBitmap | HTMLImageElement }

export type LineAnchor = {
  x: number
  y: number
  relative?: boolean
}

type VisualLayoutStyle = {
  axis?: "row" | "column" | "overlay"
  gap?: number
  padding?: number | EdgeInsets
  align?: "start" | "center" | "end"
  justify?: "start" | "center" | "end" | "between"
  minW?: number
  minH?: number
  fixedW?: number
  fixedH?: number
  grow?: boolean
  overlay?: {
    anchor?: "parent" | "content"
    inset?: Partial<EdgeInsets>
    x?: number
    y?: number
  }
}

type VisualPaintStyle = {
  fill?: Paint
  opacity?: number
}

type VisualBorderStyle = {
  color?: string | null
  width?: number
  radius?: number
}

type VisualTextStyle = {
  color?: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: number
  lineHeight?: number
  align?: CanvasTextAlign
  baseline?: CanvasTextBaseline
  truncate?: boolean
}

type VisualImageStyle = {
  color?: string
  fit?: "contain" | "cover" | "stretch"
  width?: number
  height?: number
  tint?: string
}

type VisualLineStyle = {
  color?: string
  width?: number
  cap?: CanvasLineCap
  dash?: number[]
}

type VisualEffectsStyle = {
  shadow?: ShadowStyle
  clip?: boolean
}

export type VisualStyleLayer = {
  layout?: VisualLayoutStyle
  paint?: VisualPaintStyle
  border?: VisualBorderStyle
  text?: VisualTextStyle
  image?: VisualImageStyle
  line?: VisualLineStyle
  effects?: VisualEffectsStyle
}

export type VisualStyle = {
  base?: VisualStyleLayer
  hover?: VisualStyleLayer
  pressed?: VisualStyleLayer
  disabled?: VisualStyleLayer
  selected?: VisualStyleLayer
  checked?: VisualStyleLayer
}

export type VisualStyleInput = VisualStyleLayer | VisualStyle

export type VisualNode =
  | {
      kind: "box"
      children?: VisualNode[]
      style?: VisualStyleInput
    }
  | {
      kind: "text"
      text: string
      style?: VisualStyleInput
    }
  | {
      kind: "image"
      source: VisualImageSource
      style?: VisualStyleInput
    }
  | {
      kind: "line"
      from?: LineAnchor
      to?: LineAnchor
      style?: VisualStyleInput
    }

type ResolvedVisualStyle = {
  layout: Required<Pick<VisualLayoutStyle, "axis" | "gap" | "align" | "justify" | "grow">> & Omit<VisualLayoutStyle, "axis" | "gap" | "align" | "justify" | "grow">
  paint: VisualPaintStyle
  border: Required<Pick<VisualBorderStyle, "width" | "radius">> & Omit<VisualBorderStyle, "width" | "radius">
  text: Required<Pick<VisualTextStyle, "color" | "fontFamily" | "fontSize" | "fontWeight" | "lineHeight" | "align" | "baseline" | "truncate">>
  image: Required<Pick<VisualImageStyle, "color" | "fit">> & Omit<VisualImageStyle, "color" | "fit">
  line: Required<Pick<VisualLineStyle, "color" | "width" | "cap">> & Omit<VisualLineStyle, "color" | "width" | "cap">
  effects: VisualEffectsStyle
}

type MeasureResult = {
  w: number
  h: number
}

function asInsets(padding: number | EdgeInsets | undefined): Required<EdgeInsets> {
  if (typeof padding === "number") return { top: padding, right: padding, bottom: padding, left: padding }
  return {
    top: padding?.top ?? 0,
    right: padding?.right ?? 0,
    bottom: padding?.bottom ?? 0,
    left: padding?.left ?? 0,
  }
}

function mergeInsets(base: number | EdgeInsets | undefined, patch: number | EdgeInsets | undefined) {
  if (patch === undefined) return base
  if (base === undefined) return patch
  const a = asInsets(base)
  const b = asInsets(patch)
  return {
    top: b.top ?? a.top,
    right: b.right ?? a.right,
    bottom: b.bottom ?? a.bottom,
    left: b.left ?? a.left,
  }
}

function mergeLayer(base: VisualStyleLayer | undefined, patch: VisualStyleLayer | undefined): VisualStyleLayer | undefined {
  if (!base && !patch) return undefined
  const baseOverlay = base?.layout?.overlay
  const patchOverlay = patch?.layout?.overlay
  return {
    layout: {
      ...(base?.layout ?? {}),
      ...(patch?.layout ?? {}),
      padding: mergeInsets(base?.layout?.padding, patch?.layout?.padding),
      overlay: baseOverlay || patchOverlay
        ? {
            ...(baseOverlay ?? {}),
            ...(patchOverlay ?? {}),
            inset: {
              ...(baseOverlay?.inset ?? {}),
              ...(patchOverlay?.inset ?? {}),
            },
          }
        : undefined,
    },
    paint: { ...(base?.paint ?? {}), ...(patch?.paint ?? {}) },
    border: { ...(base?.border ?? {}), ...(patch?.border ?? {}) },
    text: { ...(base?.text ?? {}), ...(patch?.text ?? {}) },
    image: { ...(base?.image ?? {}), ...(patch?.image ?? {}) },
    line: { ...(base?.line ?? {}), ...(patch?.line ?? {}) },
    effects: { ...(base?.effects ?? {}), ...(patch?.effects ?? {}) },
  }
}

export function mergeVisualStyles(...styles: Array<VisualStyleInput | undefined>): VisualStyleInput | undefined {
  let baseLayer: VisualStyleLayer | undefined
  let baseVariants: VisualStyle | undefined
  for (const style of styles) {
    if (!style) continue
    if (isVariantStyle(style)) {
      baseVariants = {
        base: mergeLayer(baseVariants?.base, style.base),
        hover: mergeLayer(baseVariants?.hover, style.hover),
        pressed: mergeLayer(baseVariants?.pressed, style.pressed),
        disabled: mergeLayer(baseVariants?.disabled, style.disabled),
        selected: mergeLayer(baseVariants?.selected, style.selected),
        checked: mergeLayer(baseVariants?.checked, style.checked),
      }
      continue
    }
    baseLayer = mergeLayer(baseLayer, style)
  }
  if (baseVariants) {
    return {
      ...baseVariants,
      base: mergeLayer(baseLayer, baseVariants.base),
    }
  }
  return baseLayer
}

function isVariantStyle(style: VisualStyleInput | undefined): style is VisualStyle {
  if (!style) return false
  return "base" in style || "hover" in style || "pressed" in style || "disabled" in style || "selected" in style || "checked" in style
}


function resolveStyle(style: VisualStyleInput | undefined, ctx: VisualContext): ResolvedVisualStyle {
  const variantStyle = isVariantStyle(style) ? style : { base: style }
  const merged = mergeLayer(
    mergeLayer(
      mergeLayer(
        mergeLayer(
          mergeLayer(variantStyle.base, ctx.state.hover ? variantStyle.hover : undefined),
          ctx.state.pressed ? variantStyle.pressed : undefined,
        ),
        (ctx.disabled ?? ctx.state.disabled) ? variantStyle.disabled : undefined,
      ),
      ctx.selected ? variantStyle.selected : undefined,
    ),
    ctx.checked ? variantStyle.checked : undefined,
  ) ?? {}

  return {
    layout: {
      axis: merged.layout?.axis ?? "overlay",
      gap: merged.layout?.gap ?? 0,
      align: merged.layout?.align ?? "start",
      justify: merged.layout?.justify ?? "start",
      grow: merged.layout?.grow ?? false,
      padding: merged.layout?.padding,
      minW: merged.layout?.minW,
      minH: merged.layout?.minH,
      fixedW: merged.layout?.fixedW,
      fixedH: merged.layout?.fixedH,
      overlay: merged.layout?.overlay,
    },
    paint: {
      fill: merged.paint?.fill,
      opacity: merged.paint?.opacity,
    },
    border: {
      color: merged.border?.color,
      width: merged.border?.width ?? 1,
      radius: merged.border?.radius ?? 0,
    },
    text: {
      color: merged.text?.color ?? (ctx.disabled ? theme.colors.textMuted : theme.colors.text),
      fontFamily: merged.text?.fontFamily ?? theme.typography.family,
      fontSize: merged.text?.fontSize ?? theme.typography.body.size,
      fontWeight: merged.text?.fontWeight ?? theme.typography.body.weight,
      lineHeight: merged.text?.lineHeight ?? theme.spacing.lg,
      align: merged.text?.align ?? "start",
      baseline: merged.text?.baseline ?? "top",
      truncate: merged.text?.truncate ?? false,
    },
    image: {
      color: merged.image?.color ?? (ctx.disabled ? theme.colors.textMuted : theme.colors.text),
      fit: merged.image?.fit ?? "contain",
      width: merged.image?.width,
      height: merged.image?.height,
      tint: merged.image?.tint,
    },
    line: {
      color: merged.line?.color ?? theme.colors.text,
      width: merged.line?.width ?? 1,
      cap: merged.line?.cap ?? "butt",
      dash: merged.line?.dash,
    },
    effects: {
      shadow: merged.effects?.shadow,
      clip: merged.effects?.clip,
    },
  }
}

function textFontSpec(style: ResolvedVisualStyle["text"]) {
  return font(theme, { size: style.fontSize, weight: style.fontWeight })
}

function imageSize(style: ResolvedVisualStyle["image"]) {
  return { w: style.width ?? 12, h: style.height ?? 12 }
}

function paddedRect(rect: Rect, padding: number | EdgeInsets | undefined) {
  const inset = asInsets(padding)
  return {
    x: rect.x + inset.left,
    y: rect.y + inset.top,
    w: Math.max(0, rect.w - inset.left - inset.right),
    h: Math.max(0, rect.h - inset.top - inset.bottom),
  }
}

function absolutePoint(rect: Rect, anchor: LineAnchor | undefined, fallback: { x: number; y: number }) {
  if (!anchor) return fallback
  if (anchor.relative === false) return { x: anchor.x, y: anchor.y }
  return {
    x: rect.x + anchor.x * rect.w,
    y: rect.y + anchor.y * rect.h,
  }
}

function childRectForOverlay(parentRect: Rect, contentRect: Rect, style: ResolvedVisualStyle["layout"]) {
  const overlay = style.overlay
  if (!overlay) return parentRect
  const base = overlay.anchor === "content" ? contentRect : parentRect
  const inset = overlay.inset ?? {}
  const left = inset.left ?? 0
  const top = inset.top ?? 0
  const right = inset.right ?? 0
  const bottom = inset.bottom ?? 0
  return {
    x: base.x + left + (overlay.x ?? 0),
    y: base.y + top + (overlay.y ?? 0),
    w: Math.max(0, base.w - left - right),
    h: Math.max(0, base.h - top - bottom),
  }
}

function resolvedContentRect(rect: Rect, style: ResolvedVisualStyle) {
  return paddedRect(rect, style.layout.padding)
}

function childMeasure(node: VisualNode, ctx: CanvasRenderingContext2D, max: MeasureResult, visualCtx: VisualContext) {
  return measureVisualNode(ctx, node, max, visualCtx)
}

export function measureVisualNode(ctx: CanvasRenderingContext2D, node: VisualNode, max: MeasureResult, visualCtx: VisualContext): MeasureResult {
  const resolved = resolveStyle(node.style, visualCtx)
  switch (node.kind) {
    case "text":
      return {
        w: Math.min(max.w, measureTextWidth(ctx, node.text, textFontSpec(resolved.text))),
        h: resolved.text.lineHeight,
      }
    case "image": {
      const size = imageSize(resolved.image)
      return { w: Math.min(max.w, size.w), h: Math.min(max.h, size.h) }
    }
    case "line":
      return {
        w: resolved.layout.fixedW ?? resolved.layout.minW ?? max.w,
        h: resolved.layout.fixedH ?? resolved.layout.minH ?? Math.max(1, resolved.line.width),
      }
    case "box": {
      const padding = asInsets(resolved.layout.padding)
      const innerMax = {
        w: Math.max(0, (resolved.layout.fixedW ?? max.w) - padding.left - padding.right),
        h: Math.max(0, (resolved.layout.fixedH ?? max.h) - padding.top - padding.bottom),
      }
      const children = node.children ?? []
      let width = 0
      let height = 0
      const normalChildren = children.filter((child) => !resolveStyle(child.style, visualCtx).layout.overlay)
      if (resolved.layout.axis === "overlay") {
        for (const child of normalChildren) {
          const next = childMeasure(child, ctx, innerMax, visualCtx)
          width = Math.max(width, next.w)
          height = Math.max(height, next.h)
        }
      } else if (resolved.layout.axis === "row") {
        for (let i = 0; i < normalChildren.length; i++) {
          const next = childMeasure(normalChildren[i]!, ctx, innerMax, visualCtx)
          width += next.w + (i > 0 ? resolved.layout.gap : 0)
          height = Math.max(height, next.h)
        }
      } else {
        for (let i = 0; i < normalChildren.length; i++) {
          const next = childMeasure(normalChildren[i]!, ctx, innerMax, visualCtx)
          height += next.h + (i > 0 ? resolved.layout.gap : 0)
          width = Math.max(width, next.w)
        }
      }
      width += padding.left + padding.right
      height += padding.top + padding.bottom
      return {
        w: Math.min(max.w, Math.max(resolved.layout.minW ?? 0, resolved.layout.fixedW ?? width)),
        h: Math.min(max.h, Math.max(resolved.layout.minH ?? 0, resolved.layout.fixedH ?? height)),
      }
    }
  }
}

function layoutChildren(ctx: CanvasRenderingContext2D, node: Extract<VisualNode, { kind: "box" }>, rect: Rect, visualCtx: VisualContext, resolved: ResolvedVisualStyle) {
  const children = node.children ?? []
  const contentRect = resolvedContentRect(rect, resolved)
  const normalChildren = children.filter((child) => !resolveStyle(child.style, visualCtx).layout.overlay)
  const overlayChildren = children.filter((child) => resolveStyle(child.style, visualCtx).layout.overlay)
  const out = new Map<VisualNode, Rect>()

  if (resolved.layout.axis === "overlay") {
    for (const child of normalChildren) out.set(child, contentRect)
  } else {
    const measures = normalChildren.map((child) => childMeasure(child, ctx, { w: contentRect.w, h: contentRect.h }, visualCtx))
    const growCount = normalChildren.filter((child) => resolveStyle(child.style, visualCtx).layout.grow).length
    const totalMain = measures.reduce((sum, item) => sum + (resolved.layout.axis === "row" ? item.w : item.h), 0) + Math.max(0, normalChildren.length - 1) * resolved.layout.gap
    const availableMain = resolved.layout.axis === "row" ? contentRect.w : contentRect.h
    const extra = Math.max(0, availableMain - totalMain)
    let cursor = resolved.layout.axis === "row" ? contentRect.x : contentRect.y
    let betweenGap = resolved.layout.gap
    if (resolved.layout.justify === "center") cursor += extra / 2
    else if (resolved.layout.justify === "end") cursor += extra
    else if (resolved.layout.justify === "between" && normalChildren.length > 1) betweenGap += extra / (normalChildren.length - 1)
    for (let i = 0; i < normalChildren.length; i++) {
      const child = normalChildren[i]!
      const childResolved = resolveStyle(child.style, visualCtx)
      const size = measures[i]!
      if (resolved.layout.axis === "row") {
        const growW = childResolved.layout.grow && growCount > 0 ? extra / growCount : 0
        const w = Math.max(size.w, size.w + growW)
        const h = Math.min(contentRect.h, childResolved.layout.fixedH ?? size.h)
        const y = resolved.layout.align === "center" ? contentRect.y + (contentRect.h - h) / 2 : resolved.layout.align === "end" ? contentRect.y + contentRect.h - h : contentRect.y
        out.set(child, { x: cursor, y, w, h })
        cursor += w + betweenGap
      } else {
        const growH = childResolved.layout.grow && growCount > 0 ? extra / growCount : 0
        const h = Math.max(size.h, size.h + growH)
        const w = Math.min(contentRect.w, childResolved.layout.fixedW ?? size.w)
        const x = resolved.layout.align === "center" ? contentRect.x + (contentRect.w - w) / 2 : resolved.layout.align === "end" ? contentRect.x + contentRect.w - w : contentRect.x
        out.set(child, { x, y: cursor, w, h })
        cursor += h + betweenGap
      }
    }
  }

  for (const child of overlayChildren) {
    const childResolved = resolveStyle(child.style, visualCtx)
    out.set(child, childRectForOverlay(rect, contentRect, childResolved.layout))
  }

  return out
}

function drawBoxNode(ctx: CanvasRenderingContext2D, node: Extract<VisualNode, { kind: "box" }>, rect: Rect, visualCtx: VisualContext) {
  const resolved = resolveStyle(node.style, visualCtx)
  const fill = resolved.paint.fill && resolved.paint.fill !== "transparent"
    ? ({ paint: resolved.paint.fill, shadow: resolved.effects.shadow } satisfies FillStyle)
    : undefined
  const stroke = resolved.border.color
    ? ({ color: resolved.border.color, width: resolved.border.width, hairline: resolved.border.width === 1 } satisfies StrokeStyle)
    : undefined
  if (fill || stroke) draw(ctx, RectOp(rect, { radius: resolved.border.radius, fill, stroke }))
  const childRects = layoutChildren(ctx, node, rect, visualCtx, resolved)
  for (const child of node.children ?? []) {
    drawVisualNode(ctx, child, childRects.get(child) ?? rect, visualCtx)
  }
}

function drawTextNode(ctx: CanvasRenderingContext2D, node: Extract<VisualNode, { kind: "text" }>, rect: Rect, visualCtx: VisualContext) {
  const resolved = resolveStyle(node.style, visualCtx)
  const fontSpec = textFontSpec(resolved.text)
  let text = node.text
  if (resolved.text.truncate) {
    ctx.save()
    ctx.font = fontSpec
    text = truncateToWidth(ctx, text, rect.w)
    ctx.restore()
  }
  const x = resolved.text.align === "center" ? rect.x + rect.w / 2 : resolved.text.align === "end" ? rect.x + rect.w : rect.x
  const y = resolved.text.baseline === "middle" ? rect.y + rect.h / 2 + 0.5 : rect.y
  draw(ctx, TextOp({ x, y, text, style: { color: resolved.text.color, font: fontSpec, align: resolved.text.align, baseline: resolved.text.baseline } }))
}

function drawImageNode(ctx: CanvasRenderingContext2D, node: Extract<VisualNode, { kind: "image" }>, rect: Rect, visualCtx: VisualContext) {
  const resolved = resolveStyle(node.style, visualCtx)
  switch (node.source.kind) {
    case "icon":
      draw(ctx, iconToShape(node.source.icon, rect, { paint: resolved.image.tint ?? resolved.image.color }))
      return
    case "glyph":
      draw(ctx, TextOp({
        x: rect.x + rect.w / 2,
        y: rect.y + rect.h / 2 + 0.5,
        text: node.source.text,
        style: {
          color: resolved.image.tint ?? resolved.image.color,
          font: `${Math.max(rect.h, rect.w)}px ${theme.typography.family}`,
          align: "center",
          baseline: "middle",
        },
      }))
      return
    case "bitmap":
      if ("drawImage" in ctx && typeof (ctx as any).drawImage === "function") {
        ;(ctx as any).drawImage(node.source.image, rect.x, rect.y, rect.w, rect.h)
      }
      return
  }
}

function drawLineNode(ctx: CanvasRenderingContext2D, node: Extract<VisualNode, { kind: "line" }>, rect: Rect, visualCtx: VisualContext) {
  const resolved = resolveStyle(node.style, visualCtx)
  const a = absolutePoint(rect, node.from, { x: rect.x, y: rect.y })
  const b = absolutePoint(rect, node.to, { x: rect.x + rect.w, y: rect.y + rect.h })
  draw(ctx, LineOp(a, b, { color: resolved.line.color, width: resolved.line.width, lineCap: resolved.line.cap, dash: resolved.line.dash }))
}

export function drawVisualNode(ctx: CanvasRenderingContext2D, node: VisualNode, rect: Rect, visualCtx: VisualContext) {
  switch (node.kind) {
    case "box":
      drawBoxNode(ctx, node, rect, visualCtx)
      return
    case "text":
      drawTextNode(ctx, node, rect, visualCtx)
      return
    case "image":
      drawImageNode(ctx, node, rect, visualCtx)
      return
    case "line":
      drawLineNode(ctx, node, rect, visualCtx)
      return
  }
}

export function glyphImage(text: string): VisualImageSource {
  return { kind: "glyph", text }
}

export function iconImage(icon: IconDef): VisualImageSource {
  return { kind: "icon", icon }
}

export function normalizeImageSource(source: VisualImageSource | IconDef | string): VisualImageSource {
  if (typeof source === "string") return glyphImage(source)
  if ("kind" in source && (source.kind === "icon" || source.kind === "glyph" || source.kind === "bitmap")) return source
  return iconImage(source)
}

export function styled(input: {
  visualStyle?: VisualStyleInput
}, _ctx: VisualContext): VisualStyleInput | undefined {
  return input.visualStyle
}
