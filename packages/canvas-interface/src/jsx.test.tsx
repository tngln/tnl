import { createElement, Fragment } from "@tnl/canvas-interface/jsx"
import { describe, expect, it } from "bun:test"
import * as builder from "@tnl/canvas-interface/builder"
import { HStack, Label, RichText, Stack, VStack, resolveRichTextChildren } from "@tnl/canvas-interface/builder"
import { theme } from "@tnl/canvas-interface/theme"

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
    expect(node.children.map((child: any) => child.kind)).toEqual(["text", "text", "text"])
    expect(node.children.map((child: any) => child.text)).toEqual(["alpha", "beta", "gamma"])
  })

  it("invokes function components through createElement", () => {
    function Demo() {
      return <Label>ok</Label>
    }
    const node: any = <Demo />
    expect(node.kind).toBe("label")
    expect(node.text).toBe("ok")
  })

  it("keeps implied axes for stack helpers", () => {
    const vNode: any = <VStack style={{ gap: 4 }}><Label>a</Label><Label>b</Label></VStack>
    const hNode: any = <HStack style={{ gap: 4 }}><Label>a</Label><Label>b</Label></HStack>
    const sNode: any = <Stack><Label>a</Label><Label>b</Label></Stack>
    expect(vNode.style?.axis).toBe("column")
    expect(hNode.style?.axis).toBe("row")
    expect(sNode.kind).toBe("stack")
  })

  it("does not expose Text or textNode in the public builder API", () => {
    expect("Label" in builder).toBe(true)
    expect("Text" in builder).toBe(false)
    expect("textNode" in builder).toBe(false)
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
      { text: "c", color: theme.colors.text },
    ])
  })
})
