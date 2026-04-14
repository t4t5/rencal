import { AnimatePresence, motion } from "motion/react"
import { ReactNode, useEffect, useState } from "react"
import { AiOutlineSync as SyncIcon } from "react-icons/ai"
import { IoCloudDoneOutline, IoCloudOfflineOutline } from "react-icons/io5"
import { PiCloudWarning } from "react-icons/pi"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import { useSync } from "@/contexts/SyncContext"

export const SyncStatus = () => {
  const { isSyncing, syncError } = useSync()
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  const { key, content }: { key: string; content: ReactNode } = (() => {
    if (isSyncing) {
      return {
        key: "syncing",
        content: <SyncIcon className="text-muted-foreground animate-spin" />,
      }
    }

    if (!isOnline) {
      return {
        key: "offline",
        content: (
          <Tooltip>
            <TooltipTrigger>
              <IoCloudOfflineOutline className="text-error" />
            </TooltipTrigger>
            <TooltipContent>No internet connection</TooltipContent>
          </Tooltip>
        ),
      }
    }

    if (syncError) {
      return {
        key: "error",
        content: (
          <Tooltip>
            <TooltipTrigger>
              <PiCloudWarning className="text-warning" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64 wrap-break-word">{syncError}</TooltipContent>
          </Tooltip>
        ),
      }
    }

    return {
      key: "success",
      content: <IoCloudDoneOutline className="text-buttonBorder" />,
    }
  })()

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={key}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
      >
        {content}
      </motion.div>
    </AnimatePresence>
  )
}
