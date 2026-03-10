import { font, theme } from "../../config/theme"
import { draw, Line, Rect as RectOp, RRect, Text } from "../../core/draw"
import { clamp } from "../../core/rect"
import { PointerUIEvent, UIElement, WheelUIEvent, pointInRect, type Rect, type Vec2 } from "../base/ui"
import { ViewportElement, SurfaceRoot, type Surface, type ViewportContext } from "../base/viewport"
import { Scrollbar } from "../widgets/scrollbar"
import {
  clampPxPerUnit,
  computeHorizontalScrollLimit,
  computeTrackMetrics,
  computeVerticalScrollLimit,
  createGenericNumericUnitAdapter,
  findVisibleTrackRange,
  findVisibleValueRange,
  itemIntersectsRange,
  valueToX,
  zoomAroundPointer,
  type TimelineScaleModel,
  type TimelineScrollModel,
  type TimelineTrackMetrics,
  type TimelineUnitAdapter,
  type TimelineViewModel,
} from "../timeline/model"

type TimelineLayout = {
  rulerHeight: number
  headerWidth: number
  scrollbarSize: number
  contentRect: Rect
  rulerRect: Rect
  headerRect: Rect
  backgroundRect: Rect
  hScrollbarRect: Rect
  vScrollbarRect: Rect
  cornerRect: Rect
}

function alpha(hex: string, opacity: string) {
  return `${hex}${opacity}`
}

function fitLabel(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, text: string, maxWidth: number, textFont: string) {
  if (maxWidth <= 6 || text.length === 0) return ""
  const c = ctx as CanvasRenderingContext2D
  c.save()
  c.font = textFont
  if (c.measureText(text).width <= maxWidth) {
    c.restore()
    return text
  }
  const ellipsis = "..."
  const ellipsisWidth = c.measureText(ellipsis).width
  if (ellipsisWidth > maxWidth) {
    c.restore()
    return ""
  }
  let out = ""
  for (let i = 0; i < text.length; i++) {
    const next = out + text[i]
    if (c.measureText(next).width + ellipsisWidth > maxWidth) break
    out = next
  }
  c.restore()
  return out.length ? `${out}${ellipsis}` : ""
}

class TimelineRulerSurface implements Surface {
  readonly id: string
  constructor(private readonly host: TimelineCompositeSurface) {
    this.id = `${host.id}.Ruler`
  }

  render(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, viewport: ViewportContext) {
    const layout = this.host.layout()
    const scale = this.host.scale()
    const view = this.host.view()
    const adapter = this.host.unitAdapter()
    const fontSpec = font(theme, theme.typography.body)
    const ticks = adapter.getTickStep(scale.pxPerUnit)
    const visible = findVisibleValueRange(viewport.scroll.x, layout.contentRect.w, view.rangeStart, scale.pxPerUnit)
    const startValue = Math.floor(visible.start / ticks.minor) * ticks.minor

    draw(
      ctx as CanvasRenderingContext2D,
      RectOp({ x: 0, y: 0, w: viewport.contentRect.w, h: viewport.contentRect.h }, { fill: { color: "#151d2b" } }),
      Line({ x: 0, y: viewport.contentRect.h - 0.5, }, { x: viewport.contentRect.w, y: viewport.contentRect.h - 0.5 }, { color: "rgba(255,255,255,0.12)", hairline: true }),
    )

    for (let value = startValue; value <= visible.end + ticks.minor; value += ticks.minor) {
      if (value < view.rangeStart || value > view.rangeEnd) continue
      const x = valueToX(value, view.rangeStart, scale.pxPerUnit)
      const isMajor = Math.abs(value / ticks.major - Math.round(value / ticks.major)) < 1e-6
      const isLabel = Math.abs(value / ticks.label - Math.round(value / ticks.label)) < 1e-6
      const tickTop = isMajor ? 10 : 18
      draw(ctx as CanvasRenderingContext2D, Line({ x, y: tickTop }, { x, y: viewport.contentRect.h }, { color: isMajor ? "rgba(255,255,255,0.26)" : "rgba(255,255,255,0.14)", hairline: true }))
      if (!isLabel) continue
      draw(
        ctx as CanvasRenderingContext2D,
        Text({
          x: x + 4,
          y: 6,
          text: adapter.formatTick(value, "label"),
          style: { color: theme.colors.textMuted, font: fontSpec, baseline: "top" },
        }),
      )
    }
  }

