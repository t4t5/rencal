// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server"
import { expect, it } from "vitest"

import { DropdownMenu, DropdownMenuTrigger } from "./dropdown-menu"
import { SelectButton } from "./select"

it("marks a select button as a control, never a button", () => {
  const container = document.createElement("div")
  container.innerHTML = renderToStaticMarkup(
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SelectButton>Week</SelectButton>
      </DropdownMenuTrigger>
    </DropdownMenu>,
  )

  const button = container.querySelector("button")!
  expect(button.dataset.control).toBe("select")
  expect(button.hasAttribute("data-button")).toBe(false)
  expect(button.dataset.typography).toBe("button")
  expect(button.dataset.slot).toBe("dropdown-menu-trigger")
})
