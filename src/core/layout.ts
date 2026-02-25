export type Rect = { x: number; y: number; w: number; h: number }

export type Axis = "row" | "column"
export type Justify = "start" | "center" | "end" | "space-between"
export type Align = "start" | "center" | "end" | "stretch"

export type Padding = number | { l: number; t: number; r: number; b: number }

export type SizeSpec = number | "auto" | undefined
export type BasisSpec = number | "auto" | undefined

export type LayoutStyle = {
  axis?: Axis
  gap?: number
  padding?: Padding
  justify?: Justify
  align?: Align
  alignSelf?: Align

  w?: SizeSpec
  h?: SizeSpec
  minW?: number
  minH?: number
  maxW?: number
  maxH?: number

  grow?: number
  shrink?: number
  basis?: BasisSpec
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

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v))
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

function contentBox(outer: Rect, pad: PaddingRect): Rect {
  const x = outer.x + pad.l
  const y = outer.y + pad.t
  const w = Math.max(0, outer.w - pad.l - pad.r)
  const h = Math.max(0, outer.h - pad.t - pad.b)
  return { x, y, w, h }
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

function gapOf(style: LayoutStyle | undefined) {
  return Math.max(0, safePos(style?.gap, 0))
}

function growOf(style: LayoutStyle | undefined) {
  return Math.max(0, safePos(style?.grow, 0))
}

function shrinkOf(style: LayoutStyle | undefined) {
  return Math.max(0, safePos(style?.shrink, 1))
}

function basisOf(style: LayoutStyle | undefined) {
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
  const v = axis === "row" ? style?.w : style?.h
  return typeof v === "number" ? v : undefined
}

function explicitCross(style: LayoutStyle | undefined, axis: Axis): number | undefined {
  const v = axis === "row" ? style?.h : style?.w
  return typeof v === "number" ? v : undefined
}

function measured(node: LayoutNode, max: { w: number; h: number }) {
  if (!node.measure) return { w: 0, h: 0 }
  const out = node.measure(max)
  return {
    w: Math.max(0, safePos(out?.w, 0)),
    h: Math.max(0, safePos(out?.h, 0)),
  }
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

function placeChildren(container: LayoutNode, box: Rect) {
  const style = container.style
  const axis = axisOf(style)
  const justify = justifyOf(style)
  const align = alignOf(style)
  const gap = gapOf(style)
  const children = container.children ?? []
  if (children.length === 0) return

  const mainAvail = axis === "row" ? box.w : box.h
  const crossAvail = axis === "row" ? box.h : box.w

  const base: number[] = new Array(children.length)
  const grow: number[] = new Array(children.length)
  const shrink: number[] = new Array(children.length)
  const minMain: number[] = new Array(children.length)
  const maxMain: number[] = new Array(children.length)
  const cross: number[] = new Array(children.length)
  const minCross: number[] = new Array(children.length)
  const maxCross: number[] = new Array(children.length)
  const alignSelf: Align[] = new Array(children.length)

  const maxForMeasure = { w: box.w, h: box.h }

  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    const cs = child.style
    const b = basisOf(cs)
    const expMain = explicitMain(cs, axis)
    const expCross = explicitCross(cs, axis)
    const m = measured(child, maxForMeasure)
    const intrinsicMain = axis === "row" ? m.w : m.h
    const intrinsicCross = axis === "row" ? m.h : m.w

    const basis = typeof b === "number" ? b : expMain ?? intrinsicMain
    base[i] = Math.max(0, basis)
    grow[i] = growOf(cs)
    shrink[i] = shrinkOf(cs)
    minMain[i] = minMainOf(cs, axis)
    maxMain[i] = maxMainOf(cs, axis)

    const al = cs?.alignSelf ?? align
    alignSelf[i] = al
    const csz = al === "stretch" ? crossAvail : expCross ?? intrinsicCross
    cross[i] = Math.max(0, csz)
    minCross[i] = minCrossOf(cs, axis)
    maxCross[i] = maxCrossOf(cs, axis)
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
  for (let i = 0; i < cross.length; i++) if (alignSelf[i] === "stretch") cross[i] = crossAvail

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
    const mainSize = sizes[i]
    const crossSize = cross[i]
    const al = alignSelf[i]
    let crossOffset = 0
    if (al === "center") crossOffset = (crossAvail - crossSize) / 2
    else if (al === "end") crossOffset = crossAvail - crossSize
    if (!Number.isFinite(crossOffset)) crossOffset = 0

    let childRect: Rect
    if (axis === "row") {
      childRect = { x: box.x + cursor, y: box.y + crossOffset, w: mainSize, h: crossSize }
    } else {
      childRect = { x: box.x + crossOffset, y: box.y + cursor, w: crossSize, h: mainSize }
    }
    layout(children[i], childRect)
    cursor += mainSize + gapActual
  }
}

function applyNodeSize(style: LayoutStyle | undefined, outer: Rect): Rect {
  let w = outer.w
  let h = outer.h
  if (typeof style?.w === "number") w = style.w
  if (typeof style?.h === "number") h = style.h
  const minW = Math.max(0, safePos(style?.minW, 0))
  const minH = Math.max(0, safePos(style?.minH, 0))
  const maxW = safePos(style?.maxW, Number.POSITIVE_INFINITY)
  const maxH = safePos(style?.maxH, Number.POSITIVE_INFINITY)
  w = clamp(Math.max(0, w), minW, maxW)
  h = clamp(Math.max(0, h), minH, maxH)
  return { x: outer.x, y: outer.y, w, h }
}

export function layout(node: LayoutNode, outer: Rect): LayoutNode {
  const rect = applyNodeSize(node.style, outer)
  node.rect = rect
  const pad = resolvePadding(node.style?.padding)
  const box = contentBox(rect, pad)
  if (node.children && node.children.length) placeChildren(node, box)
  return node
}
