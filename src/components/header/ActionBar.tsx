import { Description, DialogTitle } from "@radix-ui/react-dialog"
import { useEffect, useState } from "react"
import { AiOutlineSync as SyncIcon } from "react-icons/ai"
import { HiOutlineCog8Tooth as SettingsIcon } from "react-icons/hi2"
import { IoSearch as SearchIcon } from "react-icons/io5"
import { PiWarningCircle as WarningIcon } from "react-icons/pi"

import { Settings } from "@/components/settings/Settings"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import { rpc } from "@/rpc"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendarState } from "@/contexts/CalendarStateContext"

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
          <DialogTitle className="font-bold text-lg">Accounts</DialogTitle>
          <Description className="hidden">Connect Calendar providers</Description>
          <Settings />
        </Modal>
      )}
    </div>
  )
}

const SyncStatus = () => {
  const { calendars } = useCalendarState()
  const { reloadEvents } = useCalEvents()

  const [isSyncing, setIsSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  useEffect(() => {
    const calendarSlugs = calendars.filter((c) => c.provider !== null).map((c) => c.slug)

    if (calendarSlugs.length === 0) return

    const sync = async () => {
      setIsSyncing(true)
      setSyncError(null)
      try {
        await rpc.caldir.sync(calendarSlugs)
        await reloadEvents()
      } catch (e) {
        setSyncError(e instanceof Error ? e.message : String(e))
      } finally {
        setIsSyncing(false)
      }
    }

    void sync()
  }, [calendars])

  if (syncError) {
    return (
      <Tooltip>
        <TooltipTrigger>
          <WarningIcon className="text-destructive" />
        </TooltipTrigger>
        <TooltipContent className="max-w-64 wrap-break-word">{syncError}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <SyncIcon
      className={cn("text-muted-foreground opacity-0 transition-opacity", {
        "animate-spin text-primary opacity-100": isSyncing,
      })}
    />
  )
}
