import { clamp, type Rect } from "../draw/rect"

export type { Rect }

export type Axis = "row" | "column" | "stack"
export type Justify = "start" | "center" | "end" | "space-between"
export type Align = "start" | "center" | "end" | "stretch"
export type OverflowMode = "visible" | "clip" | "scroll"

export type Padding = number | { l: number; t: number; r: number; b: number }

export type SizeSpec = number | "auto" | undefined
export type BasisSpec = number | "auto" | undefined

export type LayoutStyle = {
  axis?: Axis
  gap?: number
  rowGap?: number
  columnGap?: number
  padding?: Padding
  inset?: Padding
  margin?: Padding
  justify?: Justify
  align?: Align
  alignSelf?: Align
  overflow?: OverflowMode

  w?: SizeSpec
  h?: SizeSpec
  minW?: number
  minH?: number
  maxW?: number
  maxH?: number

  grow?: number
  shrink?: number
  basis?: BasisSpec
  fixed?: number
  fill?: boolean
}

export type Measure = (max: { w: number; h: number }) => { w: number; h: number }

export type LayoutNode = {
  style?: LayoutStyle
  children?: LayoutNode[]
  measure?: Measure
  rect?: Rect
  id?: string
}

export type PaddingRect = { l: number; t: number; r: number; b: number }
export type LayoutContext = { cache: MeasureCache }
export type LayoutSlice = {
  fixed?: number
  flex?: number
  min?: number
  max?: number
}
export type LinearLayoutOptions = {
  gap?: number
  padding?: Padding
}

type MeasureCache = WeakMap<LayoutNode, Map<string, { w: number; h: number }>>

function createMeasureCache(): MeasureCache {
  return new WeakMap()
}

function getMeasureCache(context?: LayoutContext): MeasureCache {
  return context?.cache ?? createMeasureCache()
}

export function createLayoutContext(): LayoutContext {
  return { cache: createMeasureCache() }
}

function safePos(v: number | undefined, fallback: number) {
  if (v === undefined) return fallback
  if (!Number.isFinite(v)) return fallback
  return v
}

export function resolvePadding(p: Padding | undefined): PaddingRect {
  if (!p) return { l: 0, t: 0, r: 0, b: 0 }
  if (typeof p === "number") return { l: p, t: p, r: p, b: p }
  return { l: p.l, t: p.t, r: p.r, b: p.b }
}

function shrinkBox(outer: Rect, pad: PaddingRect): Rect {
  const x = outer.x + pad.l
  const y = outer.y + pad.t
  const w = Math.max(0, outer.w - pad.l - pad.r)
  const h = Math.max(0, outer.h - pad.t - pad.b)
  return { x, y, w, h }
}

function contentBox(outer: Rect, style: LayoutStyle | undefined) {
  const inset = resolvePadding(style?.inset)
  const padding = resolvePadding(style?.padding)
  return shrinkBox(shrinkBox(outer, inset), padding)
}

function axisOf(style: LayoutStyle | undefined): Axis {
  return style?.axis ?? "row"
}

function justifyOf(style: LayoutStyle | undefined): Justify {
  return style?.justify ?? "start"
}

function alignOf(style: LayoutStyle | undefined): Align {
  return style?.align ?? "stretch"
}

function gapOf(style: LayoutStyle | undefined, axis: Axis) {
  const mainGap = Math.max(0, safePos(style?.gap, 0))
  if (axis === "row") return Math.max(mainGap, Math.max(0, safePos(style?.columnGap, 0)))
  if (axis === "column") return Math.max(mainGap, Math.max(0, safePos(style?.rowGap, 0)))
  return 0
}

function growOf(style: LayoutStyle | undefined) {
  if (style?.fill) return Math.max(1, safePos(style?.grow, 1))
  return Math.max(0, safePos(style?.grow, 0))
}

function shrinkOf(style: LayoutStyle | undefined) {
  if (style?.fill) return Math.max(1, safePos(style?.shrink, 1))
  return Math.max(0, safePos(style?.shrink, 1))
}

function basisOf(style: LayoutStyle | undefined) {
  if (style?.fixed !== undefined) return style.fixed
  if (style?.fill) return 0
  return style?.basis ?? "auto"
}

function minMainOf(style: LayoutStyle | undefined, axis: Axis) {
  const v = axis === "row" ? style?.minW : style?.minH
  return Math.max(0, safePos(v, 0))
}

