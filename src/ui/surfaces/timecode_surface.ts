import { font, theme } from "../../config/theme"
import { draw, Rect as RectOp, RRect, Text } from "../../core/draw"
import { getPlaybackSession } from "../playback/session"
import { formatTimecode } from "../playback/timecode"
import type { Surface, ViewportContext } from "../base/viewport"

export class TimecodeSurface implements Surface {
  readonly id: string
  private readonly session = getPlaybackSession()

  constructor(opts: { id: string }) {
    this.id = opts.id
    this.session.ensureInitialized()
  }

  render(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, viewport: ViewportContext) {
    const snap = this.session.snapshot()
    const fps = snap.runtime.frameRate ?? 30
    const timecode = formatTimecode(snap.runtime.currentTime, fps)
    const meta = snap.selectedPath ?? "No source selected"
    const state = snap.runtime.playing ? `Playing · ${snap.runtime.playbackRate.toFixed(2)}x` : `Paused · ${snap.runtime.playbackRate.toFixed(2)}x`
    draw(
      ctx as CanvasRenderingContext2D,
      RectOp({ x: 0, y: 0, w: viewport.contentRect.w, h: viewport.contentRect.h }, { fill: { color: "#0d121a" } }),
      RRect({ x: 10, y: 10, w: Math.max(0, viewport.contentRect.w - 20), h: Math.max(0, viewport.contentRect.h - 20), r: 12 }, { fill: { color: "rgba(255,255,255,0.03)" }, stroke: { color: "rgba(255,255,255,0.10)", hairline: true }, pixelSnap: true }),
      Text({ x: viewport.contentRect.w / 2, y: viewport.contentRect.h / 2 - 8, text: timecode, style: { color: theme.colors.textPrimary, font: `700 34px ${theme.typography.family}`, align: "center", baseline: "middle" } }),
      Text({ x: viewport.contentRect.w / 2, y: viewport.contentRect.h / 2 + 26, text: state, style: { color: theme.colors.textMuted, font: font(theme, theme.typography.body), align: "center", baseline: "middle" } }),
      Text({ x: viewport.contentRect.w / 2, y: viewport.contentRect.h - 18, text: meta, style: { color: theme.colors.textMuted, font: font(theme, theme.typography.body), align: "center", baseline: "alphabetic" }, maxWidth: Math.max(0, viewport.contentRect.w - 28) }),
    )
  }
}