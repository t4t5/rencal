import { useEffect, useState } from "react"

import { OrbitRing } from "@/components/loading-ui/orbit-ring"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

import { api, getErrorMessage, type PluginInspection } from "@/lib/api"

import { CloseIcon } from "@/icons/close"

import { PluginPreview } from "./PluginPreview"
import { pluginOwner, type PluginListItem } from "./plugin-list"

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
  // Local checkouts shadow their repo, so the release doesn't describe them.
  const repository = installed?.local_dir ? null : plugin.repo
  const [inspection, setInspection] = useState<PluginInspection | null>(null)
  const [inspectError, setInspectError] = useState<string | null>(null)
  const [action, setAction] = useState<Action | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (!repository) return
    let cancelled = false
    api.plugins.inspect(repository.trim()).then(
      (result) => {
        if (!cancelled) setInspection(result)
      },
      (error: unknown) => {
        if (!cancelled) setInspectError(getErrorMessage(error, "Failed to inspect plugin"))
      },
    )
    return () => {
      cancelled = true
    }
  }, [repository])

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

  const loading = repository !== null && !inspection && !inspectError
  const canInstall = inspection?.compatible ?? false
  const description = inspection?.description ?? plugin.description
  const version = installed?.version ?? inspection?.version ?? plugin.version
  const repairable = !installed?.update_version && installed?.error

  return (
    <Sheet
      open
      onOpenChange={(isOpen) => {
        if (!isOpen && !action) onClose()
      }}
    >
      <SheetContent className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="shrink-0 border-b p-5">
          <div className="flex items-start justify-between gap-4">
            <SheetTitle className="break-words text-lg min-w-0">
              {inspection?.name ?? plugin.name}
            </SheetTitle>
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
          {description && (
            <SheetDescription className="break-words">{description}</SheetDescription>
          )}
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-5 py-4 text-sm min-w-0">
          <PluginPreview key={plugin.preview_url} url={plugin.preview_url} name={plugin.name} />
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
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
                <dt className="text-muted-foreground">Local checkout</dt>
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
            {inspection && (
              <>
                <dt className="text-muted-foreground">Compatibility</dt>
                <dd>
                  {inspection.compatible ? "Compatible" : "Not compatible"} · Requires renCal{" "}
                  {inspection.min_rencal_version} or newer
                </dd>
              </>
            )}
          </dl>
          {loading && (
            <p className="flex items-center gap-2 text-muted-foreground" role="status">
              <OrbitRing className="size-3.5 shrink-0" />
              Loading plugin details…
            </p>
          )}
          {inspection && <PluginContents inspection={inspection} />}
          {!installed && (
            <p className="text-muted-foreground">
              Listings are unreviewed community packages.
              {inspection &&
                inspection.themes.length > 0 &&
                " Choose a theme in Settings → Themes after installing. Your current selection will stay the same."}
            </p>
          )}
          {[inspectError, installed?.error, actionError].map(
            (error) =>
              error && (
                <p key={error} role="alert" className="text-destructive break-words">
                  {error}
                </p>
              ),
          )}
        </div>
        <SheetFooter className="shrink-0 flex-row justify-end border-t p-5">
          {installed ? (
            <>
              <Button
                variant="secondary"
                disabled={action !== null}
                onClick={() => void run("uninstall", () => api.plugins.uninstall(installed.id))}
              >
                {action === "uninstall" ? "Uninstalling…" : "Uninstall"}
              </Button>
              {repository && (installed.update_version || repairable) && (
                <Button
                  disabled={action !== null || !canInstall}
                  onClick={() => void run("update", () => api.plugins.install(repository))}
                >
                  {action === "update"
                    ? "Updating…"
                    : installed.update_version
                      ? `Update to ${installed.update_version}`
                      : "Reinstall"}
                </Button>
              )}
            </>
          ) : (
            <Button
              disabled={action !== null || !canInstall || !repository}
              onClick={() =>
                repository && void run("install", () => api.plugins.install(repository))
              }
            >
              {action === "install" ? "Installing…" : "Install"}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function PluginContents({ inspection }: { inspection: PluginInspection }) {
  return (
    <>
      {inspection.themes.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground">Themes</span>
          <ul className="flex flex-col gap-1">
            {inspection.themes.map((theme) => (
              <li key={theme.id} className="break-words">
                {theme.name} · {theme.appearance}
              </li>
            ))}
          </ul>
        </div>
      )}
      {inspection.fonts.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground">Fonts</span>
          <ul className="flex flex-col gap-1">
            {inspection.fonts.map((font) => (
              <li key={`${font.family}-${font.weight}-${font.style}`} className="break-words">
                {font.family} · {font.weight} · {font.style} · {font.file.split("/").at(-1)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {inspection.providers.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground">Calendar providers</span>
          <ul className="flex flex-col gap-1">
            {inspection.providers.map((provider) => (
              <li key={provider.slug} className="break-words">
                {!provider.compatible
                  ? `${provider.name} · built for an older caldir, won't be installed`
                  : !provider.asset
                    ? `${provider.name} · not available for this platform`
                    : `Adds the ${provider.name} calendar provider (runs caldir-provider-${provider.slug} to sync accounts)`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
