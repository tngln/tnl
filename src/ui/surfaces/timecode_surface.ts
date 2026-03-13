import { font, theme } from "@/config/theme"
import { draw, RectOp, TextOp } from "@/core/draw"
import { getPlaybackSession } from "@/ui/playback/session"
import { formatTimecode } from "@/ui/playback/timecode"
import type { Surface, ViewportContext } from "@/ui/base/viewport"

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
      RectOp({ x: 10, y: 10, w: Math.max(0, viewport.contentRect.w - 20), h: Math.max(0, viewport.contentRect.h - 20) }, { radius: 12, fill: { color: theme.colors.white03 }, stroke: { color: theme.colors.white10, hairline: true } }),
      TextOp({ x: viewport.contentRect.w / 2, y: viewport.contentRect.h / 2 - 8, text: timecode, style: { color: theme.colors.textPrimary, font: `700 34px ${theme.typography.family}`, align: "center", baseline: "middle" } }),
      TextOp({ x: viewport.contentRect.w / 2, y: viewport.contentRect.h / 2 + 26, text: state, style: { color: theme.colors.textMuted, font: font(theme, theme.typography.body), align: "center", baseline: "middle" } }),
      TextOp({ x: viewport.contentRect.w / 2, y: viewport.contentRect.h - 18, text: meta, style: { color: theme.colors.textMuted, font: font(theme, theme.typography.body), align: "center", baseline: "alphabetic" }, maxWidth: Math.max(0, viewport.contentRect.w - 28) }),
    )
  }
}
