import { KeyboardEventHandler, ReactNode, useRef } from "react"

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
  readOnly = false,
  disabled = false,
  onInputKeyDown,
}: {
  addon: ReactNode
  children: ReactNode
  placeholder?: string
  query: string
  setQuery: (query: string) => void
  open: boolean
  setOpen: (open: boolean) => void
  ghost?: boolean
  readOnly?: boolean
  disabled?: boolean
  onInputKeyDown?: KeyboardEventHandler<HTMLInputElement>
}) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const interactive = !readOnly && !disabled

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          ref={anchorRef}
          className={cn(
            "flex items-center rounded-md pr-3 group",
            interactive &&
              "hover:shadow-input-border focus-within:bg-secondary focus-within:shadow-none! cursor-text",
            {
              "bg-secondary shadow-none!": open,
              "shadow-input-border": !ghost && interactive,
            },
          )}
          onClick={() => interactive && setOpen(true)}
        >
          <InputGroup className="border-none! bg-transparent!">
            {addon}
            <InputGroupInput
              className="pl-2"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              onFocus={() => interactive && setOpen(true)}
              onKeyDown={onInputKeyDown}
              readOnly={readOnly}
              disabled={disabled}
            />
          </InputGroup>

          {interactive && <DropdownArrow forceVisible={open || !ghost} />}
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
