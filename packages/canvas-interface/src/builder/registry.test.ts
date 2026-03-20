import { describe, expect, it } from "bun:test"
import { signal } from "@tnl/canvas-interface/reactivity"
import { buttonNode, labelNode, richTextNode, textBoxNode, treeViewNode } from "./nodes"
import { createDefaultBuilderRegistry } from "./registry"

describe("builder registry runtime kinds", () => {
  const registry = createDefaultBuilderRegistry()

  it("classifies primitive, control, and widget handlers explicitly", () => {
    expect(registry.runtimeKind(labelNode("Name"))).toBe("primitive")
    expect(registry.runtimeKind(buttonNode("Click"))).toBe("control")
    expect(registry.runtimeKind(textBoxNode(signal("", { debugLabel: "test.builder.registry.textbox" }), {}))).toBe("widget")
    expect(registry.runtimeKind(treeViewNode({ items: [], expanded: new Set<string>() }))).toBe("widget")
  })

  it("resolves hybrid rich-text runtime kind from node props", () => {
    expect(registry.runtimeKind(richTextNode([{ text: "Copy" }], {}))).toBe("primitive")
    expect(registry.runtimeKind(richTextNode([{ text: "Selectable" }], { selectable: true }))).toBe("widget")
  })
})