  onWheel(e: WheelUIEvent) {
    this.host.handleTimelineWheel(e, "ruler", e.x)
  }
}

class TimelineContainerBackgroundSurface implements Surface {
  readonly id: string
  constructor(private readonly host: TimelineCompositeSurface) {
    this.id = `${host.id}.Background`
  }

  render(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, viewport: ViewportContext) {
    const layout = this.host.layout()
    const scale = this.host.scale()
    const view = this.host.view()
    const metrics = this.host.trackMetrics()
    const adapter = this.host.unitAdapter()
    const ticks = adapter.getTickStep(scale.pxPerUnit)
    const visibleValues = findVisibleValueRange(viewport.scroll.x, layout.contentRect.w, view.rangeStart, scale.pxPerUnit)
    const visibleTracks = findVisibleTrackRange(viewport.scroll.y, layout.contentRect.h, metrics)

    draw(ctx as CanvasRenderingContext2D, RectOp({ x: 0, y: 0, w: viewport.contentRect.w, h: viewport.contentRect.h }, { fill: { color: "#0f1521" } }))

    if (visibleTracks) {
      for (let i = visibleTracks.first; i <= visibleTracks.last; i++) {
        const track = metrics[i]
        const y = track.top
        const fill = i % 2 === 0 ? "rgba(255,255,255,0.018)" : "rgba(255,255,255,0.035)"
        draw(
          ctx as CanvasRenderingContext2D,
          RectOp({ x: 0, y, w: viewport.contentRect.w, h: track.height }, { fill: { color: fill } }),
          Line({ x: 0, y: y + track.height + 0.5 }, { x: viewport.contentRect.w, y: y + track.height + 0.5 }, { color: "rgba(255,255,255,0.06)", hairline: true }),
        )
      }
    }

    const startValue = Math.floor(visibleValues.start / ticks.minor) * ticks.minor
    for (let value = startValue; value <= visibleValues.end + ticks.minor; value += ticks.minor) {
      if (value < view.rangeStart || value > view.rangeEnd) continue
      const x = valueToX(value, view.rangeStart, scale.pxPerUnit)
      const isMajor = Math.abs(value / ticks.major - Math.round(value / ticks.major)) < 1e-6
      draw(
        ctx as CanvasRenderingContext2D,
        Line({ x, y: 0 }, { x, y: viewport.contentRect.h }, { color: isMajor ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)", hairline: true }),
      )
    }
  }
}

class TimelineTrackHeaderSurface implements Surface {
  readonly id: string
  constructor(private readonly host: TimelineCompositeSurface) {
    this.id = `${host.id}.Header`
  }

