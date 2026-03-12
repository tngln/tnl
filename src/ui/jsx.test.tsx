import { createElement, Fragment } from "./jsx"
import { describe, expect, it } from "bun:test"
import { RichText, Text, VStack } from "./builder/components"
import { theme } from "../config/theme"
import { resolveRichTextChildren } from "./builder/rich_text_children"

describe("jsx runtime", () => {
  it("flattens children and ignores falsey values", () => {
    const node: any = (
      <VStack>
        {"alpha"}
        {false}
        {null}
        {undefined}
        <Fragment>
          {"beta"}
          {"gamma"}
        </Fragment>
      </VStack>
    )
    expect(node.kind).toBe("flex")
    expect(node.children).toHaveLength(3)
    expect(node.children.map((child: any) => child.text)).toEqual(["alpha", "beta", "gamma"])
  })

  it("invokes function components through createElement", () => {
    function Demo() {
      return <Text>ok</Text>
    }
    const node: any = <Demo />
    expect(node.kind).toBe("text")
    expect(node.text).toBe("ok")
  })

  it("creates rich text intrinsic nodes", () => {
    const inline: any = (
      <Fragment>
        {"a"}
        <b>{"b"}</b>
        <span tone="muted">{"c"}</span>
      </Fragment>
    )
    const spans = resolveRichTextChildren(Array.isArray(inline) ? inline : [inline])
    expect(spans).toEqual([
      { text: "a" },
      { text: "b", emphasis: { bold: true } },
      { text: "c", color: theme.colors.textMuted },
    ])
  })

  it("rejects rich text intrinsic tags in normal layout children", () => {
    expect(() => (
      <VStack>
        <b>x</b>
      </VStack>
    )).toThrow("RichText intrinsic tags can only be used inside <RichText>.")
  })

  it("resolves RichText children into spans", () => {
    const node: any = (
      <RichText tone="muted">
        {"a"}
        <b>{"b"}</b>
        <span tone="primary">{"c"}</span>
      </RichText>
    )
    expect(node.kind).toBe("richText")
    expect(node.spans).toEqual([
      { text: "a" },
      { text: "b", emphasis: { bold: true } },
      { text: "c", color: theme.colors.textPrimary },
    ])
  })
})
