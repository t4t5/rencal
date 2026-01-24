import { Description, DialogTitle } from "@radix-ui/react-dialog"
import { useState } from "react"
import { AiOutlineSync as SyncIcon } from "react-icons/ai"
import { HiOutlineCog8Tooth as SettingsIcon } from "react-icons/hi2"
import { IoSearch as SearchIcon } from "react-icons/io5"

import { Settings } from "@/components/settings/Settings"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/dialog"

import { useCalEvents } from "@/contexts/CalEventsContext"

import { cn } from "@/lib/utils"

import { AddEventButton } from "./AddEventButton"

export function ActionBar() {
  const [showModal, setShowModal] = useState(false)

  return (
    <div className="flex justify-between items-center gap-3">
      <AddEventButton />

      <div className="flex gap-2 items-center">
        <SyncStatus />
        <Button variant="secondary" onClick={() => setShowModal(true)}>
          <SettingsIcon />
        </Button>
        <Button variant="secondary">
          <SearchIcon />
        </Button>
      </div>

      {showModal && (
        <Modal onClose={() => setShowModal(false)}>
          <DialogTitle className="font-bold text-lg">Calendars</DialogTitle>
          <Description className="hidden">Manage calendar visibility</Description>
          <Settings />
        </Modal>
      )}
    </div>
  )
}

const SyncStatus = () => {
  const { reloadEvents } = useCalEvents()

  // For the caldir PoC, sync is handled via caldir-core's pull/push commands
  // The useSyncEvents hook (Google sync) will be removed after migration
  const isSyncing = false

  return (
    <div className="flex justify-between pr-2">
      <Button variant="ghost" size="icon" onClick={() => reloadEvents()}>
        <SyncIcon
          className={cn("text-muted-foreground", {
            "animate-spin text-primary": isSyncing,
          })}
        />
      </Button>
    </div>
  )
}
