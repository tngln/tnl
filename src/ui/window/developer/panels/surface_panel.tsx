import { createElement, Fragment } from "../../../jsx"
import { Button, Column, PanelColumn, PanelScroll, PanelSection, PanelToolbar, RowItem, Spacer, Text, TextBox } from "../../../builder/components"
import { defineSurface, mountSurface } from "../../../builder/surface_builder"
import { signal } from "../../../../core/reactivity"
import type { DeveloperContext, DeveloperPanelSpec } from "../index"
import type { DebugBlitInfo, DebugLayerInfo } from "../../../base/compositor"

export function createSurfacePanel(): DeveloperPanelSpec {
  return {
    id: "Developer.Surface",
    title: "Surface",
    build: (ctx) => mountSurface(SurfacePanelSurface, { ctx }),
  }
}

type Props = {
  ctx: DeveloperContext
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  let v = bytes
  let u = 0
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024
    u += 1
  }
  const digits = u === 0 ? 0 : u === 1 ? 1 : 2
  return `${v.toFixed(digits)} ${units[u]}`
}

function formatRect(r: { x: number; y: number; w: number; h: number } | null) {
  if (!r) return "-"
  return `x:${Math.round(r.x)} y:${Math.round(r.y)} w:${Math.round(r.w)} h:${Math.round(r.h)}`
}

export const SurfacePanelSurface = defineSurface<Props>({
  id: "Developer.Surface.Surface",
  setup: ({ ctx }) => {
    const filter = signal("", { debugLabel: "developer.surface.filter" })
    const selectedId = signal<string | null>(null, { debugLabel: "developer.surface.selectedId" })
    let frozen = false
    let lastSnapshot: { layers: DebugLayerInfo[]; blits: DebugBlitInfo[] } | null = null

    const snapshot = () => {
      if (frozen && lastSnapshot) return lastSnapshot
      const layers = ctx.surface?.listLayers?.() ?? []
      const blits = ctx.surface?.listBlits?.() ?? []
      lastSnapshot = { layers, blits }
      return lastSnapshot
    }

    const lastDestForLayer = (layerId: string, blits: Array<{ layerId: string; dest: any }>) => {
      for (let i = blits.length - 1; i >= 0; i--) {
        const b = blits[i]!
        if (b.layerId === layerId) return b.dest
      }
      return null
    }

    const applyOverlay = (layerId: string | null) => {
      if (!layerId) {
        ctx.surface?.setOverlay?.(null)
        return
      }
      const { blits } = snapshot()
      const rect = lastDestForLayer(layerId, blits as any)
      ctx.surface?.setOverlay?.(rect ?? null)
    }

    return () => {
      const { layers, blits } = snapshot()
      const q = filter.peek().trim().toLowerCase()
      const visible = q ? layers.filter((l: DebugLayerInfo) => (l.id ?? "").toLowerCase().includes(q) || (l.tag?.surfaceId ?? "").toLowerCase().includes(q)) : layers
      const selected = selectedId.peek()
      const selectedLayer = selected ? layers.find((l: DebugLayerInfo) => l.id === selected) ?? null : null
      const selectedDest = selected ? lastDestForLayer(selected, blits as any) : null
      const selectedBlits = selected ? (blits as any as Array<{ layerId: string }>).filter((b) => b.layerId === selected).length : 0

      return (
        <PanelColumn>
          <PanelToolbar key="surface.toolbar">
            <Text key="surface.title" weight="bold">Compositor</Text>
            <Spacer style={{ fixed: 8 }} />
            <TextBox key="surface.filter" value={filter} placeholder="Filter (id / surface)" />
            <Spacer style={{ fixed: 8 }} />
            <Button
              key="surface.freeze"
              text={frozen ? "Unfreeze" : "Freeze"}
              onClick={() => {
                frozen = !frozen
              }}
            />
            <Spacer style={{ fixed: 8 }} />
            <Button
              key="surface.clear"
              text="Clear"
              onClick={() => {
                selectedId.set(null)
                applyOverlay(null)
              }}
            />
            <Spacer style={{ fill: true }} />
            <Text key="surface.meta" tone="muted" size="meta">{`${visible.length}/${layers.length} layers · ${blits.length} blits`}</Text>
          </PanelToolbar>

          <PanelSection title="Selection" key="surface.selection">
            <Column style={{ axis: "column", gap: 4, w: "auto", h: "auto" }}>
              {selectedLayer ? (
                <Fragment>
                  <Text weight="bold">{selectedLayer.id}</Text>
                  <Text tone="muted" size="meta">
                    {`${selectedLayer.tag?.surfaceId ? `surface:${selectedLayer.tag.surfaceId} · ` : ""}${selectedLayer.wCss}×${selectedLayer.hCss}@${selectedLayer.dpr} · ${selectedLayer.wPx}×${selectedLayer.hPx}px · ${formatBytes(selectedLayer.estimatedBytes)}`}
                  </Text>
                  <Text tone="muted" size="meta">{`renderedFrame: ${selectedLayer.renderedFrame} · blits: ${selectedBlits}`}</Text>
                  <Text tone="muted" size="meta">{`last dest: ${formatRect(selectedDest)}`}</Text>
                </Fragment>
              ) : (
                <Text tone="muted" size="meta">Select a layer to see details and highlight its last blit rect.</Text>
              )}
            </Column>
          </PanelSection>

          <PanelScroll key="surface.scroll">
            <Column style={{ axis: "column", gap: 0, padding: { l: 2, t: 2, r: 2, b: 2 }, w: "auto", h: "auto" }}>
              {visible.map((l: DebugLayerInfo) => {
                const right = `${l.tag?.surfaceId ? l.tag.surfaceId : "-"} · ${l.wCss}×${l.hCss}@${l.dpr}`
                return (
                  <RowItem
                    key={`surface.item.${l.id}`}
                    leftText={String(l.id)}
                    rightText={right}
                    selected={selected === l.id}
                    onClick={() => {
                      selectedId.set(l.id)
                      applyOverlay(l.id)
                    }}
                  />
                )
              })}
              {!visible.length ? <Text tone="muted" size="meta">No layers</Text> : null}
            </Column>
          </PanelScroll>
        </PanelColumn>
      )
    }
  },
})
