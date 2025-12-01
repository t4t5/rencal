import { ChevronDownIcon } from "lucide-react"
import { useRef, ReactNode } from "react"

import { Command, CommandList } from "@/components/ui/command"
import { InputGroup, InputGroupInput } from "@/components/ui/input-group"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"

import { cn } from "@/lib/utils"

export function Combobox({
  addon,
  children,
  placeholder,
  query,
  setQuery,
  open,
  setOpen,
}: {
  addon: ReactNode
  children: ReactNode
  placeholder?: string
  query: string
  setQuery: (query: string) => void
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const anchorRef = useRef<HTMLDivElement>(null)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          ref={anchorRef}
          className={cn(
            "flex items-center border border-transparent hover:border-input rounded-md pr-3 group",
            "focus-within:bg-secondary focus-within:border-transparent! cursor-text",
            {
              "bg-secondary border-transparent!": open,
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
              className="bg-transparent! border-transparent!"
              onFocus={() => setOpen(true)}
            />
          </InputGroup>

          <ChevronDownIcon
            className={cn(
              "opacity-0 group-hover:opacity-100 transition text-muted-foreground size-4",
              {
                "opacity-100": open,
              },
            )}
          />
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
