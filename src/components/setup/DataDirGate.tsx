import { listen } from "@tauri-apps/api/event"
import { ReactNode, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { DragRegion } from "@/components/ui/drag-region"

import { rpc } from "@/rpc"
import type { DataDirStatus } from "@/rpc/bindings"
import { CALENDAR_DIR_CHANGED } from "@/rpc/events"

/**
 * Blocks the app with an access-required screen when the caldir data dir
 * isn't visible from inside a sandbox (flatpak). The grant can only be made
 * from outside the sandbox, so all we can do is hand the user the command.
 */
export function DataDirGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<DataDirStatus | null>(null)

  useEffect(() => {
    const refresh = () => {
      rpc.caldir.get_data_dir_status().then(setStatus).catch(console.error)
    }

    refresh()

    // Re-check when the calendar dir is changed from Settings, so pointing
    // the app at an ungranted dir surfaces this screen immediately.
    const unlisten = listen(CALENDAR_DIR_CHANGED, refresh)

    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])

  if (status?.kind !== "needs_permission") {
    return children
  }

  return <AccessRequiredScreen path={status.path} command={status.command} />
}

function AccessRequiredScreen({ path, command }: { path: string; command: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(command)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <main className="flex h-screen items-center justify-center overflow-hidden">
      <DragRegion className="absolute h-4! w-full" />

      <div className="flex w-full max-w-md flex-col items-center gap-4 px-6 text-center">
        <h1 className="text-lg font-semibold">renCal needs access to {path}</h1>

        <p className="text-muted-foreground text-sm">
          The Flatpak sandbox can't see your calendar folder until you grant access. Run this in a
          terminal:
        </p>

        <div className="bg-secondary flex w-full items-center gap-2 rounded-md p-2 pl-3">
          <code className="flex-1 text-left font-mono text-xs break-all select-text">
            {command}
          </code>
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>

        <p className="text-muted-foreground text-sm">Then restart renCal.</p>
      </div>
    </main>
  )
}
