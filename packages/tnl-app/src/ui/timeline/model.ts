import { clamp } from "@tnl/canvas-interface/draw"

export type TimelineSelection = { trackId?: string; itemId?: string }

export type TimelineTrackItemModel = {
  id: string
  start: number
  duration: number
  label: string
  color?: string
  selected?: boolean
}

export type TimelineTrackModel = {
  id: string
  name: string
  kind?: "video" | "audio" | "generic"
  items: TimelineTrackItemModel[]
  height?: number
}

export type TimelineViewModel = {
  rangeStart: number
  rangeEnd: number
  baseUnit: number
  fps?: number
  playhead?: number
  onSeek?: (value: number) => void
  tracks: TimelineTrackModel[]
  selection?: TimelineSelection
}

export type TimelineTickDensity = "minor" | "major" | "label"

export type TimelineTickStep = {
  minor: number
  major: number
  label: number
}

export type TimelineUnitAdapter = {
  formatTick: (value: number, density: TimelineTickDensity) => string
  getTickStep: (pxPerUnit: number) => TimelineTickStep
  snap?: (value: number) => number
}

export type TimelineScaleModel = {
  pxPerUnit: number
  minPxPerUnit: number
  maxPxPerUnit: number
  zoomAnchorMode: "pointer" | "center"
}

export type TimelineScrollModel = {
  scrollX: number
  scrollY: number
  maxScrollX: number
  maxScrollY: number
}

export type TimelineTrackMetrics = {
  index: number
  id: string
  top: number
  height: number
  bottom: number
}

export type TimelineZoomRequest = {
  pointerX: number
  viewportWidth: number
  rangeStart: number
  scrollX: number
  pxPerUnit: number
  nextPxPerUnit: number
  zoomAnchorMode: "pointer" | "center"
}

export type TimelineVisibleTrackRange = {
  first: number
  last: number
}

function positiveOr(v: number, fallback: number) {
  return Number.isFinite(v) && v > 0 ? v : fallback
}

function ceilToMultiple(v: number, step: number) {
  const s = positiveOr(step, 1)
  return Math.ceil(v / s) * s
}

function niceStep(raw: number, minStep: number) {
  const target = Math.max(positiveOr(minStep, 1e-6), positiveOr(raw, minStep))
  const base = Math.pow(10, Math.floor(Math.log10(target)))
  const scaled = target / base
  let lead = 1
  if (scaled > 1) lead = 2
  if (scaled > 2) lead = 5
  if (scaled > 5) lead = 10
  return lead * base
}

function trimTrailingZeros(text: string) {
  if (!text.includes(".")) return text
  return text.replace(/\.?0+$/, "")
}

export function timelineRangeSpan(view: TimelineViewModel) {
  return Math.max(0, view.rangeEnd - view.rangeStart)
}

export function clampPxPerUnit(scale: TimelineScaleModel, next: number) {
  return clamp(next, positiveOr(scale.minPxPerUnit, 1), positiveOr(scale.maxPxPerUnit, next))
}

export function valueToX(value: number, rangeStart: number, pxPerUnit: number) {
  return (value - rangeStart) * positiveOr(pxPerUnit, 1)
}

export function xToValue(x: number, rangeStart: number, pxPerUnit: number) {
  return rangeStart + x / positiveOr(pxPerUnit, 1)
}

export function computeHorizontalScrollLimit(rangeStart: number, rangeEnd: number, pxPerUnit: number, viewportWidth: number) {
  const span = Math.max(0, rangeEnd - rangeStart)
  return Math.max(0, span * positiveOr(pxPerUnit, 1) - Math.max(0, viewportWidth))
}

export function computeTrackMetrics(tracks: TimelineTrackModel[], opts: { defaultTrackHeight?: number; trackGap?: number } = {}) {
  const defaultTrackHeight = positiveOr(opts.defaultTrackHeight ?? 44, 44)
  const trackGap = Math.max(0, opts.trackGap ?? 6)
  const metrics: TimelineTrackMetrics[] = []
  let cursor = 0
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i]
    const height = positiveOr(track.height ?? defaultTrackHeight, defaultTrackHeight)
    const top = cursor
    const bottom = top + height
    metrics.push({ index: i, id: track.id, top, height, bottom })
    cursor = bottom + trackGap
  }
  const totalHeight = Math.max(0, cursor - (metrics.length > 0 ? trackGap : 0))
  return { metrics, totalHeight }
}

