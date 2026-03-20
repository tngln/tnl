import type { IconDef } from "../icons"
import { caretDownIcon, chevronDownIcon, chevronRightIcon } from "../icons"
import { theme } from "../theme"
import { choiceIndicator, iconLabelContent, rowSurface, textControlFrame } from "./visual.presets"
import { mergeVisualStyles, type VisualContext, type VisualNode, type VisualStyleInput } from "./visual"

export type TreeRowVisualModel = {
  depth: number
  expandable: boolean
  expanded: boolean
  leftText: string
  rightText?: string
  variant?: "group" | "item"
  selected?: boolean
}

const TREE_ROW_INDENT_STEP = theme.ui.controls.treeRow.indentStep
const TREE_ROW_DISCLOSURE_SLOT = theme.ui.controls.treeRow.disclosureSlot
const TREE_ROW_DISCLOSURE_GAP = theme.ui.controls.treeRow.disclosureGap
const TREE_ROW_LEFT_PAD = theme.ui.controls.treeRow.leftPad
const TREE_ROW_RIGHT_PAD = theme.ui.controls.treeRow.rightPad

export function treeRowDisclosureIcon(expanded: boolean): IconDef {
  return expanded ? chevronDownIcon : chevronRightIcon
}

export function buildTreeRowVisual(layout: TreeRowVisualModel): VisualNode {
  const disclosureRect: VisualNode = {
    kind: "box",
    style: {
      base: {
        layout: { fixedW: TREE_ROW_DISCLOSURE_SLOT, fixedH: TREE_ROW_DISCLOSURE_SLOT },
      },
    },
    children: layout.expandable
      ? [{
          kind: "image",
          source: { kind: "icon", icon: treeRowDisclosureIcon(layout.expanded) },
          style: {
            base: {
              image: { color: theme.colors.textMuted, width: Math.max(0, TREE_ROW_DISCLOSURE_SLOT - 4), height: Math.max(0, TREE_ROW_DISCLOSURE_SLOT - 4) },
              layout: { fixedW: TREE_ROW_DISCLOSURE_SLOT, fixedH: TREE_ROW_DISCLOSURE_SLOT },
            },
          },
        }]
      : [],
  }

  const surface = rowSurface({ minH: theme.ui.controls.treeRowHeight })
  return {
    kind: "box",
    style: mergeVisualStyles(surface, {
      base: {
        layout: {
          padding: { left: TREE_ROW_LEFT_PAD + Math.max(0, layout.depth) * TREE_ROW_INDENT_STEP, right: TREE_ROW_RIGHT_PAD },
          gap: TREE_ROW_DISCLOSURE_GAP,
        },
      },
    }),
    children: [
      disclosureRect,
      {
        kind: "text",
        text: layout.leftText,
        style: {
          base: {
            text: {
              color: (layout.variant ?? "item") === "group" ? theme.colors.text : theme.colors.textMuted,
              fontSize: Math.max(10, theme.typography.body.size - 1),
              fontWeight: (layout.variant ?? "item") === "group" ? 600 : 500,
              lineHeight: theme.ui.controls.treeRowHeight,
              baseline: "middle",
              truncate: true,
            },
            layout: { grow: true, minH: theme.ui.controls.treeRowHeight },
          },
        },
      },
      ...(layout.rightText
        ? [{
            kind: "text" as const,
            text: layout.rightText,
            style: {
              base: {
                text: {
                  color: theme.colors.textMuted,
                  fontSize: Math.max(10, theme.typography.body.size - 2),
                  fontWeight: 400,
                  lineHeight: theme.ui.controls.treeRowHeight,
                  align: "end" as const,
                  baseline: "middle" as const,
                  truncate: true,
                },
                layout: { minH: theme.ui.controls.treeRowHeight },
              },
            },
          }]
        : []),
    ],
  }
}

export type DropdownVisualModel = {
  label: string
  visualStyle?: VisualStyleInput
}

export function resolveDropdownVisualModel(opts: {
  options: Array<{ value: string; label: string }>
  selectedValue: string
  visualStyle?: VisualStyleInput
}): DropdownVisualModel {
  const current = opts.options.find((option) => option.value === opts.selectedValue)
  return {
    label: current ? current.label : "",
    visualStyle: opts.visualStyle,
  }
}

export function buildDropdownVisual(opts: DropdownVisualModel): VisualNode {
  return {
    kind: "box",
    style: mergeVisualStyles(textControlFrame(), opts.visualStyle),
    children: [
      {
        kind: "box",
        style: iconLabelContent({ justify: "between", gap: 6 }),
        children: [
          {
            kind: "text",
            text: opts.label,
            style: {
              base: {
                text: { baseline: "middle", truncate: true },
                layout: { grow: true, minH: theme.ui.controls.inputHeight },
              },
            },
          },
          {
            kind: "image",
            source: { kind: "icon", icon: caretDownIcon },
            style: {
              base: {
                image: { color: theme.colors.textMuted, width: 10, height: 10 },
                layout: { fixedW: 10, fixedH: 10 },
              },
            },
          },
        ],
      },
    ],
  }
}

export type TextBoxChromeVisualModel = {
  focused: boolean
  visualStyle?: VisualStyleInput
}

export type TextBoxVisualModel = {
  fieldStyle?: VisualStyleInput
}

export function buildTextBoxChromeVisual(opts: TextBoxChromeVisualModel): VisualNode {
  return {
    kind: "box",
    style: mergeVisualStyles(
      textControlFrame(),
      opts.visualStyle,
      opts.focused ? { base: { border: { color: theme.colors.borderFocus, radius: theme.radii.sm } } } : undefined,
    ),
  }
}

export type TextBoxTextVisualModel = {
  text: string
  placeholder: boolean
}

export function buildTextBoxTextVisual(opts: TextBoxTextVisualModel): VisualNode {
  return {
    kind: "text",
    text: opts.text,
    style: {
      base: {
        text: {
          color: opts.placeholder ? theme.colors.textMuted : theme.colors.text,
          fontFamily: theme.typography.family,
          fontSize: theme.typography.body.size,
          fontWeight: theme.typography.body.weight,
          lineHeight: theme.spacing.lg,
          baseline: "middle",
        },
      },
    },
  }
}

export function buildChoiceRootVisual(visualStyle?: VisualStyleInput, gap = 8): VisualStyleInput | undefined {
  return mergeVisualStyles(iconLabelContent({ gap, justify: "start" }), visualStyle)
}

export function buildChoiceIndicatorVisual(rounded = false): VisualStyleInput {
  return choiceIndicator({ radius: rounded ? 999 : 4 })
}
