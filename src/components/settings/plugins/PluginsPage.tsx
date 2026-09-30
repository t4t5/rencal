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

import { api, getErrorMessage, type InstalledPlugins, type PluginCatalog } from "@/lib/api"

import { PluginBadge } from "./PluginBadge"
import { PluginSheet } from "./PluginSheet"
import {
  CONTRIBUTION_LABELS,
  isProvider,
  mergePlugins,
  pluginOwner,
  resolveSelection,
  type PluginListItem,
  type PluginSelection,
} from "./plugin-list"

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
  const [selection, setSelection] = useState<PluginSelection | null>(null)
  const listRequest = useRef(0)

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

  const plugins = useMemo(
    () => (installed ? mergePlugins(installed, catalog) : []),
    [catalog, installed],
  )

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

/** Unlisted plugins have no stars or release date, so they sort last; ties go by name. */
function comparePlugins(left: PluginListItem, right: PluginListItem, sort: PluginSort): number {
  const byKey =
    sort === "stars"
      ? right.stars - left.stars
      : (right.released_at ?? "").localeCompare(left.released_at ?? "")
  return byKey || left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
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
