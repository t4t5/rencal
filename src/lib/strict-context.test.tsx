import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { createStrictContext } from "./strict-context"

const [ExampleContextProvider, useExample] = createStrictContext<string>("Example")

function ExampleConsumer() {
  return <span>{useExample()}</span>
}

describe("createStrictContext", () => {
  it("returns the provided value", () => {
    expect(
      renderToStaticMarkup(
        <ExampleContextProvider value="available">
          <ExampleConsumer />
        </ExampleContextProvider>,
      ),
    ).toBe("<span>available</span>")
  })

  it("throws a clear error outside the provider", () => {
    expect(() => renderToStaticMarkup(<ExampleConsumer />)).toThrow(
      "Example is unavailable. Wrap the component in ExampleProvider.",
    )
  })
})