function maxMainOf(style: LayoutStyle | undefined, axis: Axis) {
  const v = axis === "row" ? style?.maxW : style?.maxH
  const out = safePos(v, Number.POSITIVE_INFINITY)
  return out <= 0 ? 0 : out
}

function minCrossOf(style: LayoutStyle | undefined, axis: Axis) {
  const v = axis === "row" ? style?.minH : style?.minW
  return Math.max(0, safePos(v, 0))
}

function maxCrossOf(style: LayoutStyle | undefined, axis: Axis) {
  const v = axis === "row" ? style?.maxH : style?.maxW
  const out = safePos(v, Number.POSITIVE_INFINITY)
  return out <= 0 ? 0 : out
}

function explicitMain(style: LayoutStyle | undefined, axis: Axis): number | undefined {
  if (style?.fixed !== undefined) return style.fixed
  const v = axis === "row" ? style?.w : style?.h
  return typeof v === "number" ? v : undefined
}

function explicitCross(style: LayoutStyle | undefined, axis: Axis): number | undefined {
  const v = axis === "row" ? style?.h : style?.w
  return typeof v === "number" ? v : undefined
}

function cacheKey(max: { w: number; h: number }) {
  return `${Math.max(0, Math.round(max.w * 1000) / 1000)}:${Math.max(0, Math.round(max.h * 1000) / 1000)}`
}

function layoutMain(rect: Rect, axis: "row" | "column") {
  return axis === "row" ? rect.w : rect.h
}

function setLayoutMain(rect: Rect, axis: "row" | "column", value: number): Rect {
  if (axis === "row") return { ...rect, w: value }
  return { ...rect, h: value }
}

function setLayoutOffset(rect: Rect, axis: "row" | "column", offset: number): Rect {
  if (axis === "row") return { ...rect, x: offset }
  return { ...rect, y: offset }
}

function distributeFlex(sizes: number[], weights: number[], mins: number[], maxes: number[], extra: number) {
  let remaining = extra
  let active: number[] = []
  for (let i = 0; i < sizes.length; i++) if (weights[i] > 0 && sizes[i] < maxes[i]) active.push(i)
  for (let iter = 0; iter < 8 && remaining > 1e-6 && active.length > 0; iter++) {
    const total = active.reduce((sum, index) => sum + weights[index], 0)
    if (total <= 0) break
    const startRemaining = remaining
    let changed = 0
    for (const index of active) {
      const add = (startRemaining * weights[index]) / total
      const next = clamp(sizes[index] + add, mins[index], maxes[index])
      const delta = next - sizes[index]
      if (delta > 0) {
        sizes[index] = next
        remaining -= delta
        changed += delta
      }
    }
    if (changed <= 1e-6) break
    active = active.filter((index) => sizes[index] < maxes[index] - 1e-9)
  }
}

function linearLayout(axis: "row" | "column", outer: Rect, slices: LayoutSlice[], options?: LinearLayoutOptions): Rect[] {
  if (slices.length === 0) return []
  const box = shrinkBox(outer, resolvePadding(options?.padding))
  const gap = Math.max(0, safePos(options?.gap, 0))
  const gapTotal = gap * Math.max(0, slices.length - 1)
  const available = Math.max(0, layoutMain(box, axis) - gapTotal)
  const sizes = new Array<number>(slices.length)
  const mins = new Array<number>(slices.length)
  const maxes = new Array<number>(slices.length)
  const weights = new Array<number>(slices.length)

  let used = 0
  for (let i = 0; i < slices.length; i++) {
    const slice = slices[i]
    mins[i] = Math.max(0, safePos(slice.min, 0))
    maxes[i] = safePos(slice.max, Number.POSITIVE_INFINITY)
    weights[i] = Math.max(0, safePos(slice.flex, 0))
    sizes[i] = clamp(Math.max(0, safePos(slice.fixed, 0)), mins[i], maxes[i])
    used += sizes[i]
  }

  if (used < available) distributeFlex(sizes, weights, mins, maxes, available - used)

  const rects: Rect[] = new Array(slices.length)
  let cursor = axis === "row" ? box.x : box.y
  for (let i = 0; i < slices.length; i++) {
    const base = setLayoutMain(box, axis, sizes[i])
    rects[i] = setLayoutOffset(base, axis, cursor)
    cursor += sizes[i] + gap
  }
  return rects
}

