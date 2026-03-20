import { theme } from "../theme"
import type { RichTextStyle, TextEmphasis } from "../draw"
import type { LabelElement, RenderElement } from "./types"

export type TextEnv = {
  color?: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: number
  lineHeight?: number
  emphasis?: TextEmphasis
}

export type NodeEnv = {
  text?: TextEnv
}

export type TextEnvPatchProps = {
  tone?: "primary" | "muted"
  weight?: "normal" | "bold"
  size?: "body" | "headline" | "meta"
  color?: string
  emphasis?: TextEmphasis
}

type StyledTextNode = Extract<RenderElement, { kind: "text" }> | LabelElement

function mergeTextEnv(base: TextEnv | undefined, patch: TextEnv | undefined): TextEnv | undefined {
  if (!base && !patch) return undefined
  return {
    color: patch?.color ?? base?.color,
    fontFamily: patch?.fontFamily ?? base?.fontFamily,
    fontSize: patch?.fontSize ?? base?.fontSize,
    fontWeight: patch?.fontWeight ?? base?.fontWeight,
    lineHeight: patch?.lineHeight ?? base?.lineHeight,
    emphasis: patch?.emphasis ?? base?.emphasis,
  }
}

export function defaultNodeEnv(): NodeEnv {
  return {
    text: {
      color: theme.colors.text,
      fontFamily: theme.typography.family,
      fontSize: theme.typography.body.size,
      fontWeight: theme.typography.body.weight,
      lineHeight: theme.spacing.lg,
    },
  }
}

export function mergeNodeEnv(base: NodeEnv, patch: Partial<NodeEnv> | undefined): NodeEnv {
  if (!patch) return base
  return {
    text: mergeTextEnv(base.text, patch.text),
  }
}

export function mergeNodeEnvPatch(base: Partial<NodeEnv> | undefined, patch: Partial<NodeEnv> | undefined): Partial<NodeEnv> | undefined {
  if (!base && !patch) return undefined
  const text = mergeTextEnv(base?.text, patch?.text)
  return text ? { text } : undefined
}

export function textEnvPatch(props: TextEnvPatchProps): Partial<NodeEnv> | undefined {
  const text: NonNullable<NodeEnv["text"]> = {}
  if (props.color) text.color = props.color
  else if (props.tone === "muted") text.color = theme.colors.textMuted
  else if (props.tone === "primary") text.color = theme.colors.text

  if (props.size === "headline") {
    text.fontSize = theme.typography.headline.size
    text.fontWeight = theme.typography.headline.weight
    text.lineHeight = theme.spacing.lg
  } else if (props.size === "meta") {
    text.fontSize = Math.max(10, theme.typography.body.size - 1)
    text.fontWeight = theme.typography.body.weight
    text.lineHeight = theme.spacing.md
  } else if (props.size === "body") {
    text.fontSize = theme.typography.body.size
    text.fontWeight = theme.typography.body.weight
    text.lineHeight = theme.spacing.lg
  }

  if (props.weight === "bold") text.fontWeight = 700
  if (props.weight === "normal") text.fontWeight = 400
  if (props.emphasis) text.emphasis = props.emphasis

  return Object.keys(text).length ? { text } : undefined
}

export function textEnvToRichTextStyle(text: TextEnv | undefined): RichTextStyle {
  return {
    fontFamily: text?.fontFamily ?? theme.typography.family,
    fontSize: text?.fontSize ?? theme.typography.body.size,
    fontWeight: text?.fontWeight ?? theme.typography.body.weight,
    lineHeight: text?.lineHeight ?? theme.spacing.lg,
    color: text?.color ?? theme.colors.text,
  }
}

export function resolveTextStyle(env: NodeEnv, node: StyledTextNode): RichTextStyle {
  const text = env.text
  return {
    fontFamily: text?.fontFamily ?? theme.typography.family,
    fontSize: text?.fontSize ?? theme.typography.body.size,
    fontWeight: node.emphasis?.bold ? 700 : (text?.fontWeight ?? theme.typography.body.weight),
    lineHeight: text?.lineHeight ?? theme.spacing.lg,
  }
}

export function resolveTextColor(env: NodeEnv, node: StyledTextNode) {
  return node.color ?? env.text?.color ?? theme.colors.text
}

export function resolveTextEmphasis(env: NodeEnv, node: StyledTextNode): TextEmphasis | undefined {
  return node.emphasis ?? env.text?.emphasis
}
