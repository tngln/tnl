import { createElement, Fragment } from "./jsx"
import { describe, expect, it } from "bun:test"
import { Column, Text } from "./builder/components"

describe("jsx runtime", () => {
  it("flattens children and ignores falsey values", () => {
    const node: any = (
      <Column>
        {"alpha"}
        {false}
        {null}
        {undefined}
        <Fragment>
          {"beta"}
          {"gamma"}
        </Fragment>
      </Column>
    )
    expect(node.kind).toBe("column")
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
})
