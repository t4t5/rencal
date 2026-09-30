import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"

import { OrbitRing } from "@/components/loading-ui/orbit-ring"
import { SettingsContent } from "@/components/settings/SettingsContent"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import {
  api,
  getErrorMessage,
  type InstalledPlugins,
  type PluginCatalog,
  type PluginInstallLink,
} from "@/lib/api"

import { PluginBadge } from "./PluginBadge"
import { PluginSheet } from "./PluginSheet"
import { CONTRIBUTION_LABELS, isProvider, pluginOwner, type PluginListItem } from "./plugin-list"

/** Deep links only know the repo, so a selection is resolved against the latest lists. */
type Selection = { id: string | null; repo: string | null }

type PluginSort = "stars" | "latest"

export function PluginsPage() {
  const [installed, setInstalled] = useState<InstalledPlugins | null>(null)
  const [catalog, setCatalog] = useState<PluginCatalog | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<PluginSort>("stars")
  const [installedOnly, setInstalledOnly] = useState(false)
  const installedOnlyId = useId()
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

    const installedById = new Map(installed.plugins.map((plugin) => [plugin.id, plugin]))
    const catalogIds = new Set(catalog?.plugins.map((plugin) => plugin.id))
    return [
      ...(catalog?.plugins ?? []).map((entry) => {
        const plugin = installedById.get(entry.id)
        if (!plugin) {
          return {
            ...entry,
            version: catalogVersion(entry.tag),
            preview_url: entry.preview_url ?? null,
            contributions: entry.contributions ?? [],
            stars: entry.stars ?? 0,
            released_at: entry.released_at ?? null,
            listed: true,
            installed: null,
          }
        }
        return {
          ...plugin,
          description: entry.description ?? plugin.description,
          preview_url: entry.preview_url ?? plugin.preview_url,
          contributions: entry.contributions ?? plugin.contributions,
          stars: entry.stars ?? 0,
          released_at: entry.released_at ?? null,
          listed: true,
          installed: plugin,
        }
      }),
      // Local and unlisted plugins aren't in the catalog
      ...installed.plugins
        .filter((plugin) => !catalogIds.has(plugin.id))
        .map((plugin) => ({
          ...plugin,
          stars: 0,
          released_at: null,
          listed: false,
          installed: plugin,
        })),
    ] satisfies PluginListItem[]
  }, [catalog, installed])

  const visiblePlugins = useMemo(() => {
    const query = search.trim().toLowerCase()
    return plugins
      .filter(
        (plugin) =>
          (!installedOnly || plugin.installed) &&
          `${plugin.name} ${plugin.repo ?? ""} ${plugin.installed?.local_dir ?? ""} ${plugin.description ?? ""} ${isProvider(plugin) ? "provider" : ""}`
            .toLowerCase()
            .includes(query),
      )
      .sort((left, right) => comparePlugins(left, right, sort))
  }, [plugins, search, installedOnly, sort])

  const selected = selection && resolveSelection(plugins, selection)

  return (
    <div className="flex w-full min-w-0 flex-col">
      <div className="flex shrink-0 flex-col gap-3 border-b border-border p-4 pt-7">
        <div className="flex items-center gap-2">
          <Input
            variant="default"
            className="flex-1"
            aria-label="Search plugins"
            placeholder="Search plugins…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select value={sort} onValueChange={(next) => setSort(next as PluginSort)}>
            <SelectTrigger variant="default" aria-label="Sort plugins" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stars">Most starred</SelectItem>
              <SelectItem value="latest">Latest</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between gap-4 text-sm">
          <p className="text-muted-foreground tabular-nums" role="status">
            {installed && pluginCount(visiblePlugins.length, plugins.length)}
          </p>
          <div className="flex items-center gap-2">
            <Checkbox
              id={installedOnlyId}
              checked={installedOnly}
              onCheckedChange={(checked) => setInstalledOnly(checked === true)}
            />
            <Label htmlFor={installedOnlyId} className="text-sm">
              Installed only
            </Label>
          </div>
        </div>
      </div>
      <SettingsContent className="min-w-0 gap-3">
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
            {search
              ? "No plugins match your search."
              : installedOnly
                ? "No plugins installed yet."
                : "No plugins listed yet."}
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
      </SettingsContent>
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
    </div>
  )
}

function pluginCount(visible: number, total: number): string {
  const noun = total === 1 ? "plugin" : "plugins"
  return visible === total
    ? `${total.toLocaleString()} ${noun}`
    : `${visible.toLocaleString()} of ${total.toLocaleString()} ${noun}`
}

/** Releases show their tag; unreleased themes show a short commit. */
function catalogVersion(tag: string): string {
  return /^[0-9a-f]{40}$/.test(tag) ? tag.slice(0, 7) : tag
}

/** Unlisted plugins have no stars or release date, so they sort last; ties go by name. */
function comparePlugins(left: PluginListItem, right: PluginListItem, sort: PluginSort): number {
  const byKey =
    sort === "stars"
      ? right.stars - left.stars
      : (right.released_at ?? "").localeCompare(left.released_at ?? "")
  return byKey || left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
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
    contributions: [],
    stars: 0,
    released_at: null,
    listed: false,
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
        {(plugin.contributions.length > 0 || status) && (
          <div className="flex flex-wrap gap-1.5">
            {plugin.contributions.map((kind) => (
              <PluginBadge key={kind}>{CONTRIBUTION_LABELS[kind]}</PluginBadge>
            ))}
            {status && <PluginBadge solid>{status}</PluginBadge>}
          </div>
        )}
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
