import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import {
  PluginBadges,
  PluginDetails,
  usePluginAction,
} from "@/components/settings/plugins/PluginDetails"
import {
  mergePlugins,
  resolveSelection,
  type PluginListItem,
} from "@/components/settings/plugins/plugin-list"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import { api, getErrorMessage } from "@/lib/api"

/** Shows `rencal://plugin/install` links in the main window so they can be installed in place. */
export function PluginInstallDialog() {
  const [repo, setRepo] = useState<string | null>(null)
  // Links stay queued in the backend while an action runs, so they can't swap the dialog mid-install.
  const busy = useRef(false)

  const drain = useCallback(async () => {
    if (busy.current) return
    try {
      const link = await api.plugins.takePendingInstall()
      if (link) setRepo(link.repo)
    } catch (error) {
      console.error("Failed to open plugin deep link:", error)
      toast.error("Couldn’t open plugin link", {
        description: getErrorMessage(error, "Failed to read the plugin install link"),
      })
    }
  }, [])

  useEffect(() => {
    let disposed = false
    const subscription = api.notifications.listen("plugin-deep-link-available", drain)
    void subscription.ready.then(() => {
      if (!disposed) void drain()
    })
    return () => {
      disposed = true
      subscription.unlisten()
    }
  }, [drain])

  const onBusyChange = useCallback(
    (next: boolean) => {
      busy.current = next
      if (!next) void drain()
    },
    [drain],
  )

  if (!repo) return null
  return (
    <PluginInstallDialogContent
      key={repo}
      repo={repo}
      onClose={() => setRepo(null)}
      onBusyChange={onBusyChange}
    />
  )
}

function PluginInstallDialogContent({
  repo,
  onClose,
  onBusyChange,
}: {
  repo: string
  onClose: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const [plugins, setPlugins] = useState<PluginListItem[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([api.plugins.list(), api.plugins.catalog()])
      .then(([installed, catalog]) => {
        if (!cancelled) setPlugins(mergePlugins(installed, catalog))
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setLoadError(getErrorMessage(error, "Failed to load plugin details"))
        setPlugins([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const plugin = resolveSelection(plugins ?? [], { id: null, repo })
  const state = usePluginAction(plugin, onClose)

  useEffect(() => {
    if (!state.action) return
    onBusyChange(true)
    return () => onBusyChange(false)
  }, [state.action, onBusyChange])

  return (
    <Dialog
      open
      onOpenChange={(isOpen) => {
        if (!isOpen && !state.action) onClose()
      }}
    >
      <DialogContent className="max-h-[calc(100vh-4rem)] gap-0 overflow-y-auto overscroll-contain p-0 sm:max-w-md">
        <div className="flex min-w-0 flex-col gap-4 p-6 text-sm">
          <DialogHeader className="gap-3">
            <DialogTitle className="break-words pr-6 text-left text-lg">{plugin.name}</DialogTitle>
            <PluginBadges plugin={plugin} />
            {plugin.description ? (
              <DialogDescription className="break-words">{plugin.description}</DialogDescription>
            ) : (
              <DialogDescription className="sr-only">Install {plugin.name}</DialogDescription>
            )}
          </DialogHeader>
          {loadError && (
            <p role="alert" className="text-destructive break-words">
              {loadError}
            </p>
          )}
          {plugins ? (
            <PluginDetails plugin={plugin} state={state} />
          ) : (
            <p className="text-muted-foreground" role="status">
              Loading plugin…
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
