import { font, theme, neutral } from "@tnl/canvas-interface/theme"
import { draw, TextOp as DrawTextOp } from "@tnl/canvas-interface/draw"
import { Label, Paint, Stack, VStack } from "@tnl/canvas-interface/builder"
import { defineSurface, mountSurface, type SurfaceDefinition } from "@tnl/canvas-interface/builder"
import { createElement } from "@tnl/canvas-interface/jsx"
import { signal } from "@tnl/canvas-interface/reactivity"
import { getPlaybackSession } from "@tnl/app/playback"
import { formatTimecode } from "@tnl/app/playback"

type TimecodeSurfaceProps = { id: string }

export function buildPlaybackStateLabel(playing: boolean, rate: number) {
  return `${playing ? "Playing" : "Paused"} · ${rate.toFixed(2)}x`
}

export const TimecodeSurfaceDefinition: SurfaceDefinition<TimecodeSurfaceProps> = defineSurface<TimecodeSurfaceProps>({
  id: (props) => props.id,
  displayName: "TimecodeSurface",
  setup: () => {
    const session = getPlaybackSession()
    const rerenderTick = signal(0, { debugLabel: "timecode_surface.rerender" })
    let initialized = false
    let subscribed = false

    return () => {
      rerenderTick.get()
      if (!initialized) {
        initialized = true
        session.ensureInitialized()
      }
      if (!subscribed) {
        subscribed = true
        session.subscribe(() => {
          rerenderTick.set((value) => value + 1)
        })
      }

      const snap = session.snapshot()
      const runtime = snap.runtime
      const fps = runtime.frameRate ?? 30
      const timecode = formatTimecode(runtime.currentTime, fps)
      const meta = snap.selectedPath ?? "No source selected"
      const state = buildPlaybackStateLabel(runtime.playing, runtime.playbackRate)

      return (
        <VStack
          key="timecode.root"
          style={{ padding: 10 }}
          box={{ fill: neutral[925] }}
        >
          <Stack
            key="timecode.card"
            style={{ grow: 1, basis: 0, alignSelf: "stretch", padding: 12 }}
            box={{ fill: neutral[700], stroke: neutral[400], radius: 12 }}
          >
            <VStack key="timecode.center" style={{ align: "center", gap: 12, alignSelf: "center" }}>
              <Label key="timecode.value" style={{ alignSelf: "center" }} weight="bold" size="headline">{timecode}</Label>
              <Label key="timecode.state" style={{ alignSelf: "center" }} tone="muted">{state}</Label>
            </VStack>
            <Paint
              key="timecode.meta"
              style={{ h: 18, alignSelf: "end" }}
              draw={(ctx, rect) => {
                draw(
                  ctx,
                  DrawTextOp({
                    x: rect.x + rect.w / 2,
                    y: rect.y + rect.h,
                    text: meta,
                    style: {
                      color: theme.colors.textMuted,
                      font: font(theme, theme.typography.body),
                      align: "center",
                      baseline: "alphabetic",
                    },
                    maxWidth: Math.max(0, rect.w - 8),
                  }),
                )
              }}
            />
          </Stack>
        </VStack>
      )
    }
  },
})

export function createTimecodeToolSurface() {
  return mountSurface(TimecodeSurfaceDefinition, { id: "Timecode.Surface" })
}

export function TimecodeSurface(opts: TimecodeSurfaceProps) {
  return mountSurface(TimecodeSurfaceDefinition, opts)
}
