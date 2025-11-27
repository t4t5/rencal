import { Description, DialogTitle } from "@radix-ui/react-dialog"
import { useState } from "react"
import { AiOutlineSync as SyncIcon } from "react-icons/ai"
import { HiOutlineCog8Tooth as SettingsIcon } from "react-icons/hi2"
import { IoSearch as SearchIcon } from "react-icons/io5"

import { Settings } from "@/components/settings/Settings"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/dialog"

import { useSyncEvents } from "@/hooks/useSyncEvents"
import { cn } from "@/lib/utils"

import { AddEventButton } from "./AddEventButton"

export function ActionBar() {
  const [showModal, setShowModal] = useState(false)

  return (
    <div className="p-4 flex justify-between items-center">
      <AddEventButton />

      <div className="flex gap-2 items-center">
        {/*<SyncStatus />*/}
        <Button variant="secondary" onClick={() => setShowModal(true)}>
          <SettingsIcon />
        </Button>
        <Button variant="secondary">
          <SearchIcon />
        </Button>
      </div>

      {showModal && (
        <Modal onClose={() => setShowModal(false)}>
          <DialogTitle className="font-bold text-lg">Accounts</DialogTitle>
          <Description className="hidden">Connect Calendar providers</Description>
          <Settings />
        </Modal>
      )}
    </div>
  )
}

const SyncStatus = () => {
  const { isSyncing } = useSyncEvents()

  return (
    <div className="flex justify-between pr-2">
      <SyncIcon
        className={cn({
          "animate-spin text-primary": isSyncing,
        })}
      />
    </div>
  )
}