function intrinsicMeasure(node: LayoutNode, max: { w: number; h: number }, cache: MeasureCache): { w: number; h: number } {
  const byNode = cache.get(node)
  const key = cacheKey(max)
  const hit = byNode?.get(key)
  if (hit) return hit

  const out = node.measure
    ? node.measure(max)
    : node.children?.length
      ? measureContainer(node, max, cache)
      : { w: 0, h: 0 }

  const normalized = {
    w: Math.max(0, safePos(out?.w, 0)),
    h: Math.max(0, safePos(out?.h, 0)),
  }
  let nextByNode = byNode
  if (!nextByNode) {
    nextByNode = new Map()
    cache.set(node, nextByNode)
  }
  nextByNode.set(key, normalized)
  return normalized
}

function outerSizeFromMeasured(style: LayoutStyle | undefined, measured: { w: number; h: number }) {
  const margin = resolvePadding(style?.margin)
  const inset = resolvePadding(style?.inset)
  const padding = resolvePadding(style?.padding)
  return {
    w: measured.w + padding.l + padding.r + inset.l + inset.r + margin.l + margin.r,
    h: measured.h + padding.t + padding.b + inset.t + inset.b + margin.t + margin.b,
  }
}

function measureContainer(node: LayoutNode, max: { w: number; h: number }, cache: MeasureCache) {
  const style = node.style
  const axis = axisOf(style)
  const box = contentBox({ x: 0, y: 0, w: max.w, h: max.h }, style)
  const children = node.children ?? []
  if (children.length === 0) return { w: 0, h: 0 }
  if (axis === "stack") {
    let maxW = 0
    let maxH = 0
    for (const child of children) {
      const m = intrinsicMeasure(child, { w: box.w, h: box.h }, cache)
      const withMargin = outerSizeFromMeasured(child.style, m)
      maxW = Math.max(maxW, withMargin.w)
      maxH = Math.max(maxH, withMargin.h)
    }
    return outerSizeFromMeasured(style, { w: maxW, h: maxH })
  }

  const gap = gapOf(style, axis)
  let main = 0
  let cross = 0
  for (const child of children) {
    const m = intrinsicMeasure(child, { w: box.w, h: box.h }, cache)
    const withMargin = outerSizeFromMeasured(child.style, m)
    if (axis === "row") {
      main += withMargin.w
      cross = Math.max(cross, withMargin.h)
    } else {
      main += withMargin.h
      cross = Math.max(cross, withMargin.w)
    }
  }
  if (children.length > 1) main += gap * (children.length - 1)
  const inner = axis === "row" ? { w: main, h: cross } : { w: cross, h: main }
  return outerSizeFromMeasured(style, inner)
}

function distributeGrow(sizes: number[], weights: number[], maxes: number[], extra: number) {
  let remaining = extra
  let active: number[] = []
  for (let i = 0; i < sizes.length; i++) if (weights[i] > 0 && sizes[i] < maxes[i]) active.push(i)
  for (let iter = 0; iter < 8 && remaining > 1e-6 && active.length > 0; iter++) {
    const total = active.reduce((s, i) => s + weights[i], 0)
    if (total <= 0) break
    const startRemaining = remaining
    let changed = 0
    for (const i of active) {
      const add = (startRemaining * weights[i]) / total
      const next = Math.min(maxes[i], sizes[i] + add)
      const delta = next - sizes[i]
      if (delta > 0) {
        sizes[i] = next
        remaining -= delta
        changed += delta
      }
    }
    if (changed <= 1e-6) break
    active = active.filter((i) => sizes[i] < maxes[i] - 1e-9)
  }
}

function distributeShrink(sizes: number[], weights: number[], mins: number[], deficit: number) {
  let remaining = deficit
  let active: number[] = []
  for (let i = 0; i < sizes.length; i++) if (weights[i] > 0 && sizes[i] > mins[i]) active.push(i)
  for (let iter = 0; iter < 8 && remaining > 1e-6 && active.length > 0; iter++) {
    const total = active.reduce((s, i) => s + weights[i], 0)
    if (total <= 0) break
    const startRemaining = remaining
    let changed = 0
    for (const i of active) {
      const sub = (startRemaining * weights[i]) / total
      const next = Math.max(mins[i], sizes[i] - sub)
      const delta = sizes[i] - next
      if (delta > 0) {
        sizes[i] = next
        remaining -= delta
        changed += delta
      }
    }
    if (changed <= 1e-6) break
    active = active.filter((i) => sizes[i] > mins[i] + 1e-9)
  }
}

