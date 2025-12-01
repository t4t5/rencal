import { Check, ChevronDownIcon } from "lucide-react"
import { useState, useRef } from "react"
import { GoClock as ClockIcon } from "react-icons/go"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"

import { cn } from "@/lib/utils"

const options = [
  { value: "react", label: "React" },
  { value: "vue", label: "Vue" },
  { value: "svelte", label: "Svelte" },
  { value: "angular", label: "Angular" },
]

export function Combobox() {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")
  const [query, setQuery] = useState("")
  const anchorRef = useRef<HTMLDivElement>(null)

  const filtered = options.filter((opt) => opt.label.toLowerCase().includes(query.toLowerCase()))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          ref={anchorRef}
          className={cn(
            "flex items-center border border-transparent hover:border-input rounded-md pr-3 group",
            "focus-within:bg-secondary focus-within:border-transparent! cursor-text",
          )}
          onClick={() => setOpen(true)}
        >
          <InputGroup className="border-none! bg-transparent!">
            <InputGroupAddon>
              <ClockIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search framework..."
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
        className="p-0 w-64"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (anchorRef.current?.contains(e.target as Node)) {
            e.preventDefault()
          }
        }}
      >
        <Command>
          <CommandList>
            {filtered.length > 0 ? (
              <CommandGroup>
                {filtered.map((opt) => (
                  <CommandItem
                    key={opt.value}
                    onSelect={() => {
                      setValue(opt.value)
                      setQuery(opt.label) // set selected label into input
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === opt.value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {opt.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : (
              <CommandEmpty>No results found.</CommandEmpty>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
