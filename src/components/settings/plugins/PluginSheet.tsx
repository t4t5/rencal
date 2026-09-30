import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

import { CloseIcon } from "@/icons/close"

import { PluginBadges, PluginDetails, usePluginAction } from "./PluginDetails"
import type { PluginListItem } from "./plugin-list"

export function PluginSheet({
  plugin,
  onClose,
  onChanged,
}: {
  plugin: PluginListItem
  onClose: () => void
  onChanged: () => void
}) {
  const state = usePluginAction(plugin, onChanged)

  return (
    <Sheet
      open
      onOpenChange={(isOpen) => {
        if (!isOpen && !state.action) onClose()
      }}
    >
      <SheetContent className="w-full gap-0 p-0 sm:max-w-md">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="flex flex-col gap-4 p-6 text-sm min-w-0">
            <SheetHeader className="gap-3 p-0">
              <div className="flex items-start justify-between gap-4">
                <SheetTitle className="break-words text-lg min-w-0">{plugin.name}</SheetTitle>
                <SheetClose asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Close plugin details"
                    disabled={state.action !== null}
                  >
                    <CloseIcon />
                  </Button>
                </SheetClose>
              </div>
              <PluginBadges plugin={plugin} />
              {plugin.description && (
                <SheetDescription className="break-words">{plugin.description}</SheetDescription>
              )}
            </SheetHeader>
            <PluginDetails plugin={plugin} state={state} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