function applyMargin(rect: Rect, margin: PaddingRect) {
  return {
    x: rect.x + margin.l,
    y: rect.y + margin.t,
    w: Math.max(0, rect.w - margin.l - margin.r),
    h: Math.max(0, rect.h - margin.t - margin.b),
  }
}

function placeChildren(container: LayoutNode, box: Rect, cache: MeasureCache) {
  const style = container.style
  const axis = axisOf(style)
  const children = container.children ?? []
  if (children.length === 0) return

  if (axis === "stack") {
    const align = alignOf(style)
    for (const child of children) {
      const margin = resolvePadding(child.style?.margin)
      const inner = applyMargin(box, margin)
      const m = intrinsicMeasure(child, { w: inner.w, h: inner.h }, cache)
      const width = clamp(
        typeof child.style?.w === "number" ? child.style.w : child.style?.fill ? inner.w : m.w,
        safePos(child.style?.minW, 0),
        safePos(child.style?.maxW, Number.POSITIVE_INFINITY),
      )
      const height = clamp(
        typeof child.style?.h === "number" ? child.style.h : child.style?.fill ? inner.h : m.h,
        safePos(child.style?.minH, 0),
        safePos(child.style?.maxH, Number.POSITIVE_INFINITY),
      )
      const childAlign = child.style?.alignSelf ?? align
      let x = inner.x
      let y = inner.y
      if (childAlign === "center") {
        x = inner.x + (inner.w - width) / 2
        y = inner.y + (inner.h - height) / 2
      } else if (childAlign === "end") {
        x = inner.x + inner.w - width
        y = inner.y + inner.h - height
      }
      layoutInternal(child, { x, y, w: width, h: height }, cache)
    }
    return
  }

  const justify = justifyOf(style)
  const align = alignOf(style)
  const gap = gapOf(style, axis)
  const flow = children

  const mainAvail = axis === "row" ? box.w : box.h
  const crossAvail = axis === "row" ? box.h : box.w

  const base: number[] = new Array(flow.length)
  const grow: number[] = new Array(flow.length)
  const shrink: number[] = new Array(flow.length)
  const minMain: number[] = new Array(flow.length)
  const maxMain: number[] = new Array(flow.length)
  const cross: number[] = new Array(flow.length)
  const minCross: number[] = new Array(flow.length)
  const maxCross: number[] = new Array(flow.length)
  const alignSelf: Align[] = new Array(flow.length)
  const margins: PaddingRect[] = new Array(flow.length)

  const maxForMeasure = { w: box.w, h: box.h }

  for (let i = 0; i < flow.length; i++) {
    const child = flow[i]
    const cs = child.style
    const margin = resolvePadding(cs?.margin)
    margins[i] = margin
    const b = basisOf(cs)
    const expMain = explicitMain(cs, axis)
    const expCross = explicitCross(cs, axis)
    const m = intrinsicMeasure(child, maxForMeasure, cache)
    const intrinsicMain = axis === "row" ? m.w + margin.l + margin.r : m.h + margin.t + margin.b
    const intrinsicCross = axis === "row" ? m.h + margin.t + margin.b : m.w + margin.l + margin.r

    const basis = typeof b === "number" ? b + (axis === "row" ? margin.l + margin.r : margin.t + margin.b) : expMain ?? intrinsicMain
    base[i] = Math.max(0, basis)
    grow[i] = growOf(cs)
    shrink[i] = shrinkOf(cs)
    minMain[i] = minMainOf(cs, axis) + (axis === "row" ? margin.l + margin.r : margin.t + margin.b)
    maxMain[i] = maxMainOf(cs, axis) + (axis === "row" ? margin.l + margin.r : margin.t + margin.b)

    const al = cs?.alignSelf ?? align
    alignSelf[i] = al
    const csz = cs?.fill || al === "stretch" ? crossAvail : expCross ?? intrinsicCross
    cross[i] = Math.max(0, csz)
    minCross[i] = minCrossOf(cs, axis) + (axis === "row" ? margin.t + margin.b : margin.l + margin.r)
    maxCross[i] = maxCrossOf(cs, axis) + (axis === "row" ? margin.t + margin.b : margin.l + margin.r)
  }

  const sizes = base.slice()
  const baseSum = sizes.reduce((s, v) => s + v, 0)
  const gapSum = gap * Math.max(0, children.length - 1)
  const totalBase = baseSum + gapSum
  const totalGrow = grow.reduce((s, v) => s + v, 0)
  const totalShrink = shrink.reduce((s, v) => s + v, 0)

  if (totalBase < mainAvail && totalGrow > 0) distributeGrow(sizes, grow, maxMain, mainAvail - totalBase)
  if (totalBase > mainAvail && totalShrink > 0) distributeShrink(sizes, shrink, minMain, totalBase - mainAvail)

  for (let i = 0; i < sizes.length; i++) sizes[i] = clamp(sizes[i], minMain[i], maxMain[i])
  for (let i = 0; i < cross.length; i++) cross[i] = clamp(cross[i], minCross[i], maxCross[i])
  for (let i = 0; i < cross.length; i++) if (alignSelf[i] === "stretch" || children[i].style?.fill) cross[i] = crossAvail

  const usedMain = sizes.reduce((s, v) => s + v, 0)
  const usedGaps = gap * Math.max(0, children.length - 1)
  const usedTotal = usedMain + usedGaps

  let startOffset = 0
  let gapActual = gap
  if (justify === "center") startOffset = (mainAvail - usedTotal) / 2
  else if (justify === "end") startOffset = mainAvail - usedTotal
  else if (justify === "space-between") {
    if (children.length > 1 && mainAvail > usedMain) {
      gapActual = (mainAvail - usedMain) / (children.length - 1)
      startOffset = 0
    } else {
      gapActual = 0
      startOffset = 0
    }
  }
  if (!Number.isFinite(startOffset)) startOffset = 0

  let cursor = startOffset
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    const mainSize = sizes[i]
    const crossSize = cross[i]
    const al = alignSelf[i]
    const margin = margins[i]
    let crossOffset = 0
    if (al === "center") crossOffset = (crossAvail - crossSize) / 2
    else if (al === "end") crossOffset = crossAvail - crossSize
    if (!Number.isFinite(crossOffset)) crossOffset = 0

    let childRect: Rect
    if (axis === "row") {
      childRect = {
        x: box.x + cursor + margin.l,
        y: box.y + crossOffset + margin.t,
        w: Math.max(0, mainSize - margin.l - margin.r),
        h: Math.max(0, crossSize - margin.t - margin.b),
      }
    } else {
      childRect = {
        x: box.x + crossOffset + margin.l,
        y: box.y + cursor + margin.t,
        w: Math.max(0, crossSize - margin.l - margin.r),
        h: Math.max(0, mainSize - margin.t - margin.b),
      }
    }
    layoutInternal(child, childRect, cache)
    cursor += mainSize + gapActual
  }
}

