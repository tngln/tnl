import { theme, neutral } from "../../config/theme"
import { column, row, textNode } from "./nodes"
import type { BuilderNode, CommonNodeProps } from "./types"
import type { LayoutStyle } from "../../core/layout"

type PatternBase = Omit<CommonNodeProps, "style"> & { style?: LayoutStyle }

export function section(title: string, body: BuilderNode[], opts: PatternBase = {}): BuilderNode {
  return column(
    [
      textNode(title, {
        key: opts.key ? `${opts.key}.title` : undefined,
        emphasis: { bold: true },
        style: { margin: { b: theme.spacing.xs, l: 0, t: 0, r: 0 } },
      }),
      ...body,
    ],
    { padding: theme.spacing.md, ...(opts.style ?? {}) },
    {
      key: opts.key,
      box: opts.box ?? { fill: neutral[750], stroke: neutral[500] },
      active: opts.active,
      visible: opts.visible,
      provideStyle: opts.provideStyle,
      styleOverride: opts.styleOverride,
    },
  )
}

export function formRow(label: string, field: BuilderNode, opts: PatternBase & { key?: string; labelWidth?: number } = {}): BuilderNode {
  return row(
    [
      textNode(label, { key: opts.key ? `${opts.key}.label` : undefined, color: theme.colors.textMuted, style: { fixed: opts.labelWidth ?? 92 } }),
      field,
    ],
    { align: "center", gap: theme.spacing.sm, ...(opts.style ?? {}) },
    { key: opts.key, active: opts.active, visible: opts.visible, provideStyle: opts.provideStyle, styleOverride: opts.styleOverride, box: opts.box },
  )
}

export function toolbarRow(children: BuilderNode[], opts: PatternBase & { key?: string } = {}): BuilderNode {
  return row(children, { align: "center", gap: theme.spacing.sm, ...(opts.style ?? {}) }, { key: opts.key, active: opts.active, visible: opts.visible, provideStyle: opts.provideStyle, styleOverride: opts.styleOverride, box: opts.box })
}
