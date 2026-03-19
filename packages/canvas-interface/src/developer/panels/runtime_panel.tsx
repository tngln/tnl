import { createElement } from "../../jsx"
import { PanelColumn, PanelScroll, PanelSection, PanelToolbar, Spacer, Text, VStack, defineSurface, mountSurface } from "../../builder"
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
          <PanelToolbar key="runtime.toolbar">
            <Text weight="bold">Interaction Runtime</Text>
            <Spacer style={{ fill: true }} />
            <Text tone="muted" size="meta">{runtime ? `${runtime.recentEvents.length} events · ${runtime.invalidations.length} invalidations` : "No runtime"}</Text>
          </PanelToolbar>
          <PanelSection title="Sessions" key="runtime.sessions">
            {runtime ? <SessionSummary runtime={runtime} /> : <Text tone="muted" size="meta">Runtime snapshot is not connected.</Text>}
          </PanelSection>
          <PanelSection title="Last Event" key="runtime.event">
            {runtime?.lastEvent ? (
              <VStack style={{ gap: 4 }}>
                <Text weight="bold">{runtime.lastEvent.reason ? `${runtime.lastEvent.kind} (${runtime.lastEvent.reason})` : runtime.lastEvent.kind}</Text>
                <Text tone="muted" size="meta">{`hit: ${formatPath(runtime.lastEvent.hitPath)}`}</Text>
                <Text tone="muted" size="meta">{`dispatch: ${formatPath(runtime.lastEvent.dispatchPath)}`}</Text>
              </VStack>
            ) : (
              <Text tone="muted" size="meta">No events recorded yet.</Text>
            )}
          </PanelSection>
          <PanelScroll key="runtime.scroll">
            <VStack style={{ padding: { l: 4, t: 4, r: 12, b: 4 }, gap: 10 }}>
              <PanelSection title="Recent Events" key="runtime.events.list">
                <VStack style={{ gap: 4 }}>
                  {(runtime?.recentEvents.length
                    ? [...runtime.recentEvents].reverse().map((event, index) => (
                        <Text key={`runtime.event.${index}`} tone="muted" size="meta">
                          {`${event.kind}${event.reason ? ` (${event.reason})` : ""} · hit ${formatPath(event.hitPath)} · dispatch ${formatPath(event.dispatchPath)}`}
                        </Text>
                      ))
                    : [<Text key="runtime.events.empty" tone="muted" size="meta">No recent events</Text>])}
                </VStack>
              </PanelSection>
              <PanelSection title="Recent Invalidations" key="runtime.invalidations">
                <VStack style={{ gap: 4 }}>
                  {(runtime?.invalidations.length
                    ? [...runtime.invalidations].reverse().map((entry, index) => (
                        <Text key={`runtime.invalidate.${index}`} tone="muted" size="meta">
                          {`${entry.source}${entry.force ? " · force" : ""} · ${formatRect(entry.rect)}`}
                        </Text>
                      ))
                    : [<Text key="runtime.invalidations.empty" tone="muted" size="meta">No invalidations</Text>])}
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
      <Text tone="muted" size="meta">{`focus: ${formatPath(runtime.focus.focusedPath)}`}</Text>
      <Text tone="muted" size="meta">{`focus reason: ${runtime.focus.reason ?? "-"}`}</Text>
      <Text tone="muted" size="meta">{`hover: ${formatPath(runtime.pointer.hoverPath)}`}</Text>
      <Text tone="muted" size="meta">{`capture: ${formatPath(runtime.pointer.capturePath)}`}</Text>
      <Text tone="muted" size="meta">{`pointer: ${runtime.pointer.activePointerId ?? "-"}`}</Text>
    </VStack>
  )
}