function applyNodeSize(style: LayoutStyle | undefined, outer: Rect): Rect {
  let w = outer.w
  let h = outer.h
  if (typeof style?.w === "number") w = style.w
  if (typeof style?.h === "number") h = style.h
  if (style?.fill) {
    w = outer.w
    h = outer.h
  }
  const minW = Math.max(0, safePos(style?.minW, 0))
  const minH = Math.max(0, safePos(style?.minH, 0))
  const maxW = safePos(style?.maxW, Number.POSITIVE_INFINITY)
  const maxH = safePos(style?.maxH, Number.POSITIVE_INFINITY)
  w = clamp(Math.max(0, w), minW, maxW)
  h = clamp(Math.max(0, h), minH, maxH)
  return { x: outer.x, y: outer.y, w, h }
}

function layoutInternal(node: LayoutNode, outer: Rect, cache: MeasureCache): LayoutNode {
  const rect = applyNodeSize(node.style, outer)
  node.rect = rect
  const box = contentBox(rect, node.style)
  if (node.children && node.children.length) placeChildren(node, box, cache)
  return node
}

export function measureLayout(node: LayoutNode, max: { w: number; h: number }, context?: LayoutContext) {
  return intrinsicMeasure(node, max, getMeasureCache(context))
}

export function layout(node: LayoutNode, outer: Rect, context?: LayoutContext): LayoutNode {
  return layoutInternal(node, outer, getMeasureCache(context))
}

export function rowLayout(outer: Rect, slices: LayoutSlice[], options?: LinearLayoutOptions) {
  return linearLayout("row", outer, slices, options)
}

export function columnLayout(outer: Rect, slices: LayoutSlice[], options?: LinearLayoutOptions) {
  return linearLayout("column", outer, slices, options)
}
