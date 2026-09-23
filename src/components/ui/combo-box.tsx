import { KeyboardEventHandler, ReactNode, useRef } from "react"

import { Command, CommandList } from "@/components/ui/command"
import { ControlTrailing } from "@/components/ui/control-row"
import { controlSurfaceActive } from "@/components/ui/control-surface"
import { InputInner } from "@/components/ui/input"
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
  variant = "ghost",
  readOnly = false,
  disabled = false,
  onInputKeyDown,
  highlightedValue,
  onHighlightChange,
}: {
  addon: ReactNode
  children: ReactNode
  placeholder?: string
  query: string
  setQuery: (query: string) => void
  open: boolean
  setOpen: (open: boolean) => void
  variant?: "ghost" | "default"
  readOnly?: boolean
  disabled?: boolean
  onInputKeyDown?: KeyboardEventHandler<HTMLInputElement>
  /**
   * The option (by its `CommandItem` value) that cmdk should mark as selected.
   * cmdk highlights it and scrolls it into view on open — useful for opening
   * the list focused on the current value rather than the first item.
   */
  highlightedValue?: string
  onHighlightChange?: (value: string) => void
}) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const interactive = !readOnly && !disabled

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          ref={anchorRef}
          data-slot="combobox"
          data-control={interactive ? "select" : undefined}
          data-control-layout="row"
          data-state={open ? "open" : "closed"}
          data-variant={variant}
          data-disabled={disabled || undefined}
          data-readonly={readOnly || undefined}
          className={cn(
            "control-row group flex min-h-control w-full min-w-0 items-center rounded-md border border-transparent",
            interactive && [
              "cursor-default [&:not(:focus-within):hover]:border-input",
              controlSurfaceActive.focusWithin,
              controlSurfaceActive.open,
            ],
            {
              "border-input": variant === "default" && interactive,
            },
          )}
          onClick={() => {
            if (!interactive) return
            setOpen(true)
            anchorRef.current?.querySelector("input")?.focus()
          }}
        >
          {addon}
          <InputInner
            data-slot="combobox-input"
            data-control-part="content"
            className="h-full flex-1 cursor-default"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            onFocus={() => interactive && setOpen(true)}
            onKeyDown={onInputKeyDown}
            readOnly={readOnly}
            disabled={disabled}
          />

          {interactive && (
            <ControlTrailing data-slot="select-icon" aria-hidden="true">
              <DropdownArrow forceVisible={open || variant === "default"} />
            </ControlTrailing>
          )}
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
        <Command value={highlightedValue} onValueChange={onHighlightChange}>
          <CommandList>{children}</CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
