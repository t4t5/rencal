import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import { OrbitRing } from "@/components/loading-ui/orbit-ring"
import { SettingsContent } from "@/components/settings/SettingsContent"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import {
  api,
  getErrorMessage,
  type InstalledPlugin,
  type InstalledPlugins,
  type PluginCatalog,
  type PluginCatalogEntry,
  type PluginInspection,
  type PluginInstallLink,
} from "@/lib/api"

import { PluginReview } from "./PluginReview"

export function PluginsPage() {
  const [installed, setInstalled] = useState<InstalledPlugins | null>(null)
  const [catalog, setCatalog] = useState<PluginCatalog | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [installLinkError, setInstallLinkError] = useState<string | null>(null)
  const [review, setReview] = useState<PluginInspection | null>(null)
  const listRequest = useRef(0)
  const busyRef = useRef<string | null>(null)
  const pendingInstall = useRef<PluginInstallLink | null>(null)
  const inspectRef = useRef<
    (repository: string, key: string, fromInstallLink?: boolean) => Promise<void>
  >(async () => {})

  function startBusy(key: string) {
    busyRef.current = key
    setBusy(key)
  }

  function finishBusy() {
    busyRef.current = null
    setBusy(null)
    const pending = pendingInstall.current
    pendingInstall.current = null
    if (pending) void inspectRef.current(pending.repo, pending.repo, true)
  }

  const refreshInstalled = useCallback(async () => {
    const request = ++listRequest.current
    try {
      const snapshot = await api.plugins.list()
      if (request !== listRequest.current) return
      setInstalled(snapshot)
      setListError(null)
    } catch (error) {
      if (request === listRequest.current)
        setListError(getErrorMessage(error, "Failed to load installed plugins"))
    }
  }, [])

  const refreshCatalog = useCallback(async () => {
    setCatalogLoading(true)
    try {
      setCatalog(await api.plugins.catalog())
    } catch (error) {
      setCatalog((previous) => ({
        plugins: previous?.plugins ?? [],
        error: getErrorMessage(error, "Failed to load plugin catalog"),
      }))
    } finally {
      setCatalogLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshInstalled()
    void refreshCatalog()
    const subscription = api.notifications.listen(
      "external-themes-changed",
      () => void refreshInstalled(),
    )
    return () => {
      listRequest.current++
      subscription.unlisten()
    }
  }, [refreshInstalled, refreshCatalog])

  useEffect(() => {
    let disposed = false

    const drainPendingInstall = async () => {
      try {
        const link = await api.plugins.takePendingInstall()
        if (disposed || !link) return
        if (busyRef.current) {
          pendingInstall.current = link
        } else {
          void inspectRef.current(link.repo, link.repo, true)
        }
      } catch (error) {
        if (!disposed) {
          setInstallLinkError(getErrorMessage(error, "Failed to open plugin install link"))
        }
      }
    }

    const subscription = api.notifications.listen(
      "plugin-deep-link-available",
      () => void drainPendingInstall(),
    )
    void subscription.ready
      .then(() => {
        if (!disposed) void drainPendingInstall()
      })
      .catch((error: unknown) => {
        if (!disposed) {
          setInstallLinkError(getErrorMessage(error, "Failed to watch plugin install links"))
        }
      })

    return () => {
      disposed = true
      subscription.unlisten()
    }
  }, [])

  function clearError(key: string) {
    setErrors((previous) => {
      const next = { ...previous }
      delete next[key]
      return next
    })
  }

  async function inspect(repository: string, key: string, fromInstallLink = false) {
    startBusy(key)
    clearError(key)
    if (fromInstallLink) setInstallLinkError(null)
    try {
      setReview(await api.plugins.inspect(repository.trim()))
    } catch (error) {
      const message = getErrorMessage(error, "Failed to inspect plugin")
      if (fromInstallLink) setInstallLinkError(message)
      else setErrors((previous) => ({ ...previous, [key]: message }))
    } finally {
      finishBusy()
    }
  }
  inspectRef.current = inspect

  async function uninstall(id: string) {
    startBusy(id)
    clearError(id)
    try {
      await api.plugins.uninstall(id)
      await refreshInstalled()
    } catch (error) {
      setErrors((previous) => ({
        ...previous,
        [id]: getErrorMessage(error, "Failed to uninstall plugin"),
      }))
    } finally {
      finishBusy()
    }
  }

  const disabled = busy !== null || review !== null

  const visiblePlugins = useMemo(() => {
    if (!installed) return []

    const catalogById = new Map(catalog?.plugins.map((plugin) => [plugin.id, plugin]))
    const installedIds = new Set(installed.plugins.map((plugin) => plugin.id))
    const plugins: PluginListItem[] = [
      ...installed.plugins.map((plugin) => ({
        ...plugin,
        description: catalogById.get(plugin.id)?.description ?? null,
        preview_url: catalogById.get(plugin.id)?.preview_url ?? null,
        installed: plugin,
      })),
      ...(catalog?.plugins ?? [])
        .filter((plugin) => !installedIds.has(plugin.id))
        .map((plugin) => ({ ...plugin, preview_url: plugin.preview_url ?? null, installed: null })),
    ]
    const query = search.trim().toLowerCase()

    return query
      ? plugins.filter((plugin) =>
          `${plugin.name} ${plugin.repo ?? ""} ${plugin.installed?.local_dir ?? ""} ${plugin.description ?? ""}`
            .toLowerCase()
            .includes(query),
        )
      : plugins
  }, [catalog, installed, search])

  return (
    <SettingsContent className="w-full min-w-0 mt-3">
      <Input
        variant="default"
        aria-label="Search plugins"
        placeholder="Search plugins…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="flex flex-col gap-3 min-w-0">
        {listError && (
          <div className="flex items-center gap-2">
            <ErrorMessage message={listError} />
            <Button variant="ghost" onClick={() => void refreshInstalled()}>
              Retry
            </Button>
          </div>
        )}
        <ErrorMessage message={installLinkError} />
        {installed?.errors.map((error) => (
          <ErrorMessage key={error} message={error} />
        ))}
        {catalog?.error && (
          <div className="flex items-center gap-2">
            <ErrorMessage message={catalog.error} />
            <Button variant="ghost" disabled={catalogLoading} onClick={() => void refreshCatalog()}>
              Retry
              {catalogLoading && <OrbitRing className="size-3.5 shrink-0" />}
            </Button>
          </div>
        )}
        {!installed && !listError && (
          <p className="text-sm text-muted-foreground" role="status">
            Loading plugins…
          </p>
        )}
        {installed && catalog && !catalog.error && visiblePlugins.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {search ? "No plugins match your search." : "No plugins listed yet."}
          </p>
        )}
        {visiblePlugins.map((plugin) => (
          <PluginRow
            key={plugin.id}
            name={plugin.name}
            previewUrl={plugin.preview_url}
            owner={plugin.repo?.split("/")[0] ?? plugin.id.split(".")[0]}
            version={plugin.installed?.version ?? plugin.version}
          >
            {plugin.description && (
              <p className="text-sm text-muted-foreground">{plugin.description}</p>
            )}
            {plugin.installed?.local_dir ? (
              <p className="text-xs text-muted-foreground break-words">
                Local checkout · {plugin.installed.local_dir}
                {plugin.installed.repo && ` · shadows ${plugin.installed.repo}`}
              </p>
            ) : plugin.installed?.repo === null ? (
              <p className="text-xs text-muted-foreground">Installed locally</p>
            ) : null}
            <ErrorMessage
              message={
                errors[plugin.installed?.id ?? plugin.repo ?? plugin.id] ?? plugin.installed?.error
              }
            />
            <PluginActions
              plugin={plugin}
              busy={busy}
              disabled={disabled}
              onInspect={inspect}
              onUninstall={uninstall}
            />
          </PluginRow>
        ))}
      </div>
      {review && (
        <PluginReview
          plugin={review}
          updating={installed?.plugins.some((plugin) => plugin.id === review.id) ?? false}
          onClose={() => setReview(null)}
          onInstalled={() => {
            finishBusy()
            setReview(null)
            void refreshInstalled()
          }}
          onInstallingChange={(installing) => {
            if (installing) startBusy(review.repo)
            else finishBusy()
          }}
        />
      )}
    </SettingsContent>
  )
}

