import { describe, expect, it } from "bun:test"
import { findLeafByPane, firstLeaf, insertPane, removePane, type DockNode } from "./model"

function createIdFactory() {
  let n = 0
  return (prefix: string) => `${prefix}.${++n}`
}

describe("docking model", () => {
  it("attaches panes as tabs in the center", () => {
    const createId = createIdFactory()
    let root: DockNode | null = null
    root = insertPane(root, { targetLeafId: null, placement: "center", paneId: "A", createId })
    const leaf = firstLeaf(root)
    expect(leaf?.tabs).toEqual(["A"])
    root = insertPane(root, { targetLeafId: leaf!.id, placement: "center", paneId: "B", createId })
    expect(findLeafByPane(root, "A")?.tabs).toEqual(["A", "B"])
    expect(findLeafByPane(root, "B")?.selectedPaneId).toBe("B")
  })

  it("splits a leaf and collapses empty branches when panes are removed", () => {
    const createId = createIdFactory()
    let root: DockNode | null = null
    root = insertPane(root, { targetLeafId: null, placement: "center", paneId: "A", createId })
    const leaf = firstLeaf(root)!
    root = insertPane(root, { targetLeafId: leaf.id, placement: "right", paneId: "B", createId })
    expect(root?.kind).toBe("split")
    expect(findLeafByPane(root, "A")).not.toBeNull()
    expect(findLeafByPane(root, "B")).not.toBeNull()
    root = removePane(root, "B")
    expect(root?.kind).toBe("tabs")
    expect(findLeafByPane(root, "A")?.tabs).toEqual(["A"])
  })
})
