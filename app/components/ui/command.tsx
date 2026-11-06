import { split } from "nsh"
import { Command as BaseCommand, type CommandProps } from "nsh/base"

import { cn } from "@/lib/utils"

import { SearchIcon } from "@/icons"

/** A search field over rows: the palette's look, with every part styled. */
export function Command(props: CommandProps) {
  const [own, rest] = split(props, [
    "class",
    "searchBarClass",
    "searchClass",
    "listClass",
    "itemClass",
    "groupClass",
  ])
  return (
    <BaseCommand
      searchPrefix={<SearchIcon class="size-4 text-muted-foreground" />}
      separator={false}
      autoFocus
      {...rest}
      class={cn("w-full bg-popover", own.class)}
      searchBarClass={cn(
        "h-(--control-height) flex-row items-center gap-2 border-b border-border px-3",
        own.searchBarClass,
      )}
      searchClass={cn(
        "h-full flex-1 text-sm text-popover-foreground placeholder:text-placeholder-foreground",
        own.searchClass,
      )}
      listClass={cn("max-h-[300px] p-1", own.listClass)}
      itemClass={cn(
        // A column: `renderItem`'s content sits in a host that a row would shrink to fit.
        "group min-h-8 justify-center rounded-(--radius-sm) px-2 py-1.5 focus:bg-accent disabled:opacity-50",
        own.itemClass,
      )}
      groupClass={cn("px-2 py-1.5 text-xs font-medium text-muted-foreground", own.groupClass)}
    />
  )
}
