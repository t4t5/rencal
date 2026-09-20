import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Modal,
} from "@/components/ui/dialog"

import { api, getErrorMessage, type PluginInspection } from "@/lib/api"

export function PluginReview({
  plugin,
  updating,
  onClose,
  onInstalled,
  onInstallingChange,
}: {
  plugin: PluginInspection
  updating: boolean
  onClose: () => void
  onInstalled: () => void
  onInstallingChange: (installing: boolean) => void
}) {
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function install() {
    setInstalling(true)
    onInstallingChange(true)
    setError(null)
    try {
      await api.plugins.install(plugin.repo)
      onInstalled()
    } catch (error) {
      setError(getErrorMessage(error, "Failed to install plugin"))
      setInstalling(false)
      onInstallingChange(false)
    }
  }

  return (
    <Modal
      onClose={() => {
        if (!installing) onClose()
      }}
    >
      <DialogHeader>
        <DialogTitle className="break-words pr-4">
          {updating ? "Update" : "Install"} {plugin.name}
        </DialogTitle>
        <DialogDescription className="break-words max-h-24 overflow-auto">
          {plugin.description}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4 text-sm min-w-0 max-h-[50vh] overflow-auto">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="text-muted-foreground">Repository</dt>
          <dd className="break-all">{plugin.repo}</dd>
          <dt className="text-muted-foreground">Version</dt>
          <dd>{plugin.version}</dd>
          <dt className="text-muted-foreground">Compatibility</dt>
          <dd>
            {plugin.compatible ? "Compatible" : "Not compatible"} · Requires renCal{" "}
            {plugin.min_rencal_version} or newer
          </dd>
        </dl>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground">Themes</span>
          <ul className="flex flex-col gap-1">
            {plugin.themes.map((theme) => (
              <li key={theme.id} className="break-words">
                {theme.name} · {theme.appearance}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-muted-foreground">
          Listings are unreviewed community packages. Choose a theme in Settings → Themes after
          installing. Your current selection will stay the same.
        </p>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button variant="ghost" disabled={installing} onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={installing || !plugin.compatible} onClick={() => void install()}>
          {installing ? "Installing…" : updating ? "Update" : "Install"}
        </Button>
      </DialogFooter>
    </Modal>
  )
}
