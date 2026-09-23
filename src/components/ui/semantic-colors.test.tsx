// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server"
import { expect, it } from "vitest"

import { buttonVariants } from "./button"
import { CommandItem } from "./command"
import { SelectItem } from "./select"
import { Tabs, TabsList, TabsTrigger } from "./tabs"

it("pairs accent highlights with accent foregrounds in shared primitives", () => {
  const ghostButton = buttonVariants({ variant: "ghost" })
  const commandItem = CommandItem({ children: "Command" }).props.className as string
  const selectItem = SelectItem({ value: "item", children: "Item" }).props.className as string

  expect(ghostButton).toContain("hover:bg-accent")
  expect(ghostButton).toContain("hover:text-accent-foreground")
  expect(ghostButton).not.toContain("hover:bg-hover")

  expect(commandItem).toContain("data-[selected=true]:bg-accent")
  expect(commandItem).toContain("data-[selected=true]:text-accent-foreground")
  expect(commandItem).not.toContain("data-[selected=true]:bg-hover")

  expect(selectItem).toContain("focus:bg-accent")
  expect(selectItem).toContain("focus:text-accent-foreground")
  expect(selectItem).not.toContain("focus:bg-hover")
})

it("pairs navigation tab surfaces with their secondary foreground", () => {
  const container = document.createElement("div")
  container.innerHTML = renderToStaticMarkup(
    <Tabs defaultValue="settings">
      <TabsList variant="navigation">
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
    </Tabs>,
  )
  const navigationTab = container.querySelector("[data-slot=tabs-trigger]")!.className

  expect(navigationTab).toContain("data-[state=active]:bg-secondary")
  expect(navigationTab).toContain("data-[state=active]:text-secondary-foreground")
  expect(navigationTab).not.toContain(
    "group-data-[variant=navigation]/tabs-list:data-[state=active]:text-",
  )
})
