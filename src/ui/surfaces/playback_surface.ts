import { theme, font } from "../../config/theme"
import { draw, Line, Rect as RectOp, RRect, Text } from "../../core/draw"
import { clamp } from "../../core/rect"
import { getPlaybackSession } from "../playback/session"
import { formatTimecode } from "../playback/timecode"
import { pointInRect, type Rect, type Vec2 } from "../base/ui"
import { SurfaceRoot, type Surface, type ViewportContext } from "../base/viewport"
import { Button } from "../widgets/button"
import { Scrollbar } from "../widgets/scrollbar"
import { Slider } from "../widgets/slider"
import { UIElement, PointerUIEvent } from "../base/ui"

const SIDEBAR_W = 240
const TOOLBAR_H = 34
const PREVIEW_MIN_H = 180
const CONTROL_H = 138
const FILE_ROW_H = 28

type PlaybackLayout = {
  frame: Rect
  sidebarRect: Rect
  sidebarToolbarRect: Rect
  fileListRect: Rect
  previewRect: Rect
  previewFrameRect: Rect
  progressRect: Rect
  controlsRect: Rect
  statusRect: Rect
  currentPathRect: Rect
  prevButtonRect: Rect
  playButtonRect: Rect
  nextButtonRect: Rect
  volumeRect: Rect
  volumeLabelRect: Rect
  timeRect: Rect
  importButtonRect: Rect
  refreshButtonRect: Rect
  muteButtonRect: Rect
  rateDownButtonRect: Rect
  rateUpButtonRect: Rect
  rateTextRect: Rect
  diagnosticsRect: Rect
  fileScrollbarRect: Rect
}

export function formatPlaybackTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00"
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
}

class FileRow extends UIElement {
  hover = false

  constructor(
    private readonly rect: () => Rect,
    private readonly label: () => string,
    private readonly active: () => boolean,
    private readonly selected: () => boolean,
    private readonly onClick: () => void,
  ) {
    super()
    this.z = 5
  }

  bounds(): Rect {
    return this.active() ? this.rect() : { x: 0, y: 0, w: 0, h: 0 }
  }

  protected containsPoint(p: Vec2) {
    return this.active() && pointInRect(p, this.rect())
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (!this.active()) return
    const r = this.rect()
    const selected = this.selected()
    const fill = selected
      ? "rgba(124,183,255,0.24)"
      : this.hover
        ? "rgba(255,255,255,0.06)"
        : "transparent"
    draw(
      ctx,
      RRect({ x: r.x, y: r.y, w: r.w, h: r.h, r: theme.radii.sm }, { fill: { color: fill }, stroke: selected ? { color: "rgba(124,183,255,0.55)", hairline: true } : undefined, pixelSnap: true }),
      Text({ x: r.x + 10, y: r.y + r.h / 2 + 0.5, text: this.label(), style: { color: selected ? theme.colors.textPrimary : theme.colors.textMuted, font: font(theme, theme.typography.body), baseline: "middle" }, maxWidth: Math.max(0, r.w - 18) }),
    )
  }

  onPointerEnter() {
    this.hover = true
    this.invalidateSelf({ pad: 6 })
  }

  onPointerLeave() {
    this.hover = false
    this.invalidateSelf({ pad: 6 })
  }

  onPointerDown(e: PointerUIEvent) {
    if (e.button !== 0 || !this.active()) return
    e.capture()
  }

  onPointerUp() {
    if (!this.active() || !this.hover) return
    this.onClick()
  }
}

class PlaybackFileListElement extends UIElement {
  private hoverIndex = -1

  constructor(
    private readonly rect: () => Rect,
    private readonly scrollY: () => number,
    private readonly entries: () => Array<{ path: string }>,
    private readonly selectedPath: () => string | null,
    private readonly onSelect: (path: string) => void,
  ) {
    super()
    this.z = 6
  }

  bounds(): Rect {
    return this.rect()
  }

  protected containsPoint(p: Vec2) {
    return pointInRect(p, this.rect())
  }

