// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server"
import { expect, it } from "vitest"

import { Button } from "./button"
import { DropdownMenu, DropdownMenuTrigger } from "./dropdown-menu"
import { Tooltip, TooltipTrigger } from "./tooltip"

it("preserves a themeable button surface when Radix composes tooltip and menu triggers", () => {
  const container = document.createElement("div")
  container.innerHTML = renderToStaticMarkup(
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button>View</Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
      </Tooltip>
    </DropdownMenu>,
  )

  const button = container.querySelector("button")!
  expect(container.querySelectorAll("button")).toHaveLength(1)
  expect(button.hasAttribute("data-button")).toBe(true)
  expect(button.dataset.typography).toBe("action")
  expect(button.dataset.variant).toBe("default")
  expect(button.dataset.size).toBe("default")
  expect(button.dataset.slot).toBe("tooltip-trigger")
  expect(button.getAttribute("aria-haspopup")).toBe("menu")
})
