import { theme } from "../../config/theme"
import type { RichTextSpan, TextEmphasis } from "../../core/draw.text"
import type { BuilderChild } from "../jsx"

export type RichInlineKind = "text" | "fragment" | "b" | "i" | "u" | "span"

export type RichInlineNode =
  | { __richInline: true; kind: "text"; text: string }
  | { __richInline: true; kind: "fragment"; children: RichInlineChild[] }
  | { __richInline: true; kind: "b" | "i" | "u"; children: RichInlineChild[] }
  | { __richInline: true; kind: "span"; children: RichInlineChild[]; tone?: "primary" | "muted"; color?: string }

export type RichInlineChild = RichInlineNode | string | number | null | undefined | false | RichInlineChild[]

type RichInlineContext = {
  emphasis?: TextEmphasis
  color?: string
}

function appendFlattened(out: RichInlineChild[], value: RichInlineChild) {
  if (Array.isArray(value)) {
    for (const item of value) appendFlattened(out, item)
    return
  }
  if (value === null || value === undefined || value === false) return
  out.push(value)
}

function flattenChildren(children: RichInlineChild[]) {
  const out: RichInlineChild[] = []
  for (const child of children) appendFlattened(out, child)
  return out
}

function mergeEmphasis(base: TextEmphasis | undefined, patch: TextEmphasis | undefined): TextEmphasis | undefined {
  if (!base && !patch) return undefined
  return {
    bold: patch?.bold ?? base?.bold,
    italic: patch?.italic ?? base?.italic,
    underline: patch?.underline ?? base?.underline,
  }
}

function sameStyle(a: RichTextSpan | undefined, b: RichTextSpan) {
  if (!a) return false
  return (
    a.color === b.color &&
    a.emphasis?.bold === b.emphasis?.bold &&
    a.emphasis?.italic === b.emphasis?.italic &&
    a.emphasis?.underline === b.emphasis?.underline
  )
}

function pushSpan(out: RichTextSpan[], text: string, ctx: RichInlineContext) {
  if (!text) return
  const next: RichTextSpan = { text }
  if (ctx.color) next.color = ctx.color
  if (ctx.emphasis && (ctx.emphasis.bold || ctx.emphasis.italic || ctx.emphasis.underline)) next.emphasis = ctx.emphasis
  const prev = out[out.length - 1]
  if (sameStyle(prev, next)) {
    prev.text += text
    return
  }
  out.push(next)
}

function toneColor(tone: "primary" | "muted" | undefined) {
  if (tone === "muted") return theme.colors.textMuted
  if (tone === "primary") return theme.colors.text
  return undefined
}

function visit(out: RichTextSpan[], child: RichInlineChild, ctx: RichInlineContext) {
  if (child === null || child === undefined || child === false) return
  if (Array.isArray(child)) {
    for (const item of child) visit(out, item, ctx)
    return
  }
  if (typeof child === "string" || typeof child === "number") {
    pushSpan(out, String(child), ctx)
    return
  }
  switch (child.kind) {
    case "text":
      pushSpan(out, child.text, ctx)
      return
    case "fragment":
      for (const item of flattenChildren(child.children)) visit(out, item, ctx)
      return
    case "b":
      for (const item of flattenChildren(child.children)) visit(out, item, { ...ctx, emphasis: mergeEmphasis(ctx.emphasis, { bold: true }) })
      return
    case "i":
      for (const item of flattenChildren(child.children)) visit(out, item, { ...ctx, emphasis: mergeEmphasis(ctx.emphasis, { italic: true }) })
      return
    case "u":
      for (const item of flattenChildren(child.children)) visit(out, item, { ...ctx, emphasis: mergeEmphasis(ctx.emphasis, { underline: true }) })
      return
    case "span": {
      const color = child.color ?? toneColor(child.tone) ?? ctx.color
      for (const item of flattenChildren(child.children)) visit(out, item, { ...ctx, color })
      return
    }
  }
}

export function richTextElement(kind: Exclude<RichInlineKind, "text">, props: { children?: RichInlineChild[]; tone?: "primary" | "muted"; color?: string }): RichInlineNode {
  if (kind === "span") return { __richInline: true, kind, children: props.children ?? [], tone: props.tone, color: props.color }
  return { __richInline: true, kind, children: props.children ?? [] }
}

export function richTextText(text: string): RichInlineNode {
  return { __richInline: true, kind: "text", text }
}

export function isRichInlineNode(value: unknown): value is RichInlineNode {
  if (!value || typeof value !== "object") return false
  if ((value as { __richInline?: boolean }).__richInline !== true) return false
  const kind = (value as RichInlineNode).kind
  return kind === "text" || kind === "fragment" || kind === "b" || kind === "i" || kind === "u" || kind === "span"
}

export function assertNoRichInlineChildren(children: BuilderChild[]) {
  for (const child of children) {
    if (Array.isArray(child)) {
      assertNoRichInlineChildren(child)
      continue
    }
    if (isRichInlineNode(child)) throw new Error("RichText intrinsic tags can only be used inside <RichText>.")
  }
}

export function resolveRichTextChildren(children: RichInlineChild[] | undefined): RichTextSpan[] {
  const out: RichTextSpan[] = []
  if (!children) return out
  for (const child of flattenChildren(children)) visit(out, child, {})
  return out
}