  private rowIndexAt(point: Vec2) {
    const r = this.rect()
    if (!pointInRect(point, r)) return -1
    const localY = point.y - r.y - 8 + this.scrollY()
    const index = Math.floor(localY / FILE_ROW_H)
    return index >= 0 && index < this.entries().length ? index : -1
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    const r = this.rect()
    draw(ctx, RRect({ x: r.x + 6, y: r.y + 2, w: Math.max(0, r.w - 12), h: Math.max(0, r.h - 4), r: 8 }, { fill: { color: "rgba(255,255,255,0.02)" }, stroke: { color: "rgba(255,255,255,0.06)", hairline: true }, pixelSnap: true }))
    ctx.save()
    ctx.beginPath()
    ctx.rect(r.x + 6, r.y + 4, Math.max(0, r.w - 18), Math.max(0, r.h - 8))
    ctx.clip()
    const entries = this.entries()
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index]
      const y = r.y + 8 + index * FILE_ROW_H - this.scrollY()
      const rowRect = { x: r.x + 10, y, w: Math.max(0, r.w - 26), h: FILE_ROW_H - 4 }
      if (rowRect.y + rowRect.h < r.y + 4 || rowRect.y > r.y + r.h - 4) continue
      const selected = this.selectedPath() === entry.path
      const fill = selected ? "rgba(124,183,255,0.24)" : this.hoverIndex === index ? "rgba(255,255,255,0.06)" : "transparent"
      draw(
        ctx,
        RRect({ x: rowRect.x, y: rowRect.y, w: rowRect.w, h: rowRect.h, r: theme.radii.sm }, { fill: { color: fill }, stroke: selected ? { color: "rgba(124,183,255,0.55)", hairline: true } : undefined, pixelSnap: true }),
        Text({ x: rowRect.x + 10, y: rowRect.y + rowRect.h / 2 + 0.5, text: entry.path, style: { color: selected ? theme.colors.textPrimary : theme.colors.textMuted, font: font(theme, theme.typography.body), baseline: "middle" }, maxWidth: Math.max(0, rowRect.w - 18) }),
      )
    }
    ctx.restore()
  }

  onPointerMove(e: PointerUIEvent) {
    const next = this.rowIndexAt({ x: e.x, y: e.y })
    if (next === this.hoverIndex) return
    this.hoverIndex = next
    this.invalidateSelf({ pad: 8 })
  }

  onPointerLeave() {
    if (this.hoverIndex < 0) return
    this.hoverIndex = -1
    this.invalidateSelf({ pad: 8 })
  }

  onPointerDown(e: PointerUIEvent) {
    if (e.button !== 0) return
    e.capture()
  }

  onPointerUp(e: PointerUIEvent) {
    const index = this.rowIndexAt({ x: e.x, y: e.y })
    if (index < 0) return
    this.onSelect(this.entries()[index].path)
  }
}

export class PlaybackSurface implements Surface {
  readonly id: string
  private readonly root = new SurfaceRoot()
  private readonly session = getPlaybackSession()
  private readonly layoutState: PlaybackLayout = {
    frame: { x: 0, y: 0, w: 0, h: 0 },
    sidebarRect: { x: 0, y: 0, w: 0, h: 0 },
    sidebarToolbarRect: { x: 0, y: 0, w: 0, h: 0 },
    fileListRect: { x: 0, y: 0, w: 0, h: 0 },
    previewRect: { x: 0, y: 0, w: 0, h: 0 },
    previewFrameRect: { x: 0, y: 0, w: 0, h: 0 },
    progressRect: { x: 0, y: 0, w: 0, h: 0 },
    controlsRect: { x: 0, y: 0, w: 0, h: 0 },
    statusRect: { x: 0, y: 0, w: 0, h: 0 },
    currentPathRect: { x: 0, y: 0, w: 0, h: 0 },
    prevButtonRect: { x: 0, y: 0, w: 0, h: 0 },
    playButtonRect: { x: 0, y: 0, w: 0, h: 0 },
    nextButtonRect: { x: 0, y: 0, w: 0, h: 0 },
    volumeRect: { x: 0, y: 0, w: 0, h: 0 },
    volumeLabelRect: { x: 0, y: 0, w: 0, h: 0 },
    timeRect: { x: 0, y: 0, w: 0, h: 0 },
    importButtonRect: { x: 0, y: 0, w: 0, h: 0 },
    refreshButtonRect: { x: 0, y: 0, w: 0, h: 0 },
    muteButtonRect: { x: 0, y: 0, w: 0, h: 0 },
    rateDownButtonRect: { x: 0, y: 0, w: 0, h: 0 },
    rateUpButtonRect: { x: 0, y: 0, w: 0, h: 0 },
    rateTextRect: { x: 0, y: 0, w: 0, h: 0 },
    diagnosticsRect: { x: 0, y: 0, w: 0, h: 0 },
    fileScrollbarRect: { x: 0, y: 0, w: 0, h: 0 },
  }
  private initialized = false
  private fileScrollY = 0

