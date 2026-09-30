import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { OrbitRing } from "@/components/loading-ui/orbit-ring"
import { SettingsContent } from "@/components/settings/SettingsContent"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import {
  api,
  getErrorMessage,
  type InstalledPlugins,
  type PluginCatalog,
  type PluginInstallLink,
} from "@/lib/api"

import { PluginBadge } from "./PluginBadge"
import { PluginPreview } from "./PluginPreview"
import { PluginSheet } from "./PluginSheet"
import { CONTRIBUTION_LABELS, isProvider, pluginOwner, type PluginListItem } from "./plugin-list"

/** Deep links only know the repo, so a selection is resolved against the latest lists. */
type Selection = { id: string | null; repo: string | null }

export function PluginsPage() {
  const [installed, setInstalled] = useState<InstalledPlugins | null>(null)
  const [catalog, setCatalog] = useState<PluginCatalog | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [installLinkError, setInstallLinkError] = useState<string | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const listRequest = useRef(0)
  const busyRef = useRef(false)
  const pendingInstall = useRef<PluginInstallLink | null>(null)

  function setBusy(busy: boolean) {
    busyRef.current = busy
    if (busy) return
    const pending = pendingInstall.current
    pendingInstall.current = null
    if (pending) setSelection({ id: null, repo: pending.repo })
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
        setInstallLinkError(null)
        if (busyRef.current) {
          pendingInstall.current = link
        } else {
          setSelection({ id: null, repo: link.repo })
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

  const plugins = useMemo(() => {
    if (!installed) return []

    const catalogById = new Map(catalog?.plugins.map((plugin) => [plugin.id, plugin]))
    const installedIds = new Set(installed.plugins.map((plugin) => plugin.id))
    return [
      ...installed.plugins.map((plugin) => {
        const entry = catalogById.get(plugin.id)
        return {
          ...plugin,
          description: entry?.description ?? null,
          preview_url: entry?.preview_url ?? null,
          contributions: entry ? (entry.contributions ?? []) : null,
          installed: plugin,
        }
      }),
      ...(catalog?.plugins ?? [])
        .filter((plugin) => !installedIds.has(plugin.id))
        .map((plugin) => ({
          ...plugin,
          version: catalogVersion(plugin.tag),
          preview_url: plugin.preview_url ?? null,
          contributions: plugin.contributions ?? [],
          installed: null,
        })),
    ] satisfies PluginListItem[]
  }, [catalog, installed])

  const visiblePlugins = useMemo(() => {
    const query = search.trim().toLowerCase()
    return query
      ? plugins.filter((plugin) =>
          `${plugin.name} ${plugin.repo ?? ""} ${plugin.installed?.local_dir ?? ""} ${plugin.description ?? ""} ${isProvider(plugin) ? "provider" : ""}`
            .toLowerCase()
            .includes(query),
        )
      : plugins
  }, [plugins, search])

  const selected = selection && resolveSelection(plugins, selection)

  return (
    <SettingsContent className="w-full min-w-0 mt-3">
      <Input
        variant="default"
        className="shrink-0"
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
        {visiblePlugins.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {visiblePlugins.map((plugin) => (
              <PluginCard
                key={plugin.id}
                plugin={plugin}
                onSelect={() => setSelection({ id: plugin.id, repo: plugin.repo })}
              />
            ))}
          </div>
        )}
      </div>
      {selected && (
        <PluginSheet
          key={`${selection.id ?? ""}:${selection.repo ?? ""}`}
          plugin={selected}
          onClose={() => setSelection(null)}
          onBusyChange={setBusy}
          onChanged={() => {
            setSelection(null)
            void refreshInstalled()
          }}
        />
      )}
    </SettingsContent>
  )
}

/** Releases show their tag; unreleased themes show a short commit. */
function catalogVersion(tag: string): string {
  return /^[0-9a-f]{40}$/.test(tag) ? tag.slice(0, 7) : tag
}

function resolveSelection(plugins: PluginListItem[], selection: Selection): PluginListItem {
  const repo = selection.repo?.toLowerCase()
  const match = plugins.find((plugin) =>
    selection.id ? plugin.id === selection.id : plugin.repo?.toLowerCase() === repo,
  )
  if (match) return match
  const name = selection.repo?.split("/").at(-1) ?? selection.id ?? ""
  return {
    id: selection.id ?? name,
    name,
    repo: selection.repo,
    version: null,
    description: null,
    preview_url: null,
    contributions: null,
    installed: null,
  }
}

function PluginCard({ plugin, onSelect }: { plugin: PluginListItem; onSelect: () => void }) {
  const error = plugin.installed?.error
  const status = plugin.installed?.update_version
    ? "Update available"
    : plugin.installed
      ? "Installed"
      : null

  // Flex column pins content to the top of a stretched <button>; w-full because WebKit doesn't stretch its children.
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex w-full min-w-0 flex-col justify-start rounded-lg border border-border p-4 text-left outline-none transition-colors hover:border-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex w-full flex-col gap-3 min-w-0">
        <h3 data-typography="heading" className="truncate text-sm">
          {plugin.name}
        </h3>
        {(plugin.contributions?.length || status) && (
          <div className="flex flex-wrap gap-1.5">
            {plugin.contributions?.map((kind) => (
              <PluginBadge key={kind}>{CONTRIBUTION_LABELS[kind]}</PluginBadge>
            ))}
            {status && <PluginBadge solid>{status}</PluginBadge>}
          </div>
        )}
        <PluginPreview key={plugin.preview_url} url={plugin.preview_url} name={plugin.name} />
        {plugin.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{plugin.description}</p>
        )}
        <p className="truncate text-xs text-muted-foreground">by {pluginOwner(plugin)}</p>
        {error && <p className="line-clamp-2 text-xs text-destructive">{error}</p>}
      </div>
    </button>
  )
}

function ErrorMessage({ message }: { message?: string | null }) {
  return message ? (
    <p role="alert" className="text-sm text-destructive break-words">
      {message}
    </p>
  ) : null
}
