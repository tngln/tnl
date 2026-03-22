import { theme, neutral, font } from "@tnl/canvas-interface/theme"
import { draw, RectOp, TextOp as DrawTextOp } from "@tnl/canvas-interface/draw"
import { getDebugLevel, listDebugEntries, setDebugLevel, type DebugEntry, type DebugLevel } from "@tnl/canvas-interface/debug"
import { signal } from "@tnl/canvas-interface/reactivity"
import { baseNameOr } from "@tnl/canvas-interface/util"
import { Button, HStack, Label, ListRow, Paint, PanelActionRow, PanelBody, PanelColumn, PanelHeader, PanelScroll, PanelSection, SectionStack, SliderField, SplitRow, VStack } from "@tnl/canvas-interface/builder"
import { defineSurface } from "@tnl/canvas-interface/builder"
import { createElement, Fragment } from "@tnl/canvas-interface/jsx"
import { getPlaybackSession } from "@tnl/app/playback"
import { formatTimecode } from "@tnl/app/playback"

const DEBUG_LEVELS: DebugLevel[] = ["error", "warn", "info", "debug", "trace"]

export function formatPlaybackTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00"
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
}

const basename = (path: string | null) => baseNameOr(path, "No source selected")

function logColor(level: DebugLevel) {
  if (level === "error") return theme.colors.danger
  if (level === "warn") return theme.colors.warning
  if (level === "info") return theme.colors.text
  return theme.colors.textMuted
}

