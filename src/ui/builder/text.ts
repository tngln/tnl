import type { RichTextStyle, TextEmphasis } from "../../core/draw.text"

export function textFont(style: RichTextStyle, emphasis?: TextEmphasis) {
  const weight = emphasis?.bold ? 700 : (style.fontWeight ?? 400)
  const italic = emphasis?.italic ? "italic " : ""
  return `${italic}${weight} ${style.fontSize}px ${style.fontFamily}`
}
