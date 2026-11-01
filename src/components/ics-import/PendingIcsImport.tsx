import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { IcsImportDialog } from "@/components/ics-import/IcsImportDialog"

import { useJumpToEvent } from "@/hooks/useJumpToEvent"
import { api, getErrorMessage, type IcsImportResult } from "@/lib/api"
import { takePendingIcsFile } from "@/lib/api/internal"

/** Offers to import .ics files opened with renCal, one at a time. */
export function PendingIcsImport() {
  const [path, setPath] = useState<string | null>(null)
  // Files stay queued in the backend while a dialog is open.
  const showing = useRef(false)
  const jumpToEvent = useJumpToEvent()

  const drain = useCallback(async () => {
    if (showing.current) return
    try {
      const next = await takePendingIcsFile()
      if (next) {
        showing.current = true
        setPath(next)
      }
    } catch (error) {
      console.error("Failed to open .ics file:", error)
      toast.error("Couldn’t open file", {
        description: getErrorMessage(error, "Failed to read the opened file"),
      })
    }
  }, [])

  useEffect(() => {
    let disposed = false
    const subscription = api.notifications.listen("ics-file-available", drain)
    void subscription.ready.then(() => {
      if (!disposed) void drain()
    })
    return () => {
      disposed = true
      subscription.unlisten()
    }
  }, [drain])

  const onClose = useCallback(() => {
    showing.current = false
    setPath(null)
    void drain()
  }, [drain])

  const onImported = useCallback(
    (result: IcsImportResult) => {
      if (result.event) void jumpToEvent(result.event)
    },
    [jumpToEvent],
  )

  if (!path) return null
  return <IcsImportDialog key={path} path={path} onClose={onClose} onImported={onImported} />
}