type PluginListItem = (InstalledPlugin | PluginCatalogEntry) & {
  description: string | null
  preview_url: string | null
  installed: InstalledPlugin | null
}

function PluginActions({
  plugin,
  busy,
  disabled,
  onInspect,
  onUninstall,
}: {
  plugin: PluginListItem
  busy: string | null
  disabled: boolean
  onInspect: (repository: string, key: string) => Promise<void>
  onUninstall: (id: string) => Promise<void>
}) {
  const installed = plugin.installed
  const repository = plugin.repo

  if (!installed && repository) {
    return (
      <Button
        size="sm"
        className="self-start"
        disabled={disabled}
        onClick={() => void onInspect(repository, repository)}
      >
        {busy === repository ? "Checking…" : "Review install"}
      </Button>
    )
  }

  if (installed?.local_dir) {
    return (
      <Button
        size="sm"
        className="self-start"
        variant="secondary"
        disabled={disabled}
        onClick={() => void onUninstall(installed.id)}
      >
        {busy === installed.id ? "Working…" : "Uninstall"}
      </Button>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {installed?.update_version && repository && (
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => void onInspect(repository, installed.id)}
        >
          Update to {installed.update_version}
        </Button>
      )}
      {!installed?.update_version && installed?.error && repository && (
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => void onInspect(repository, installed.id)}
        >
          Reinstall
        </Button>
      )}
      {installed && (
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled}
          onClick={() => void onUninstall(installed.id)}
        >
          {busy === installed.id ? "Working…" : "Uninstall"}
        </Button>
      )}
    </div>
  )
}

function PluginRow({
  name,
  previewUrl,
  owner,
  version,
  children,
}: {
  name: string
  previewUrl: string | null
  owner: string
  version: string | null
  children: ReactNode
}) {
  return (
    <div className="flex gap-4 rounded-md border border-border p-4 min-w-0">
      <PluginPreview key={previewUrl} url={previewUrl} name={name} />
      <div className="flex flex-1 flex-col gap-3 min-w-0">
        <div className="flex flex-col gap-1 min-w-0">
          <h3 data-typography="heading" className="text-sm break-words">
            {name}
          </h3>
          <p className="text-xs text-muted-foreground break-words">
            {owner}
            {version && ` · ${version}`}
          </p>
        </div>
        {children}
      </div>
    </div>
  )
}

function PluginPreview({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className="relative flex aspect-video w-28 sm:w-40 shrink-0 self-start items-center justify-center overflow-hidden rounded-base border border-border bg-muted">
      {url && !failed ? (
        <img
          src={url}
          alt={`${name} preview`}
          width={160}
          height={90}
          loading="lazy"
          decoding="async"
          className="absolute size-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="px-2 text-center text-xs text-muted-foreground">No preview available</span>
      )}
    </div>
  )
}

function ErrorMessage({ message }: { message?: string | null }) {
  return message ? (
    <p role="alert" className="text-sm text-destructive break-words">
      {message}
    </p>
  ) : null
}