  private readonly fileList: PlaybackFileListElement
  private readonly fileScrollbar: Scrollbar
  private readonly importButton: Button
  private readonly refreshButton: Button
  private readonly playButton: Button
  private readonly prevButton: Button
  private readonly nextButton: Button
  private readonly muteButton: Button
  private readonly rateDownButton: Button
  private readonly rateUpButton: Button
  private readonly progressSlider: Slider
  private readonly volumeSlider: Slider

  constructor(opts: { id: string }) {
    this.id = opts.id
    this.session.ensureInitialized()
    this.fileList = new PlaybackFileListElement(
      () => this.layoutState.fileListRect,
      () => this.fileScrollY,
      () => this.session.snapshot().entries,
      () => this.session.snapshot().selectedPath,
      (path) => void this.session.selectPath(path),
    )
    this.fileScrollbar = new Scrollbar({
      rect: () => this.layoutState.fileScrollbarRect,
      axis: "y",
      viewportSize: () => Math.max(0, this.layoutState.fileListRect.h - 12),
      contentSize: () => Math.max(0, this.session.snapshot().entries.length * FILE_ROW_H + 16),
      value: () => this.fileScrollY,
      onChange: (next) => {
        this.fileScrollY = next
      },
    })
    this.importButton = new Button({ rect: () => this.layoutState.importButtonRect, text: "Import", onClick: () => void this.session.importFiles() })
    this.refreshButton = new Button({ rect: () => this.layoutState.refreshButtonRect, text: "Refresh", onClick: () => void this.session.refreshEntries() })
    this.playButton = new Button({ rect: () => this.layoutState.playButtonRect, text: () => this.session.runtimeSnapshot().playing ? "Pause" : "Play", onClick: () => void this.session.togglePlayPause(), disabled: () => !this.session.runtimeSnapshot().ready || this.session.snapshot().busy })
    this.prevButton = new Button({ rect: () => this.layoutState.prevButtonRect, text: "Prev", title: "Previous Frame", onClick: () => this.session.stepFrame(-1), disabled: () => !this.session.runtimeSnapshot().ready || this.session.snapshot().busy })
    this.nextButton = new Button({ rect: () => this.layoutState.nextButtonRect, text: "Next", title: "Next Frame", onClick: () => this.session.stepFrame(1), disabled: () => !this.session.runtimeSnapshot().ready || this.session.snapshot().busy })
    this.muteButton = new Button({ rect: () => this.layoutState.muteButtonRect, text: () => this.session.runtimeSnapshot().muted ? "Unmute" : "Mute", onClick: () => this.session.toggleMuted(), disabled: () => this.session.snapshot().busy })
    this.rateDownButton = new Button({ rect: () => this.layoutState.rateDownButtonRect, text: "-", title: "Slower", onClick: () => this.session.setPlaybackRate(this.session.runtimeSnapshot().playbackRate / 2), disabled: () => this.session.snapshot().busy })
    this.rateUpButton = new Button({ rect: () => this.layoutState.rateUpButtonRect, text: "+", title: "Faster", onClick: () => this.session.setPlaybackRate(this.session.runtimeSnapshot().playbackRate * 2), disabled: () => this.session.snapshot().busy })
    this.progressSlider = new Slider({ rect: () => this.layoutState.progressRect, min: 0, max: () => Math.max(this.session.runtimeSnapshot().duration, 0.001), value: () => this.session.runtimeSnapshot().currentTime, onChange: (next) => this.session.seekTo(next), disabled: () => !this.session.runtimeSnapshot().ready || this.session.snapshot().busy })
    this.volumeSlider = new Slider({ rect: () => this.layoutState.volumeRect, min: 0, max: 1, value: () => this.session.runtimeSnapshot().volume, onChange: (next) => this.session.setVolume(next), disabled: () => this.session.snapshot().busy })
    this.root.add(this.fileList)
    this.root.add(this.fileScrollbar)
    this.root.add(this.importButton)
    this.root.add(this.refreshButton)
    this.root.add(this.prevButton)
    this.root.add(this.playButton)
    this.root.add(this.nextButton)
    this.root.add(this.muteButton)
    this.root.add(this.rateDownButton)
    this.root.add(this.rateUpButton)
    this.root.add(this.progressSlider)
    this.root.add(this.volumeSlider)
  }

