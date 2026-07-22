import { emit, listen } from "@tauri-apps/api/event"
import { open } from "@tauri-apps/plugin-dialog"
import { ReactNode, useCallback, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { DragRegion } from "@/components/ui/drag-region"

import { rpc } from "@/rpc"
import type { DataDirStatus } from "@/rpc/bindings"
import { CALENDAR_DIR_CHANGED } from "@/rpc/events"

const STATUS_POLL_INTERVAL_MS = 5000

/**
 * Fails closed until the backend confirms that the configured directory is
 * accessible. In Flatpak, authorization is obtained through the portal-backed
 * directory picker and startup continues without restarting the process.
 */
export function DataDirGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<DataDirStatus | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [authorizationError, setAuthorizationError] = useState<string | null>(null)
  const [authorizing, setAuthorizing] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const nextStatus = await rpc.caldir.get_data_dir_status()
      setStatus(nextStatus)
      setStatusError(null)
      return nextStatus
    } catch (error) {
      setStatus(null)
      setStatusError(errorMessage(error))
      return null
    }
  }, [])

  useEffect(() => {
    void refresh()

    const interval = window.setInterval(() => void refresh(), STATUS_POLL_INTERVAL_MS)
    const unlisten = listen(CALENDAR_DIR_CHANGED, () => void refresh())

    return () => {
      window.clearInterval(interval)
      unlisten.then((fn) => fn())
    }
  }, [refresh])

  const authorize = async () => {
    setAuthorizationError(null)
    const selected = await open({ directory: true, multiple: false, recursive: true })
    if (typeof selected !== "string") return

    setAuthorizing(true)
    try {
      await rpc.caldir.authorize_data_dir(selected)
      const nextStatus = await refresh()
      if (nextStatus?.kind === "ready") {
        await emit(CALENDAR_DIR_CHANGED, nextStatus.path)
      }
    } catch (error) {
      setAuthorizationError(errorMessage(error))
    } finally {
      setAuthorizing(false)
    }
  }

  if (status?.kind === "ready") {
    return children
  }

  if (status?.kind === "needs_authorization") {
    return (
      <AccessRequiredScreen
        path={status.path}
        error={authorizationError}
        authorizing={authorizing}
        onAuthorize={() => void authorize()}
        onRetry={() => void refresh()}
      />
    )
  }

  return <StatusScreen error={statusError} onRetry={() => void refresh()} />
}

function AccessRequiredScreen({
  path,
  error,
  authorizing,
  onAuthorize,
  onRetry,
}: {
  path: string
  error: string | null
  authorizing: boolean
  onAuthorize: () => void
  onRetry: () => void
}) {
  return (
    <FullWindowScreen>
      <h1 className="text-lg font-semibold">renCal needs access to {path}</h1>

      <p className="text-muted-foreground text-sm">
        Select this directory to give renCal persistent read and write access. Your calendar
        configuration will continue to use the original path.
      </p>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="flex gap-2">
        <Button onClick={onAuthorize} disabled={authorizing}>
          {authorizing ? "Checking access…" : "Select directory"}
        </Button>
        {error && (
          <Button variant="outline" onClick={onRetry} disabled={authorizing}>
            Retry
          </Button>
        )}
      </div>
    </FullWindowScreen>
  )
}

function StatusScreen({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <FullWindowScreen>
      <h1 className="text-lg font-semibold">
        {error ? "renCal couldn't check calendar access" : "Checking calendar access…"}
      </h1>
      {error && <p className="text-destructive text-sm">{error}</p>}
      {error && (
        <Button variant="outline" onClick={onRetry}>
          Retry
        </Button>
      )}
    </FullWindowScreen>
  )
}

function FullWindowScreen({ children }: { children: ReactNode }) {
  return (
    <main className="flex h-screen items-center justify-center overflow-hidden">
      <DragRegion className="absolute h-4! w-full" />
      <div className="flex w-full max-w-md flex-col items-center gap-4 px-6 text-center">
        {children}
      </div>
    </main>
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
