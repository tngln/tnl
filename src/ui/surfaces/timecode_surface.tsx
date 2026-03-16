import { font, theme, neutral } from "@tnl/canvas-interface/theme"
import { draw, TextOp as DrawTextOp } from "@tnl/canvas-interface/draw"
import { Paint, Stack, Text, VStack, defineSurface, mountSurface, type SurfaceDefinition } from "@tnl/canvas-interface/builder"
import { createElement } from "@tnl/canvas-interface/jsx"
import { getPlaybackSession } from "@/ui/playback/session"
import { formatTimecode } from "@/ui/playback/timecode"

type TimecodeSurfaceProps = { id: string }

export function buildPlaybackStateLabel(playing: boolean, rate: number) {
  return `${playing ? "Playing" : "Paused"} · ${rate.toFixed(2)}x`
}

export const TimecodeSurfaceDefinition: SurfaceDefinition<TimecodeSurfaceProps> = defineSurface<TimecodeSurfaceProps>({
  id: (props) => props.id,
  displayName: "TimecodeSurface",
  setup: () => {
    const session = getPlaybackSession()
    let initialized = false

    return () => {
      if (!initialized) {
        initialized = true
        session.ensureInitialized()
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
          style={{ fill: true, padding: 10 }}
          box={{ fill: neutral[925] }}
        >
          <Stack
            key="timecode.card"
            style={{ fill: true, padding: 12 }}
            box={{ fill: neutral[700], stroke: neutral[400], radius: 12 }}
          >
            <VStack key="timecode.center" style={{ align: "center", gap: 12, alignSelf: "center" }}>
              <Text key="timecode.value" style={{ alignSelf: "center" }} weight="bold" size="headline">{timecode}</Text>
              <Text key="timecode.state" style={{ alignSelf: "center" }} tone="muted">{state}</Text>
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