  private updateLayout(viewport: ViewportContext) {
    const frame = { x: 0, y: 0, w: viewport.contentRect.w, h: viewport.contentRect.h }
    this.layoutState.frame = frame
    const sidebarW = Math.min(SIDEBAR_W, Math.max(180, frame.w * 0.3))
    const sidebarRect = { x: 0, y: 0, w: sidebarW, h: frame.h }
    const previewX = sidebarRect.w + 1
    const previewW = Math.max(0, frame.w - previewX)
    const controlsH = Math.min(CONTROL_H, Math.max(88, frame.h * 0.24))
    const previewRect = { x: previewX, y: 0, w: previewW, h: Math.max(PREVIEW_MIN_H, frame.h - controlsH) }
    const controlsRect = { x: previewX, y: previewRect.h, w: previewW, h: frame.h - previewRect.h }
    const previewPad = 16
    const previewFrameRect = { x: previewRect.x + previewPad, y: previewRect.y + 40, w: Math.max(0, previewRect.w - previewPad * 2), h: Math.max(0, previewRect.h - 56) }
    const sidebarToolbarRect = { x: sidebarRect.x + 8, y: sidebarRect.y + 8, w: sidebarRect.w - 16, h: TOOLBAR_H }
    const fileListRect = { x: sidebarRect.x, y: sidebarToolbarRect.y + sidebarToolbarRect.h + 6, w: sidebarRect.w, h: Math.max(0, sidebarRect.h - sidebarToolbarRect.h - 22) }
    const progressRect = { x: controlsRect.x + 18, y: controlsRect.y + 18, w: Math.max(0, controlsRect.w - 36), h: 18 }
    const buttonY = progressRect.y + progressRect.h + 16
    const prevButtonRect = { x: controlsRect.x + 18, y: buttonY, w: 58, h: 28 }
    const playButtonRect = { x: prevButtonRect.x + prevButtonRect.w + 8, y: buttonY, w: 70, h: 28 }
    const nextButtonRect = { x: playButtonRect.x + playButtonRect.w + 8, y: buttonY, w: 58, h: 28 }
    const volumeLabelRect = { x: controlsRect.x + controlsRect.w - 180, y: buttonY + 6, w: 26, h: 16 }
    const volumeRect = { x: volumeLabelRect.x + volumeLabelRect.w + 8, y: buttonY + 4, w: 140, h: 20 }
    const timeRect = { x: nextButtonRect.x + nextButtonRect.w + 16, y: buttonY + 6, w: Math.max(80, volumeLabelRect.x - (nextButtonRect.x + nextButtonRect.w + 28)), h: 16 }
    const statusRect = { x: previewRect.x + 16, y: previewRect.y + 12, w: previewRect.w - 32, h: 16 }
    const currentPathRect = { x: controlsRect.x + 18, y: buttonY + 36, w: controlsRect.w - 36, h: 16 }
    const importButtonRect = { x: sidebarToolbarRect.x, y: sidebarToolbarRect.y, w: 72, h: 26 }
    const refreshButtonRect = { x: importButtonRect.x + importButtonRect.w + 8, y: sidebarToolbarRect.y, w: 72, h: 26 }
    const muteButtonRect = { x: nextButtonRect.x + nextButtonRect.w + 16, y: buttonY, w: 72, h: 28 }
    const rateDownButtonRect = { x: muteButtonRect.x + muteButtonRect.w + 12, y: buttonY, w: 28, h: 28 }
    const rateTextRect = { x: rateDownButtonRect.x + rateDownButtonRect.w + 6, y: buttonY + 6, w: 52, h: 16 }
    const rateUpButtonRect = { x: rateTextRect.x + rateTextRect.w + 6, y: buttonY, w: 28, h: 28 }
    const diagnosticsRect = { x: controlsRect.x + 18, y: currentPathRect.y + 22, w: controlsRect.w - 36, h: Math.max(0, controlsRect.h - (currentPathRect.y + 30 - controlsRect.y)) }
    const fileScrollbarRect = { x: fileListRect.x + Math.max(0, fileListRect.w - 14), y: fileListRect.y + 8, w: 10, h: Math.max(0, fileListRect.h - 16) }

    this.layoutState.sidebarRect = sidebarRect
    this.layoutState.sidebarToolbarRect = sidebarToolbarRect
    this.layoutState.fileListRect = fileListRect
    this.layoutState.previewRect = previewRect
    this.layoutState.previewFrameRect = previewFrameRect
    this.layoutState.controlsRect = controlsRect
    this.layoutState.progressRect = progressRect
    this.layoutState.prevButtonRect = prevButtonRect
    this.layoutState.playButtonRect = playButtonRect
    this.layoutState.nextButtonRect = nextButtonRect
    this.layoutState.volumeLabelRect = volumeLabelRect
    this.layoutState.volumeRect = volumeRect
    this.layoutState.timeRect = timeRect
    this.layoutState.statusRect = statusRect
    this.layoutState.currentPathRect = currentPathRect
    this.layoutState.importButtonRect = importButtonRect
    this.layoutState.refreshButtonRect = refreshButtonRect
    this.layoutState.muteButtonRect = muteButtonRect
    this.layoutState.rateDownButtonRect = rateDownButtonRect
    this.layoutState.rateUpButtonRect = rateUpButtonRect
    this.layoutState.rateTextRect = rateTextRect
    this.layoutState.diagnosticsRect = diagnosticsRect
    this.layoutState.fileScrollbarRect = fileScrollbarRect
  }

