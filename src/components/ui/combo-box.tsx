import { useRef, ReactNode } from "react"

import { Command, CommandList } from "@/components/ui/command"
import { InputGroup, InputGroupInput } from "@/components/ui/input-group"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"

import { cn } from "@/lib/utils"

import { DropdownArrow } from "./select"

export function Combobox({
  addon,
  children,
  placeholder,
  query,
  setQuery,
  open,
  setOpen,
  ghost = true,
}: {
  addon: ReactNode
  children: ReactNode
  placeholder?: string
  query: string
  setQuery: (query: string) => void
  open: boolean
  setOpen: (open: boolean) => void
  ghost?: boolean
}) {
  const anchorRef = useRef<HTMLDivElement>(null)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          ref={anchorRef}
          className={cn(
            "flex items-center hover:shadow-input-border rounded-md pr-3 group",
            "focus-within:bg-secondary focus-within:shadow-none! cursor-text",
            {
              "bg-secondary shadow-none!": open,
              "shadow-input-border": !ghost,
            },
          )}
          onClick={() => setOpen(true)}
        >
          <InputGroup className="border-none! bg-transparent!">
            {addon}
            <InputGroupInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              onFocus={() => setOpen(true)}
            />
          </InputGroup>

          <DropdownArrow forceVisible={open || !ghost} />
        </div>
      </PopoverAnchor>
      <PopoverContent
        className="p-0 w-(--radix-popover-trigger-width)"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (anchorRef.current?.contains(e.target as Node)) {
            e.preventDefault()
          }
        }}
      >
        <Command>
          <CommandList>{children}</CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
