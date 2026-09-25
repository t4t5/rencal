// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server"
import { expect, it } from "vitest"

import { Tabs, TabsList, TabsTrigger } from "./tabs"

const triggerTypography = (variant: "default" | "navigation") => {
  const container = document.createElement("div")
  container.innerHTML = renderToStaticMarkup(
    <Tabs defaultValue="a">
      <TabsList variant={variant}>
        <TabsTrigger value="a">A</TabsTrigger>
      </TabsList>
    </Tabs>,
  )
  return container.querySelector<HTMLElement>("[data-slot=tabs-trigger]")!.dataset.typography
}

it("gives navigation tabs the field role and other tabs the button role", () => {
  expect(triggerTypography("default")).toBe("button")
  expect(triggerTypography("navigation")).toBe("field")
})
