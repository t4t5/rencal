import { View } from "nsh"

import { AnnotateOverlay } from "@/components/annotate/AnnotateOverlay"
import { ConnectPrompt } from "@/components/event-parts/ConnectPrompt"
import { DeleteConfirmDialog } from "@/components/event-parts/DeleteConfirmDialog"
import { PopoverEditEvent } from "@/components/event-parts/PopoverEditEvent"
import { PopoverNewEvent } from "@/components/event-parts/PopoverNewEvent"
import {
  DuplicateRecurrenceDialog,
  EditRecurrenceDialog,
} from "@/components/event-parts/RecurrenceConfirmDialog"
import { PendingIcsImport } from "@/components/ics-import/PendingIcsImport"
import { SearchPalette } from "@/components/search/SearchPalette"
import { SettingsWindow } from "@/components/settings/SettingsWindow"
import { PluginInstallDialog } from "@/components/settings/plugins/PluginInstallDialog"
import { SheetEvent } from "@/components/sidebar/SheetEvent"
import { MassDeleteConfirmDialog } from "@/components/sync/MassDeleteConfirmDialog"
import { Toaster } from "@/components/ui/toaster"

import { annotateEnabled } from "@/stores/annotate"
import { isWideWindow } from "@/stores/view"
import { EventDragOverlay } from "@/views/EventDragOverlay"

/** Everything that floats over the window; each feature mounts its own overlay here. */
export function Overlays() {
  return (
    <View class="absolute">
      <EventDragOverlay />
      <SearchPalette />
      <If when={isWideWindow()} else={<SheetEvent />}>
        <PopoverEditEvent />
        <PopoverNewEvent />
      </If>
      <EditRecurrenceDialog />
      <DuplicateRecurrenceDialog />
      <DeleteConfirmDialog />
      <ConnectPrompt />
      <SettingsWindow />
      <MassDeleteConfirmDialog />
      <PendingIcsImport />
      <PluginInstallDialog />
      <If when={annotateEnabled}>
        <AnnotateOverlay />
      </If>
      <Toaster />
    </View>
  )
}