export function computeVerticalScrollLimit(totalHeight: number, viewportHeight: number) {
  return Math.max(0, Math.max(0, totalHeight) - Math.max(0, viewportHeight))
}

export function trackIndexToY(index: number, metrics: TimelineTrackMetrics[]) {
  const hit = metrics[index]
  return hit ? hit.top : -1
}

export function yToTrackIndex(y: number, metrics: TimelineTrackMetrics[]) {
  for (const m of metrics) {
    if (y >= m.top && y <= m.bottom) return m.index
  }
  return -1
}

export function findVisibleTrackRange(scrollY: number, viewportHeight: number, metrics: TimelineTrackMetrics[]): TimelineVisibleTrackRange | null {
  if (metrics.length === 0 || viewportHeight <= 0) return null
  const minY = Math.max(0, scrollY)
  const maxY = minY + viewportHeight
  let first = -1
  let last = -1
  for (const m of metrics) {
    if (m.bottom < minY) continue
    if (m.top > maxY) break
    if (first < 0) first = m.index
    last = m.index
  }
  return first < 0 ? null : { first, last }
}

export function findVisibleValueRange(scrollX: number, viewportWidth: number, rangeStart: number, pxPerUnit: number) {
  const x0 = Math.max(0, scrollX)
  const x1 = x0 + Math.max(0, viewportWidth)
  return {
    start: xToValue(x0, rangeStart, pxPerUnit),
    end: xToValue(x1, rangeStart, pxPerUnit),
  }
}

export function itemIntersectsRange(item: TimelineTrackItemModel, rangeStart: number, rangeEnd: number) {
  const itemEnd = item.start + Math.max(0, item.duration)
  return itemEnd >= rangeStart && item.start <= rangeEnd
}

export function zoomAroundPointer(req: TimelineZoomRequest) {
  const prevPx = positiveOr(req.pxPerUnit, 1)
  const nextPx = positiveOr(req.nextPxPerUnit, prevPx)
  const anchorX = req.zoomAnchorMode === "center" ? Math.max(0, req.viewportWidth) / 2 : req.pointerX
  const anchorValue = xToValue(req.scrollX + anchorX, req.rangeStart, prevPx)
  return valueToX(anchorValue, req.rangeStart, nextPx) - anchorX
}

export function createGenericNumericUnitAdapter(baseUnit = 1): TimelineUnitAdapter {
  const unit = positiveOr(baseUnit, 1)
  return {
    formatTick(value, density) {
      const digits = density === "label" ? 2 : density === "major" ? 1 : 0
      return trimTrailingZeros(value.toFixed(digits))
    },
    getTickStep(pxPerUnit) {
      const minor = niceStep(14 / positiveOr(pxPerUnit, 1), unit)
      const major = ceilToMultiple(niceStep(56 / positiveOr(pxPerUnit, 1), unit), minor)
      const label = ceilToMultiple(niceStep(96 / positiveOr(pxPerUnit, 1), unit), major)
      return { minor, major, label }
    },
    snap(value) {
      return Math.round(value / unit) * unit
    },
  }
}

export function createFrameUnitAdapter(baseUnit = 1): TimelineUnitAdapter {
  const numeric = createGenericNumericUnitAdapter(baseUnit)
  return {
    formatTick(value) {
      return `${Math.round(value)}f`
    },
    getTickStep(pxPerUnit) {
      return numeric.getTickStep(pxPerUnit)
    },
    snap(value) {
      return Math.round(value / baseUnit) * baseUnit
    },
  }
}

function formatTimeValue(seconds: number) {
  const s = Math.max(0, seconds)
  const whole = Math.floor(s)
  const ms = Math.round((s - whole) * 1000)
  const sec = whole % 60
  const min = Math.floor(whole / 60) % 60
  const hr = Math.floor(whole / 3600)
  const tail = `${String(sec).padStart(2, "0")}`
  if (hr > 0) return `${hr}:${String(min).padStart(2, "0")}:${tail}`
  if (whole >= 60) return `${min}:${tail}`
  if (ms > 0) return trimTrailingZeros(`${sec}.${String(ms).padStart(3, "0")}`)
  return `${sec}s`
}

export function createTimeUnitAdapter(baseUnit = 1): TimelineUnitAdapter {
  const numeric = createGenericNumericUnitAdapter(baseUnit)
  return {
    formatTick(value) {
      return formatTimeValue(value)
    },
    getTickStep(pxPerUnit) {
      return numeric.getTickStep(pxPerUnit)
    },
    snap(value) {
      return Math.round(value / baseUnit) * baseUnit
    },
  }
}
