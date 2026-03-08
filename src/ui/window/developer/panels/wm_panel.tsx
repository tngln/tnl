import { createElement, Fragment } from "../../../jsx"
import { Column, PanelActionRow, PanelColumn, PanelHeader, PanelScroll, RowItem, Text } from "../../../builder/components"
import { defineSurface, mountSurface } from "../../../builder/surface_builder"
import type { DeveloperContext, DeveloperPanelSpec } from "../index"

export function createWmPanel(): DeveloperPanelSpec {
  return {
    id: "Developer.WM",
    title: "WM",
    build: (ctx) => mountSurface(WmPanelSurface, { ctx }),
  }
}

const WmPanelSurface = defineSurface({
  id: "Developer.WM.Surface",
  setup: (_props: { ctx: DeveloperContext }) => {
    let selectedId: string | null = null

    return ({ ctx }: { ctx: DeveloperContext }) => {
      const windows = ctx.wm?.listWindows() ?? []
      if (selectedId && !windows.some((win) => win.id === selectedId)) selectedId = null
      if (!selectedId && windows.length) selectedId = windows[0].id

      const selected = windows.find((win) => win.id === selectedId) ?? null
      const selectedMeta = selected
        ? `${selected.rect.w}x${selected.rect.h} @ ${selected.rect.x},${selected.rect.y}`
        : windows.length
          ? `${windows.length} windows`
          : "No windows"

      return (
        <PanelColumn>
          <PanelHeader title="Window Manager" meta={selectedMeta}>
            <Text tone="muted" size="meta">
              {selected ? (selected.focused ? "Focused" : selected.minimized ? "Minimized" : selected.open ? "Open" : "Closed") : "Registry"}
            </Text>
          </PanelHeader>
          <PanelActionRow
            key="wm.actions"
            compact
            actions={[
              { key: "focus", icon: "F", text: "Focus", title: "Focus", onClick: selected ? () => ctx.wm?.focus(selected.id) : undefined, disabled: !selected || !selected.open || selected.minimized },
              { key: "toggle", icon: "T", text: "Toggle", title: "Toggle Open", onClick: selected ? () => ctx.wm?.toggle(selected.id) : undefined, disabled: !selected },
              { key: "min", icon: "M", text: "Min", title: "Minimize", onClick: selected ? () => ctx.wm?.minimize(selected.id) : undefined, disabled: !selected || !selected.open || selected.minimized },
              { key: "restore", icon: "R", text: "Restore", title: "Restore", onClick: selected ? () => ctx.wm?.restore(selected.id) : undefined, disabled: !selected || !selected.minimized },
            ]}
          />
          <PanelScroll key="wm.list">
            <Column style={{ axis: "column", gap: 0, padding: { l: 2, t: 2, r: 14, b: 2 }, w: "auto", h: "auto" }}>
              {windows.map((win) => (
                <RowItem
                  key={`wm.row.${win.id}`}
                  leftText={`${win.title || win.id}${win.focused ? " *" : ""}`}
                  rightText={`${win.open ? (win.minimized ? "min" : "open") : "closed"} · z${win.zOrder}`}
                  variant="item"
                  selected={win.id === selectedId}
                  onClick={() => {
                    selectedId = win.id
                  }}
                />
              ))}
            </Column>
          </PanelScroll>
        </PanelColumn>
      )
    }
  },
})