function formatDebugTimestamp(at: number) {
  const date = new Date(at)
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`
}

function formatDebugEntry(entry: DebugEntry) {
  return `${formatDebugTimestamp(entry.at)} [${entry.level}] ${entry.scope} · ${entry.message}`
}

export const PlaybackSurface = defineSurface({
  id: "Playback.Surface",
  setup: () => {
    const session = getPlaybackSession()
    const rerenderTick = signal(0, { debugLabel: "playback_surface.rerender" })
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

      const state = session.snapshot()
      const runtime = state.runtime
      const selectedLabel = basename(state.selectedPath)
      const timeText = `${formatPlaybackTime(runtime.currentTime)} / ${formatPlaybackTime(runtime.duration)}`
      const timecode = formatTimecode(runtime.currentTime, runtime.frameRate ?? 30)
      const status = state.busy
        ? "Loading media..."
        : state.error
          ? state.error
          : runtime.ready
            ? `${runtime.width}x${runtime.height}${runtime.frameRate ? ` · ${runtime.frameRate.toFixed(2)} fps` : ""}`
            : "Select an OPFS video or import one."
      const debugLevel = getDebugLevel()
      const logEntries = listDebugEntries({ scopePrefix: ["app", "playback", "opfs"], limit: 12 })
      const diagnostics = [
        { id: "diag.source", left: "Source", right: state.selectedPath ?? "-" },
        { id: "diag.duration", left: "Duration", right: runtime.duration > 0 ? `${runtime.duration.toFixed(3)} s` : "-" },
        { id: "diag.durationSource", left: "Duration Source", right: runtime.durationSource },
        { id: "diag.rawDuration", left: "Raw Duration", right: Number.isFinite(runtime.rawDuration) ? `${runtime.rawDuration.toFixed(3)} s` : String(runtime.rawDuration) },
        { id: "diag.seekableEnd", left: "Seekable End", right: runtime.seekableEnd > 0 ? `${runtime.seekableEnd.toFixed(3)} s` : "-" },
        { id: "diag.mime", left: "Resolved MIME", right: runtime.resolvedMime ?? "-" },
        { id: "diag.blob", left: "Blob Type", right: runtime.blobType ?? "-" },
        { id: "diag.canplay", left: "Can Play", right: runtime.canPlayType || "no" },
        { id: "diag.ready", left: "Ready / Network", right: `${runtime.readyState} / ${runtime.networkState}` },
        { id: "diag.rate", left: "Playback Rate", right: `${runtime.playbackRate.toFixed(2)}x` },
        { id: "diag.audio", left: "Audio", right: `${runtime.muted ? "Muted" : "Live"} · ${(runtime.volume * 100).toFixed(0)}%` },
        { id: "diag.error", left: "Media Error", right: runtime.errorCode === null ? "-" : String(runtime.errorCode) },
        { id: "diag.debug", left: "Debug Level", right: debugLevel },
      ]

      return (
        <PanelColumn>
          <PanelHeader title="Playback" meta={selectedLabel}>
            <Label tone="muted" size="meta" color={state.error ? theme.colors.danger : theme.colors.textMuted} overflow="visible">{status}</Label>
          </PanelHeader>
          <PanelActionRow
            key="playback.actions"
            compact
            actions={[
              { key: "refresh", icon: "R", text: "Refresh", title: "Refresh OPFS media", onClick: () => void session.refreshEntries(), disabled: state.busy },
              { key: "import", icon: "I", text: "Import", title: "Import video files", onClick: () => void session.importFiles(), disabled: state.busy },
              { key: "play", icon: runtime.playing ? "P" : ">", text: runtime.playing ? "Pause" : "Play", title: runtime.playing ? "Pause" : "Play", onClick: () => void session.togglePlayPause(), disabled: !runtime.ready || state.busy },
            ]}
          />
          <PanelScroll key="playback.scroll">
            <HStack style={{ align: "start", gap: 10 }}>
              <VStack style={{ gap: 10, fixed: 284 }}>
                <PanelSection key="playback.media" title={`Media (${state.entries.length})`}>
                  <Label tone="muted" size="meta" overflow="visible">OPFS source list stays independently scrollable so the panel remains usable even with many files.</Label>
                  <PanelScroll key="playback.media.scroll" style={{ fixed: 300, margin: { t: 8, r: 0, b: 0, l: 0 } }}>
                    {state.entries.length ? (
                      <VStack style={{ padding: { l: 2, t: 2, r: 14, b: 2 } }}>
                        {state.entries.map((entry) => (
                          <ListRow
                            key={`playback.entry.${entry.path}`}
                            leftText={entry.path}
                            rightText={entry.type || "video/*"}
                            selected={entry.path === state.selectedPath}
                            onClick={() => void session.selectPath(entry.path)}
                          />
                        ))}
                      </VStack>
                    ) : (
                      <VStack style={{ gap: 4, padding: { l: 4, t: 4, r: 14, b: 4 } }}>
                        <Label tone="muted" size="meta">No video assets found in OPFS.</Label>
                      </VStack>
                    )}
                  </PanelScroll>
                </PanelSection>

                <PanelSection key="playback.source" title="Source Details">
                  <VStack style={{ gap: 4 }}>
                    <Label weight="bold">{selectedLabel}</Label>
                    <Label tone="muted" size="meta" overflow="visible">{state.selectedPath ?? "No source selected"}</Label>
                    <Label tone="muted" size="meta" overflow="visible">Current timecode: {timecode}</Label>
                  </VStack>
                </PanelSection>
              </VStack>

              <PanelBody style={{ gap: 10 }}>
                <PanelSection key="playback.preview" title="Preview">
                  <Paint
                    key="playback.preview.canvas"
                    box={{ fill: neutral[950], stroke: neutral[500], radius: 10 }}
                    measure={(max) => ({ w: max.w, h: Math.max(220, Math.min(360, Math.floor(max.w * 0.5625))) })}
                    draw={(ctx, rect) => {
                      draw(
                        ctx,
                        RectOp({ x: rect.x, y: rect.y, w: rect.w, h: rect.h }, { radius: 10, fill: { paint: neutral[950] }, stroke: { color: neutral[500], hairline: true } }),
                      )
                      const inner = { x: rect.x + 12, y: rect.y + 12, w: Math.max(0, rect.w - 24), h: Math.max(0, rect.h - 24) }
                      const drewVideo = session.drawVideo(ctx, inner)
                      if (!drewVideo) {
                        draw(
                          ctx,
                          DrawTextOp({
                            x: rect.x + rect.w / 2,
                            y: rect.y + rect.h / 2,
                            text: state.busy ? "Preparing preview..." : "Playback Preview",
                            style: {
                              color: theme.colors.textMuted,
                              font: font(theme, theme.typography.headline),
                              align: "center",
                              baseline: "middle",
                            },
                          }),
                        )
                      }
                      draw(
                        ctx,
                        DrawTextOp({
                          x: rect.x + rect.w - 16,
                          y: rect.y + 14,
                          text: timecode,
                          style: {
                            color: theme.colors.text,
                            font: `${700} 16px ${theme.typography.family}`,
                            align: "right",
                            baseline: "top",
                          },
                        }),
                        DrawTextOp({
                          x: rect.x + 16,
                          y: rect.y + rect.h - 16,
                          text: timeText,
                          style: {
                            color: theme.colors.textMuted,
                            font: font(theme, theme.typography.body),
                            baseline: "alphabetic",
                          },
                        }),
                      )
                    }}
                  />
                  <SplitRow
                    style={{ margin: { t: 8, r: 0, b: 0, l: 0 } }}
                    left={<Label weight="bold">{timecode}</Label>}
                    right={<Label tone="muted">{timeText}</Label>}
                  />
                </PanelSection>

                <PanelSection key="playback.transport" title="Transport">
                  <Label tone="muted" size="meta">Timeline-linked position</Label>
                  <SliderField
                    key="playback.transport.position"
                    style={{ margin: { t: 8, r: 0, b: 0, l: 0 } }}
                    min={0}
                    max={Math.max(runtime.duration, 0.001)}
                    value={runtime.currentTime}
                    onChange={(next) => session.seekTo(next)}
                    disabled={!runtime.ready || state.busy}
                  />
                  <SplitRow
                    style={{ margin: { t: 10, r: 0, b: 0, l: 0 } }}
                    left={[
                      <Button text="Prev" onClick={() => session.stepFrame(-1)} disabled={!runtime.ready || state.busy} style={{ fixed: 64 }} />,
                      <Button text={runtime.playing ? "Pause" : "Play"} onClick={() => void session.togglePlayPause()} disabled={!runtime.ready || state.busy} style={{ fixed: 72 }} />,
                      <Button text="Next" onClick={() => session.stepFrame(1)} disabled={!runtime.ready || state.busy} style={{ fixed: 64 }} />,
                    ]}
                    right={<Label tone="muted">{timeText}</Label>}
                  />
                  <HStack style={{ align: "center", gap: 8, margin: { t: 10, r: 0, b: 0, l: 0 } }}>
                    <Label tone="muted" size="meta" style={{ fixed: 52 }}>Volume</Label>
                    <SliderField
                      key="playback.transport.volume"
                      style={{ grow: 1, basis: 0 }}
                      min={0}
                      max={1}
                      value={runtime.volume}
                      onChange={(next) => session.setVolume(next)}
                      disabled={state.busy}
                    />
                    <Button text={runtime.muted ? "Unmute" : "Mute"} onClick={() => session.toggleMuted()} disabled={state.busy} style={{ fixed: 84 }} />
                  </HStack>
                  <SplitRow
                    style={{ margin: { t: 10, r: 0, b: 0, l: 0 } }}
                    left={[
                      <Label tone="muted" size="meta" style={{ fixed: 52 }}>Rate</Label>,
                      <Button text="-" onClick={() => session.setPlaybackRate(runtime.playbackRate / 2)} disabled={state.busy} style={{ fixed: 32 }} />,
                      <Label style={{ fixed: 64 }}>{runtime.playbackRate.toFixed(2)}x</Label>,
                      <Button text="+" onClick={() => session.setPlaybackRate(runtime.playbackRate * 2)} disabled={state.busy} style={{ fixed: 32 }} />,
                    ]}
                    right={<Label tone="muted" size="meta">{runtime.ready ? `${runtime.width}x${runtime.height}` : "No media"}</Label>}
                  />
                </PanelSection>

                <PanelSection key="playback.diagnostics" title="Diagnostics">
                  <SectionStack>
                    {diagnostics.map((row) => (
                      <ListRow key={row.id} leftText={row.left} rightText={row.right} />
                    ))}
                  </SectionStack>
                  {runtime.error ? (
                    <Label color={theme.colors.danger} size="meta" overflow="visible" style={{ margin: { t: 8, r: 0, b: 0, l: 0 } }}>{runtime.error}</Label>
                  ) : null}
                </PanelSection>

                <PanelSection key="playback.debug" title="Debug Output">
                  <Label tone="muted" size="meta" overflow="visible">This level is global. Raising it increases console output and the buffered diagnostics shown here.</Label>
                  <HStack style={{ align: "center", gap: 6, margin: { t: 8, r: 0, b: 0, l: 0 } }}>
                    {DEBUG_LEVELS.map((level) => (
                      <Button
                        key={`playback.debug.level.${level}`}
                        text={level.toUpperCase()}
                        onClick={() => setDebugLevel(level)}
                        disabled={debugLevel === level}
                        style={{ fixed: 68 }}
                      />
                    ))}
                  </HStack>
                  <VStack style={{ gap: 4, margin: { t: 10, r: 0, b: 0, l: 0 } }}>
                    {logEntries.length ? (
                      logEntries.map((entry) => (
                        <Label key={`playback.log.${entry.id}`} color={logColor(entry.level)} size="meta" overflow="visible">{formatDebugEntry(entry)}</Label>
                      ))
                    ) : (
                      <Label tone="muted" size="meta">No debug entries captured yet.</Label>
                    )}
                  </VStack>
                </PanelSection>
              </PanelBody>
            </HStack>
          </PanelScroll>
        </PanelColumn>
      )
    }
  },
})
