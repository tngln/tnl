import { createElement } from "../../jsx"
import { Label, PanelColumn, PanelScroll, PanelSection, SplitRow, VStack, defineSurface, mountSurface } from "../../builder"
import type { DebugCanvasRuntimeSnapshot } from "../../ui"
import type { DeveloperContext, DeveloperPanelSpec } from "../index"

export function createRuntimePanel(): DeveloperPanelSpec {
  return {
    id: "Developer.Runtime",
    title: "Runtime",
    build: (ctx) => mountSurface(RuntimePanelSurface, { ctx }),
  }
}

function formatPath(path: Array<{ label: string }>) {
  if (!path.length) return "-"
  return path.map((entry) => entry.label).join(" > ")
}

function formatRect(rect: { x: number; y: number; w: number; h: number }) {
  return `x:${Math.round(rect.x)} y:${Math.round(rect.y)} w:${Math.round(rect.w)} h:${Math.round(rect.h)}`
}

const RuntimePanelSurface = defineSurface({
  id: "Developer.Runtime.Surface",
  setup: (_props: { ctx: DeveloperContext }) => {
    return ({ ctx }: { ctx: DeveloperContext }) => {
      const runtime = ctx.surface?.getRuntime?.() ?? null
      return (
        <PanelColumn>
          <SplitRow
            key="runtime.toolbar"
            left={<Label weight="bold">Interaction Runtime</Label>}
            right={<Label tone="muted" size="meta">{runtime ? `${runtime.recentEvents.length} events · ${runtime.invalidations.length} invalidations` : "No runtime"}</Label>}
          />
          <PanelSection title="Sessions" key="runtime.sessions">
            {runtime ? <SessionSummary runtime={runtime} /> : <Label tone="muted" size="meta" overflow="visible">Runtime snapshot is not connected.</Label>}
          </PanelSection>
          <PanelSection title="Last Event" key="runtime.event">
            {runtime?.lastEvent ? (
              <VStack style={{ gap: 4 }}>
                <Label weight="bold">{runtime.lastEvent.reason ? `${runtime.lastEvent.kind} (${runtime.lastEvent.reason})` : runtime.lastEvent.kind}</Label>
                <Label tone="muted" size="meta" overflow="visible">{`hit: ${formatPath(runtime.lastEvent.hitPath)}`}</Label>
                <Label tone="muted" size="meta" overflow="visible">{`dispatch: ${formatPath(runtime.lastEvent.dispatchPath)}`}</Label>
              </VStack>
            ) : (
              <Label tone="muted" size="meta">No events recorded yet.</Label>
            )}
          </PanelSection>
          <PanelScroll key="runtime.scroll">
            <VStack style={{ padding: { l: 4, t: 4, r: 12, b: 4 }, gap: 10 }}>
              <PanelSection title="Recent Events" key="runtime.events.list">
                <VStack style={{ gap: 4 }}>
                  {(runtime?.recentEvents.length
                    ? [...runtime.recentEvents].reverse().map((event, index) => (
                        <Label key={`runtime.event.${index}`} tone="muted" size="meta" overflow="visible">
                          {`${event.kind}${event.reason ? ` (${event.reason})` : ""} · hit ${formatPath(event.hitPath)} · dispatch ${formatPath(event.dispatchPath)}`}
                        </Label>
                      ))
                    : [<Label key="runtime.events.empty" tone="muted" size="meta">No recent events</Label>])}
                </VStack>
              </PanelSection>
              <PanelSection title="Recent Invalidations" key="runtime.invalidations">
                <VStack style={{ gap: 4 }}>
                  {(runtime?.invalidations.length
                    ? [...runtime.invalidations].reverse().map((entry, index) => (
                        <Label key={`runtime.invalidate.${index}`} tone="muted" size="meta" overflow="visible">
                          {`${entry.source}${entry.force ? " · force" : ""} · ${formatRect(entry.rect)}`}
                        </Label>
                      ))
                    : [<Label key="runtime.invalidations.empty" tone="muted" size="meta">No invalidations</Label>])}
                </VStack>
              </PanelSection>
            </VStack>
          </PanelScroll>
        </PanelColumn>
      )
    }
  },
})

function SessionSummary(props: { runtime: DebugCanvasRuntimeSnapshot }) {
  const { runtime } = props
  return (
    <VStack style={{ gap: 4 }}>
      <Label tone="muted" size="meta" overflow="visible">{`focus: ${formatPath(runtime.focus.focusedPath)}`}</Label>
      <Label tone="muted" size="meta" overflow="visible">{`focus reason: ${runtime.focus.reason ?? "-"}`}</Label>
      <Label tone="muted" size="meta" overflow="visible">{`hover: ${formatPath(runtime.pointer.hoverPath)}`}</Label>
      <Label tone="muted" size="meta" overflow="visible">{`capture: ${formatPath(runtime.pointer.capturePath)}`}</Label>
      <Label tone="muted" size="meta" overflow="visible">{`pointer: ${runtime.pointer.activePointerId ?? "-"}`}</Label>
    </VStack>
  )
}