  render(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, viewport: ViewportContext) {
    const view = this.host.view()
    const metrics = this.host.trackMetrics()
    const visibleTracks = findVisibleTrackRange(viewport.scroll.y, viewport.contentRect.h, metrics)
    const bodyFont = font(theme, theme.typography.body)
    const titleFont = font(theme, { ...theme.typography.body, weight: 600 })

    draw(ctx as CanvasRenderingContext2D, RectOp({ x: 0, y: 0, w: viewport.contentRect.w, h: viewport.contentRect.h }, { fill: { color: "#131b29" } }))
    if (!visibleTracks) return

    for (let i = visibleTracks.first; i <= visibleTracks.last; i++) {
      const metric = metrics[i]
      const track = view.tracks[i]
      const y = metric.top
      draw(
        ctx as CanvasRenderingContext2D,
        RectOp({ x: 0, y, w: viewport.contentRect.w, h: metric.height }, { fill: { color: i % 2 === 0 ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.02)" } }),
        Line({ x: 0, y: y + metric.height + 0.5 }, { x: viewport.contentRect.w, y: y + metric.height + 0.5 }, { color: "rgba(255,255,255,0.08)", hairline: true }),
        Text({ x: 12, y: y + 12, text: track.name, style: { color: theme.colors.textPrimary, font: titleFont, baseline: "top" } }),
        Text({
          x: 12,
          y: y + metric.height - 12,
          text: `${track.kind ?? "generic"}  ${track.items.length} clips`,
          style: { color: theme.colors.textMuted, font: bodyFont, baseline: "alphabetic" },
        }),
      )
    }
  }

  onWheel(e: WheelUIEvent) {
    this.host.handleTimelineWheel(e, "header", e.x)
  }
}

class TimelineTrackContentSurface implements Surface {
  readonly id: string
  constructor(private readonly host: TimelineCompositeSurface) {
    this.id = `${host.id}.Content`
  }

  render(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, viewport: ViewportContext) {
    const view = this.host.view()
    const scale = this.host.scale()
    const metrics = this.host.trackMetrics()
    const visibleTracks = findVisibleTrackRange(viewport.scroll.y, viewport.contentRect.h, metrics)
    const visibleValues = findVisibleValueRange(viewport.scroll.x, viewport.contentRect.w, view.rangeStart, scale.pxPerUnit)
    const labelFont = font(theme, theme.typography.body)
    if (!visibleTracks) return

    for (let i = visibleTracks.first; i <= visibleTracks.last; i++) {
      const track = view.tracks[i]
      const metric = metrics[i]
      const y = metric.top + 6
      const h = Math.max(16, metric.height - 12)
      for (const item of track.items) {
        if (!itemIntersectsRange(item, visibleValues.start, visibleValues.end)) continue
        const x = valueToX(item.start, view.rangeStart, scale.pxPerUnit)
        const w = Math.max(8, item.duration * scale.pxPerUnit)
        const fill = item.color ?? "#4f8cff"
        const rect = { x, y, w, h }
        const label = fitLabel(ctx, item.label, w - 14, labelFont)
        draw(
          ctx as CanvasRenderingContext2D,
          RRect({ x: rect.x, y: rect.y, w: rect.w, h: rect.h, r: Math.min(theme.radii.sm, rect.h / 2) }, { fill: { color: fill }, stroke: { color: alpha(fill, "aa"), hairline: true }, pixelSnap: true }),
        )
        if (!label) continue
        draw(
          ctx as CanvasRenderingContext2D,
          Text({
            x: rect.x + 7,
            y: rect.y + rect.h / 2 + 0.5,
            text: label,
            style: { color: "#ffffff", font: labelFont, baseline: "middle" },
            maxWidth: Math.max(0, rect.w - 14),
          }),
        )
      }
    }
  }

  onWheel(e: WheelUIEvent) {
    this.host.handleTimelineWheel(e, "content", e.x - this.host.scroll().scrollX)
  }
}

export class TimelineCompositeSurface implements Surface {
  readonly id: string
  private readonly root = new SurfaceRoot()
  private readonly rulerSurface: TimelineRulerSurface
  private readonly backgroundSurface: TimelineContainerBackgroundSurface
  private readonly headerSurface: TimelineTrackHeaderSurface
  private readonly contentSurface: TimelineTrackContentSurface
  private readonly rulerViewport: ViewportElement
  private readonly backgroundViewport: ViewportElement
  private readonly headerViewport: ViewportElement
  private readonly contentViewport: ViewportElement
  private readonly hScrollbar: Scrollbar
  private readonly vScrollbar: Scrollbar
  private size: Vec2 = { x: 0, y: 0 }
  private readonly layoutState: TimelineLayout
  private readonly scaleState: TimelineScaleModel
  private readonly scrollState: TimelineScrollModel
  private readonly unit: TimelineUnitAdapter
  private trackLayout: TimelineTrackMetrics[] = []
  private totalTrackHeight = 0
  private readonly viewModel: TimelineViewModel
  private readonly defaultTrackHeight: number
  private readonly trackGap: number

  constructor(opts: {
    id: string
    view: TimelineViewModel
    unitAdapter?: TimelineUnitAdapter
    initialPxPerUnit?: number
    minPxPerUnit?: number
    maxPxPerUnit?: number
    headerWidth?: number
    rulerHeight?: number
    scrollbarSize?: number
    defaultTrackHeight?: number
    trackGap?: number
  }) {
    this.id = opts.id
    this.viewModel = opts.view
    this.defaultTrackHeight = Math.max(24, opts.defaultTrackHeight ?? 44)
    this.trackGap = Math.max(0, opts.trackGap ?? 6)
    this.unit = opts.unitAdapter ?? createGenericNumericUnitAdapter(opts.view.baseUnit)
    this.scaleState = {
      pxPerUnit: opts.initialPxPerUnit ?? 6,
      minPxPerUnit: opts.minPxPerUnit ?? 1,
      maxPxPerUnit: opts.maxPxPerUnit ?? 32,
      zoomAnchorMode: "pointer",
    }
    this.scrollState = { scrollX: 0, scrollY: 0, maxScrollX: 0, maxScrollY: 0 }
    this.layoutState = {
      headerWidth: opts.headerWidth ?? 164,
      rulerHeight: opts.rulerHeight ?? 34,
      scrollbarSize: opts.scrollbarSize ?? 12,
      contentRect: { x: 0, y: 0, w: 0, h: 0 },
      rulerRect: { x: 0, y: 0, w: 0, h: 0 },
      headerRect: { x: 0, y: 0, w: 0, h: 0 },
      backgroundRect: { x: 0, y: 0, w: 0, h: 0 },
      hScrollbarRect: { x: 0, y: 0, w: 0, h: 0 },
      vScrollbarRect: { x: 0, y: 0, w: 0, h: 0 },
      cornerRect: { x: 0, y: 0, w: 0, h: 0 },
    }

    this.rulerSurface = new TimelineRulerSurface(this)
    this.backgroundSurface = new TimelineContainerBackgroundSurface(this)
    this.headerSurface = new TimelineTrackHeaderSurface(this)
    this.contentSurface = new TimelineTrackContentSurface(this)

    this.rulerViewport = new ViewportElement({
      rect: () => this.layoutState.rulerRect,
      target: this.rulerSurface,
      options: { clip: true, scroll: () => ({ x: this.scrollState.scrollX, y: 0 }) },
    })
    this.backgroundViewport = new ViewportElement({ rect: () => this.layoutState.backgroundRect, target: this.backgroundSurface, options: { clip: true } })
    this.headerViewport = new ViewportElement({
      rect: () => this.layoutState.headerRect,
      target: this.headerSurface,
      options: { clip: true, scroll: () => ({ x: 0, y: this.scrollState.scrollY }) },
    })
    this.contentViewport = new ViewportElement({
      rect: () => this.layoutState.contentRect,
      target: this.contentSurface,
      options: { clip: true, scroll: () => ({ x: this.scrollState.scrollX, y: this.scrollState.scrollY }) },
    })
    this.backgroundViewport.z = 1
    this.contentViewport.z = 2
    this.headerViewport.z = 2
    this.rulerViewport.z = 3
    this.root.add(this.backgroundViewport)
    this.root.add(this.contentViewport)
    this.root.add(this.headerViewport)
    this.root.add(this.rulerViewport)

    this.hScrollbar = new Scrollbar({
      rect: () => this.layoutState.hScrollbarRect,
      axis: "x",
      viewportSize: () => this.layoutState.contentRect.w,
      contentSize: () => this.contentPixelSize().x,
      value: () => this.scrollState.scrollX,
      onChange: (next) => {
        this.scrollState.scrollX = clamp(next, 0, this.scrollState.maxScrollX)
      },
      autoHide: true,
    })
    this.vScrollbar = new Scrollbar({
      rect: () => this.layoutState.vScrollbarRect,
      axis: "y",
      viewportSize: () => this.layoutState.contentRect.h,
      contentSize: () => this.totalTrackHeight,
      value: () => this.scrollState.scrollY,
      onChange: (next) => {
        this.scrollState.scrollY = clamp(next, 0, this.scrollState.maxScrollY)
      },
      autoHide: true,
    })
    this.hScrollbar.z = 10
    this.vScrollbar.z = 10
    this.root.add(this.hScrollbar)
    this.root.add(this.vScrollbar)

    this.recomputeTrackMetrics()
  }

  view() {
    return this.viewModel
  }

  unitAdapter() {
    return this.unit
  }

  scale() {
    return this.scaleState
  }

  scroll() {
    return this.scrollState
  }

  layout() {
    return this.layoutState
  }

  trackMetrics() {
    return this.trackLayout
  }

  contentSize() {
    return this.contentPixelSize()
  }

  private contentPixelSize() {
    const width = (this.viewModel.rangeEnd - this.viewModel.rangeStart) * this.scaleState.pxPerUnit
    return { x: Math.max(0, width), y: this.totalTrackHeight }
  }

  private recomputeTrackMetrics() {
    const out = computeTrackMetrics(this.viewModel.tracks, { defaultTrackHeight: this.defaultTrackHeight, trackGap: this.trackGap })
    this.trackLayout = out.metrics
    this.totalTrackHeight = out.totalHeight
  }

  private updateLayout(viewport: ViewportContext) {
    this.size = { x: viewport.contentRect.w, y: viewport.contentRect.h }
    const sb = this.layoutState.scrollbarSize
    const headerWidth = clamp(this.layoutState.headerWidth, 120, Math.max(120, this.size.x - 80))
    const rulerHeight = clamp(this.layoutState.rulerHeight, 28, Math.max(28, this.size.y - 60))
    const rightW = Math.max(0, this.size.x - headerWidth)
    const bottomH = Math.max(0, this.size.y - rulerHeight)
    const contentW = Math.max(0, rightW - sb)
    const contentH = Math.max(0, bottomH - sb)
    this.layoutState.headerWidth = headerWidth
    this.layoutState.rulerHeight = rulerHeight
    this.layoutState.cornerRect = { x: 0, y: 0, w: headerWidth, h: rulerHeight }
    this.layoutState.rulerRect = { x: headerWidth, y: 0, w: contentW, h: rulerHeight }
    this.layoutState.headerRect = { x: 0, y: rulerHeight, w: headerWidth, h: contentH }
    this.layoutState.backgroundRect = { x: headerWidth, y: rulerHeight, w: contentW, h: contentH }
    this.layoutState.contentRect = { x: headerWidth, y: rulerHeight, w: contentW, h: contentH }
    this.layoutState.hScrollbarRect = { x: headerWidth, y: rulerHeight + contentH, w: contentW, h: sb }
    this.layoutState.vScrollbarRect = { x: headerWidth + contentW, y: rulerHeight, w: sb, h: contentH }
    this.scrollState.maxScrollX = computeHorizontalScrollLimit(this.viewModel.rangeStart, this.viewModel.rangeEnd, this.scaleState.pxPerUnit, contentW)
    this.scrollState.maxScrollY = computeVerticalScrollLimit(this.totalTrackHeight, contentH)
    this.scrollState.scrollX = clamp(this.scrollState.scrollX, 0, this.scrollState.maxScrollX)
    this.scrollState.scrollY = clamp(this.scrollState.scrollY, 0, this.scrollState.maxScrollY)
  }

  handleTimelineWheel(e: WheelUIEvent, zone: "ruler" | "header" | "content", pointerX = e.x) {
    if ((e.ctrlKey || e.metaKey) && zone !== "header") {
      this.zoomByWheel(e, pointerX)
      return
    }
    const prefersHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY)
    if (prefersHorizontal && zone !== "header") {
      this.scrollState.scrollX = clamp(this.scrollState.scrollX + e.deltaX, 0, this.scrollState.maxScrollX)
      e.handle()
      return
    }
    const deltaY = e.deltaY + (zone === "ruler" ? e.deltaX : 0)
    if (deltaY === 0) return
    this.scrollState.scrollY = clamp(this.scrollState.scrollY + deltaY, 0, this.scrollState.maxScrollY)
    e.handle()
  }

  private zoomByWheel(e: WheelUIEvent, pointerX: number) {
    const direction = e.deltaY === 0 ? e.deltaX : e.deltaY
    const factor = direction < 0 ? 1.12 : 1 / 1.12
    const nextPxPerUnit = clampPxPerUnit(this.scaleState, this.scaleState.pxPerUnit * factor)
    if (Math.abs(nextPxPerUnit - this.scaleState.pxPerUnit) < 1e-6) return
    const nextScrollX = zoomAroundPointer({
      pointerX,
      viewportWidth: this.layoutState.contentRect.w,
      rangeStart: this.viewModel.rangeStart,
      scrollX: this.scrollState.scrollX,
      pxPerUnit: this.scaleState.pxPerUnit,
      nextPxPerUnit,
      zoomAnchorMode: this.scaleState.zoomAnchorMode,
    })
    this.scaleState.pxPerUnit = nextPxPerUnit
    this.scrollState.maxScrollX = computeHorizontalScrollLimit(
      this.viewModel.rangeStart,
      this.viewModel.rangeEnd,
      this.scaleState.pxPerUnit,
      this.layoutState.contentRect.w,
    )
    this.scrollState.scrollX = clamp(nextScrollX, 0, this.scrollState.maxScrollX)
    e.handle()
  }

  private playheadX() {
    const playhead = this.viewModel.playhead
    if (playhead === undefined) return null
    return this.layoutState.headerWidth + valueToX(playhead, this.viewModel.rangeStart, this.scaleState.pxPerUnit) - this.scrollState.scrollX
  }

  private seekAt(surfaceX: number) {
    const contentLocalX = surfaceX - this.layoutState.contentRect.x + this.scrollState.scrollX
    const value = Math.max(this.viewModel.rangeStart, Math.min(this.viewModel.rangeEnd, this.viewModel.rangeStart + contentLocalX / Math.max(1e-6, this.scaleState.pxPerUnit)))
    this.viewModel.onSeek?.(value)
  }

  render(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, viewport: ViewportContext) {
    this.recomputeTrackMetrics()
    this.updateLayout(viewport)

    draw(
      ctx as CanvasRenderingContext2D,
      RectOp({ x: 0, y: 0, w: this.size.x, h: this.size.y }, { fill: { color: "#0d131d" } }),
      RectOp(this.layoutState.cornerRect, { fill: { color: "#151d2b" } }),
      Line({ x: this.layoutState.cornerRect.w + 0.5, y: 0 }, { x: this.layoutState.cornerRect.w + 0.5, y: this.size.y }, { color: "rgba(255,255,255,0.10)", hairline: true }),
      Line({ x: 0, y: this.layoutState.cornerRect.h + 0.5 }, { x: this.size.x, y: this.layoutState.cornerRect.h + 0.5 }, { color: "rgba(255,255,255,0.10)", hairline: true }),
      Text({
        x: 12,
        y: this.layoutState.cornerRect.h / 2 + 0.5,
        text: "Tracks",
        style: { color: theme.colors.textMuted, font: font(theme, theme.typography.body), baseline: "middle" },
      }),
    )

    this.root.draw(ctx as CanvasRenderingContext2D)

    const playheadX = this.playheadX()
    if (playheadX !== null && playheadX >= this.layoutState.headerWidth && playheadX <= this.layoutState.headerWidth + this.layoutState.contentRect.w) {
      draw(
        ctx as CanvasRenderingContext2D,
        Line({ x: playheadX + 0.5, y: 0 }, { x: playheadX + 0.5, y: this.layoutState.rulerRect.h + this.layoutState.contentRect.h }, { color: "rgba(255,116,116,0.95)", width: 2 }),
        RRect({ x: playheadX - 18, y: 4, w: 36, h: 16, r: 6 }, { fill: { color: "rgba(255,116,116,0.92)" }, pixelSnap: true }),
        Text({ x: playheadX, y: 12.5, text: "PH", style: { color: "#1b0b0b", font: `${700} 10px ${theme.typography.family}`, align: "center", baseline: "middle" } }),
      )
    }
  }

  hitTest(pSurface: Vec2) {
    return this.root.hitTest(pSurface)
  }

  onPointerDown(e: PointerUIEvent) {
    if (pointInRect({ x: e.x, y: e.y }, this.layoutState.rulerRect) || pointInRect({ x: e.x, y: e.y }, this.layoutState.contentRect)) {
      this.seekAt(e.x)
      e.handle()
    }
  }

  onWheel(e: WheelUIEvent) {
    if (pointInRect({ x: e.x, y: e.y }, this.layoutState.headerRect)) this.handleTimelineWheel(e, "header", e.x - this.layoutState.headerRect.x)
    else if (pointInRect({ x: e.x, y: e.y }, this.layoutState.rulerRect)) this.handleTimelineWheel(e, "ruler", e.x - this.layoutState.rulerRect.x)
    else if (pointInRect({ x: e.x, y: e.y }, this.layoutState.contentRect)) this.handleTimelineWheel(e, "content", e.x - this.layoutState.contentRect.x)
  }
}
