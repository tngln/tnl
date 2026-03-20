import { theme } from "../theme"
import type { RichTextStyle, TextEmphasis } from "../draw"
import type { LabelNode, NodeEnv, TextEnv, TextNode } from "./types"

export function defaultBodyStyle(): RichTextStyle {
  return {
    fontFamily: theme.typography.family,
    fontSize: theme.typography.body.size,
    fontWeight: theme.typography.body.weight,
    lineHeight: theme.spacing.lg,
    color: theme.colors.text,
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

export function mergeNodeEnv(base: NodeEnv, patch: Partial<NodeEnv> | undefined): NodeEnv {
  if (!patch) return base
  return {
    text: mergeTextEnv(base.text, patch.text),
  }
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

type StyledTextNode = TextNode | LabelNode

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