  render(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, viewport: ViewportContext) {
    if (!this.initialized) {
      this.initialized = true
      this.session.ensureInitialized()
    }
    this.updateLayout(viewport)

    const session = this.session.snapshot()
    const snap = session.runtime
    const maxListScroll = Math.max(0, session.entries.length * FILE_ROW_H + 16 - Math.max(0, this.layoutState.fileListRect.h - 12))
    this.fileScrollY = clamp(this.fileScrollY, 0, maxListScroll)
    const status = session.busy ? "Loading..." : session.error ?? (snap.ready ? `${snap.width}x${snap.height}${snap.frameRate ? ` · ${snap.frameRate.toFixed(1)} fps` : ""}` : "Select an OPFS video or import one")
    const timeText = `${formatPlaybackTime(snap.currentTime)} / ${formatPlaybackTime(snap.duration)}`
    const timecode = formatTimecode(snap.currentTime, snap.frameRate ?? 30)
    const diagnostics = [
      `mime: ${snap.resolvedMime ?? "-"}`,
      `blob: ${snap.blobType ?? "-"}`,
      `canPlay: ${snap.canPlayType || "no"}`,
      `ready/network: ${snap.readyState}/${snap.networkState}`,
      `rate: ${snap.playbackRate.toFixed(2)}x`,
      `muted: ${snap.muted ? "yes" : "no"}`,
      `errorCode: ${snap.errorCode ?? "-"}`,
    ]

    draw(
      ctx as CanvasRenderingContext2D,
      RectOp({ x: 0, y: 0, w: this.layoutState.frame.w, h: this.layoutState.frame.h }, { fill: { color: "#0c121b" } }),
      RectOp(this.layoutState.sidebarRect, { fill: { color: "#101826" } }),
      RectOp(this.layoutState.previewRect, { fill: { color: "#0d131d" } }),
      RectOp(this.layoutState.controlsRect, { fill: { color: "#111927" } }),
      Line({ x: this.layoutState.sidebarRect.w + 0.5, y: 0 }, { x: this.layoutState.sidebarRect.w + 0.5, y: this.layoutState.frame.h }, { color: "rgba(255,255,255,0.09)", hairline: true }),
      Line({ x: this.layoutState.controlsRect.x, y: this.layoutState.controlsRect.y + 0.5 }, { x: this.layoutState.frame.w, y: this.layoutState.controlsRect.y + 0.5 }, { color: "rgba(255,255,255,0.09)", hairline: true }),
      Text({ x: this.layoutState.sidebarRect.x + 10, y: 16, text: "OPFS Media", style: { color: theme.colors.textPrimary, font: font(theme, theme.typography.title), baseline: "top" } }),
      Text({ x: this.layoutState.statusRect.x, y: this.layoutState.statusRect.y, text: status, style: { color: session.error ? "rgba(255,120,120,0.95)" : theme.colors.textMuted, font: font(theme, theme.typography.body), baseline: "top" }, maxWidth: Math.max(0, this.layoutState.statusRect.w) }),
      Text({ x: this.layoutState.volumeLabelRect.x, y: this.layoutState.volumeLabelRect.y, text: "Vol", style: { color: theme.colors.textMuted, font: font(theme, theme.typography.body), baseline: "top" } }),
      Text({ x: this.layoutState.timeRect.x, y: this.layoutState.timeRect.y, text: timeText, style: { color: theme.colors.textPrimary, font: font(theme, theme.typography.body), baseline: "top" }, maxWidth: Math.max(0, this.layoutState.timeRect.w) }),
      Text({ x: this.layoutState.currentPathRect.x, y: this.layoutState.currentPathRect.y, text: session.selectedPath ?? "No source selected", style: { color: theme.colors.textMuted, font: font(theme, theme.typography.body), baseline: "top" }, maxWidth: Math.max(0, this.layoutState.currentPathRect.w) }),
      Text({ x: this.layoutState.rateTextRect.x, y: this.layoutState.rateTextRect.y, text: `${snap.playbackRate.toFixed(2)}x`, style: { color: theme.colors.textPrimary, font: font(theme, theme.typography.body), baseline: "top", align: "center" }, maxWidth: Math.max(0, this.layoutState.rateTextRect.w) }),
      Text({ x: this.layoutState.previewRect.x + this.layoutState.previewRect.w - 12, y: this.layoutState.previewRect.y + 16, text: timecode, style: { color: theme.colors.textPrimary, font: `${700} 16px ${theme.typography.family}`, baseline: "top", align: "right" } }),
    )

    draw(
      ctx as CanvasRenderingContext2D,
      RRect({ x: this.layoutState.previewFrameRect.x, y: this.layoutState.previewFrameRect.y, w: this.layoutState.previewFrameRect.w, h: this.layoutState.previewFrameRect.h, r: 10 }, { fill: { color: "#06090f" }, stroke: { color: "rgba(255,255,255,0.08)", hairline: true }, pixelSnap: true }),
    )
    const drewVideo = this.session.drawVideo(ctx, {
      x: this.layoutState.previewFrameRect.x + 10,
      y: this.layoutState.previewFrameRect.y + 10,
      w: Math.max(0, this.layoutState.previewFrameRect.w - 20),
      h: Math.max(0, this.layoutState.previewFrameRect.h - 20),
    })
    if (!drewVideo) {
      draw(
        ctx as CanvasRenderingContext2D,
        Text({ x: this.layoutState.previewFrameRect.x + this.layoutState.previewFrameRect.w / 2, y: this.layoutState.previewFrameRect.y + this.layoutState.previewFrameRect.h / 2 + 0.5, text: session.busy ? "Preparing preview..." : "Playback Preview", style: { color: theme.colors.textMuted, font: font(theme, theme.typography.headline), align: "center", baseline: "middle" } }),
      )
    }

    if (!session.entries.length && !session.busy) {
      draw(
        ctx as CanvasRenderingContext2D,
        Text({ x: this.layoutState.fileListRect.x + 12, y: this.layoutState.fileListRect.y + 18, text: "No video assets found in OPFS.", style: { color: theme.colors.textMuted, font: font(theme, theme.typography.body), baseline: "top" }, maxWidth: Math.max(0, this.layoutState.fileListRect.w - 24) }),
      )
    }

    for (let index = 0; index < diagnostics.length; index++) {
      draw(
        ctx as CanvasRenderingContext2D,
        Text({ x: this.layoutState.diagnosticsRect.x, y: this.layoutState.diagnosticsRect.y + index * 14, text: diagnostics[index], style: { color: theme.colors.textMuted, font: `${400} 11px ${theme.typography.family}`, baseline: "top" }, maxWidth: Math.max(0, this.layoutState.diagnosticsRect.w) }),
      )
    }

    this.root.draw(ctx as CanvasRenderingContext2D)
  }

  hitTest(pSurface: Vec2) {
    return this.root.hitTest(pSurface)
  }

  onWheel(e: import("../base/ui").WheelUIEvent) {
    if (!pointInRect({ x: e.x, y: e.y }, this.layoutState.fileListRect)) return
    const maxListScroll = Math.max(0, this.session.snapshot().entries.length * FILE_ROW_H + 16 - Math.max(0, this.layoutState.fileListRect.h - 12))
    const next = clamp(this.fileScrollY + e.deltaY, 0, maxListScroll)
    if (next === this.fileScrollY) return
    this.fileScrollY = next
    e.handle()
  }

  debugSnapshot(viewport: ViewportContext) {
    return {
      kind: "surface" as const,
      type: "PlaybackSurface",
      label: this.id,
      id: this.id,
      bounds: viewport.rect,
      visible: true,
      meta: this.session.snapshot().selectedPath ?? "idle",
      children: this.root.debugSnapshot().children,
    }
  }
}