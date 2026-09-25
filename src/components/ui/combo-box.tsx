import { KeyboardEvent, KeyboardEventHandler, ReactNode, useRef } from "react"

import { Command, CommandList } from "@/components/ui/command"
import { controlSurfaceActive } from "@/components/ui/control-surface"
import { InputInner } from "@/components/ui/input"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"

import { cn } from "@/lib/utils"

import { SelectIcon } from "./select"

export function Combobox({
  addon,
  inputClassName,
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
  inputClassName?: string
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

  const handleInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    onInputKeyDown?.(e)
    if (e.defaultPrevented) return

    // Reopen after Escape or a pick; preventDefault keeps cmdk from also moving.
    if (!open && interactive && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault()
      setOpen(true)
    }

    // Home/End move the caret, as in any text field, rather than jumping the list.
    if (e.key === "Home" || e.key === "End") e.stopPropagation()
  }

  return (
    // Wraps the input too so its keys bubble (through the portal) to cmdk's handler.
    <Command className="contents" value={highlightedValue} onValueChange={onHighlightChange}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div
            ref={anchorRef}
            data-slot="combobox"
            data-control="select"
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
              className={cn("h-full flex-1 cursor-default", inputClassName)}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              onFocus={() => interactive && setOpen(true)}
              onKeyDown={handleInputKeyDown}
              readOnly={readOnly}
              disabled={disabled}
            />

            {interactive && <SelectIcon forceVisible={open || variant === "default"} />}
          </div>
        </PopoverAnchor>
        <PopoverContent
          className="overflow-hidden p-0 w-(--radix-popover-trigger-width)"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (anchorRef.current?.contains(e.target as Node)) {
              e.preventDefault()
            }
          }}
        >
          <CommandList>{children}</CommandList>
        </PopoverContent>
      </Popover>
    </Command>
  )
}
