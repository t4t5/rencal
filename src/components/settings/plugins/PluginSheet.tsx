import { openUrl } from "@tauri-apps/plugin-opener"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

import { api, getErrorMessage } from "@/lib/api"

import { ArrowUpRightIcon } from "@/icons/arrow-up-right"
import { CloseIcon } from "@/icons/close"

import { PluginBadge } from "./PluginBadge"
import { PluginPreview } from "./PluginPreview"
import { CONTRIBUTION_LABELS, pluginOwner, type PluginListItem } from "./plugin-list"

type Action = "install" | "update" | "uninstall"

export function PluginSheet({
  plugin,
  onClose,
  onChanged,
  onBusyChange,
}: {
  plugin: PluginListItem
  onClose: () => void
  onChanged: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const installed = plugin.installed
  // Local checkouts shadow their repo, so installing from it would replace them.
  const repository = installed?.local_dir ? null : plugin.repo
  const [action, setAction] = useState<Action | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function run(next: Action, perform: () => Promise<unknown>) {
    setAction(next)
    onBusyChange(true)
    setActionError(null)
    try {
      await perform()
      onBusyChange(false)
      onChanged()
    } catch (error) {
      setActionError(
        getErrorMessage(
          error,
          next === "uninstall" ? "Failed to uninstall plugin" : "Failed to install plugin",
        ),
      )
      setAction(null)
      onBusyChange(false)
    }
  }

  const version = installed?.version ?? plugin.version
  const repairable = !installed?.update_version && installed?.error

  return (
    <Sheet
      open
      onOpenChange={(isOpen) => {
        if (!isOpen && !action) onClose()
      }}
    >
      <SheetContent className="w-full gap-0 p-0 sm:max-w-md">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="flex flex-col gap-4 p-6 text-sm min-w-0">
            <SheetHeader className="gap-3 p-0">
              <div className="flex items-start justify-between gap-4">
                <SheetTitle className="break-words text-lg min-w-0">{plugin.name}</SheetTitle>
                <SheetClose asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Close plugin details"
                    disabled={action !== null}
                  >
                    <CloseIcon />
                  </Button>
                </SheetClose>
              </div>
              {(plugin.contributions.length > 0 || installed) && (
                <div className="flex flex-wrap gap-1.5">
                  {plugin.contributions.map((kind) => (
                    <PluginBadge key={kind}>{CONTRIBUTION_LABELS[kind]}</PluginBadge>
                  ))}
                  {installed && <PluginBadge solid>Installed</PluginBadge>}
                </div>
              )}
              {plugin.description && (
                <SheetDescription className="break-words">{plugin.description}</SheetDescription>
              )}
            </SheetHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {installed ? (
                  <>
                    {repository && (installed.update_version || repairable) && (
                      <Button
                        disabled={action !== null}
                        onClick={() => void run("update", () => api.plugins.install(repository))}
                      >
                        {action === "update"
                          ? "Updating…"
                          : installed.update_version
                            ? `Update to ${installed.update_version}`
                            : "Reinstall"}
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      disabled={action !== null}
                      onClick={() =>
                        void run("uninstall", () => api.plugins.uninstall(installed.id))
                      }
                    >
                      {action === "uninstall" ? "Uninstalling…" : "Uninstall"}
                    </Button>
                  </>
                ) : (
                  repository && (
                    <Button
                      disabled={action !== null}
                      onClick={() => void run("install", () => api.plugins.install(repository))}
                    >
                      {action === "install" ? "Installing…" : "Install"}
                    </Button>
                  )
                )}
                {plugin.repo && (
                  <Button
                    variant="secondary"
                    onClick={() => void openUrl(`https://github.com/${plugin.repo}`)}
                  >
                    View on GitHub
                  </Button>
                )}
              </div>
              {!plugin.listed && (
                <p className="text-xs text-muted-foreground">
                  This plugin isn't listed in the renCal catalog.
                </p>
              )}
              {[installed?.error, actionError].map(
                (error) =>
                  error && (
                    <p key={error} role="alert" className="text-destructive break-words">
                      {error}
                    </p>
                  ),
              )}
            </div>
            {plugin.preview_url && (
              <PluginPreview key={plugin.preview_url} url={plugin.preview_url} name={plugin.name} />
            )}
            <div className="flex flex-col gap-3 border-t border-border pt-6">
              <h3 data-typography="heading" className="text-sm">
                Details
              </h3>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
                <dt className="text-muted-foreground">Author</dt>
                <dd className="break-all">{pluginOwner(plugin)}</dd>
                {plugin.repo && (
                  <>
                    <dt className="text-muted-foreground">Repository</dt>
                    <dd className="break-all">{plugin.repo}</dd>
                  </>
                )}
                {installed?.local_dir && (
                  <>
                    <dt className="text-muted-foreground">Path</dt>
                    <dd className="break-all">{installed.local_dir}</dd>
                  </>
                )}
                {version && (
                  <>
                    <dt className="text-muted-foreground">Version</dt>
                    <dd>
                      {version}
                      {installed?.update_version && ` · ${installed.update_version} available`}
                    </dd>
                  </>
                )}
              </dl>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
