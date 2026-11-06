import { computed, effect, cleanup, signal, Text, View } from "nsh"
import { Button as BaseButton } from "nsh/base"

import { ErrorText, SettingsContent } from "@/components/settings/SettingsContent"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"

import { api, getErrorMessage, type InstalledPlugins, type PluginCatalog } from "@/lib/api"
import { cn } from "@/lib/utils"

import { displayCase } from "@/themes"

import { PluginBadges } from "./PluginBadge"
import { PluginSheet } from "./PluginSheet"
import {
  mergePlugins,
  pluginCount,
  pluginOwner,
  type PluginListItem,
  type PluginSelection,
  type PluginSort,
  resolveSelection,
  visiblePlugins,
} from "./plugin-list"
import { reportPluginUpdates } from "./plugin-updates"

const SORTS = [
  { value: "stars", title: "Most starred" },
  { value: "latest", title: "Latest" },
]

export function PluginsPage() {
  const installed = signal<InstalledPlugins | null>(null)
  const catalog = signal<PluginCatalog | null>(null)
  const listError = signal<string | null>(null)
  const catalogLoading = signal(false)
  const search = signal("")
  const sort = signal<PluginSort>("stars")
  const installedOnly = signal(false)
  const selection = signal<PluginSelection | null>(null)
  let latestList = 0

  const refreshInstalled = async () => {
    const request = ++latestList
    try {
      const snapshot = await api.plugins.list()
      if (request !== latestList) return
      installed.set(snapshot)
      reportPluginUpdates(snapshot)
      listError.set(null)
    } catch (error) {
      if (request === latestList) {
        listError.set(getErrorMessage(error, "Failed to load installed plugins"))
      }
    }
  }

  const refreshCatalog = async () => {
    catalogLoading.set(true)
    try {
      catalog.set(await api.plugins.catalog())
      // The backend finds updates against the catalog it just fetched.
      void refreshInstalled()
    } catch (error) {
      catalog.update((previous) => ({
        plugins: previous?.plugins ?? [],
        error: getErrorMessage(error, "Failed to load plugin catalog"),
      }))
    } finally {
      catalogLoading.set(false)
    }
  }

  void refreshInstalled()
  void refreshCatalog()
  const changes = api.notifications.listen("external-themes-changed", () => void refreshInstalled())
  cleanup(() => {
    latestList += 1
    changes.unlisten()
  })

  const plugins = computed(() => {
    const list = installed()
    return list ? mergePlugins(list, catalog()) : []
  })
  const visible = computed(() => visiblePlugins(plugins(), search(), installedOnly(), sort()))
  const selected = () => {
    const current = selection()
    return current && resolveSelection(plugins(), current)
  }
  const emptyMessage = () => {
    if (search()) return "No plugins match your search."
    return installedOnly() ? "No plugins installed yet." : "No plugins listed yet."
  }

  return (
    <View class="min-w-0 flex-1">
      <View class="shrink-0 gap-3 border-b border-border p-4 pt-7">
        <View class="flex-row items-center gap-2">
          <Input
            variant="default"
            class="flex-1"
            accessibilityLabel="Search plugins"
            placeholder="Search plugins…"
            value={search()}
            onChange={({ value }) => search.set(value)}
          />
          <Select
            variant="default"
            class="w-36"
            items={SORTS}
            value={sort()}
            onChange={(value) => sort.set(value as PluginSort)}
          />
        </View>
        <View class="flex-row items-center justify-between gap-4">
          <If when={installed()}>
            <Text class="text-sm text-muted-foreground tabular-nums">
              {pluginCount(visible().length, plugins().length)}
            </Text>
          </If>
          <Checkbox checked={installedOnly()} onChange={(value) => installedOnly.set(value)}>
            <Text class="text-sm">Installed only</Text>
          </Checkbox>
        </View>
      </View>
      <SettingsContent contentClass="min-w-0 gap-3">
        <Text class="text-xs text-muted-foreground">
          Themes and providers work as usual. Plugin views are React modules, so they can't load
          here until they have a native build.
        </Text>
        <If when={listError()}>
          <View class="flex-row items-center gap-2">
            <ErrorText message={listError()} />
            <Button variant="ghost" label="Retry" onPress={() => void refreshInstalled()} />
          </View>
        </If>
        <Each of={installed()?.errors ?? []}>{(error) => <ErrorText message={error()} />}</Each>
        <If when={catalog()?.error}>
          <View class="flex-row items-center gap-2">
            <ErrorText message={catalog()?.error} />
            <Button
              variant="ghost"
              label="Retry"
              disabled={catalogLoading()}
              onPress={() => void refreshCatalog()}
            />
          </View>
        </If>
        <If when={!installed() && !listError()}>
          <Text class="text-sm text-muted-foreground">Loading plugins…</Text>
        </If>
        <If when={installed() && catalog() && !catalog()?.error && visible().length === 0}>
          <Text class="text-sm text-muted-foreground">{emptyMessage()}</Text>
        </If>
        <If when={visible().length > 0}>
          <View class="grid grid-cols-2 gap-3">
            <Each of={visible()} key={(plugin) => plugin.id}>
              {(plugin) => (
                <PluginCard
                  plugin={plugin()}
                  onSelect={() => selection.set({ id: plugin().id, repo: plugin().repo })}
                />
              )}
            </Each>
          </View>
        </If>
      </SettingsContent>
      <If when={selected()}>
        {(plugin) => (
          <PluginSheet
            plugin={plugin()}
            onClose={() => selection.set(null)}
            onChanged={() => {
              selection.set(null)
              void refreshInstalled()
            }}
          />
        )}
      </If>
    </View>
  )
}

function PluginCard(props: { plugin: PluginListItem; onSelect: () => void }) {
  return (
    <BaseButton
      onPress={props.onSelect}
      class="min-w-0 gap-3 rounded-(--radius-lg) border border-border p-4 hover:border-muted-foreground"
    >
      <Text class={cn("truncate font-mono text-sm", displayCase())}>{props.plugin.name}</Text>
      <PluginBadges plugin={props.plugin} />
      <If when={props.plugin.description}>
        <Text class="line-clamp-2 text-sm text-muted-foreground">{props.plugin.description}</Text>
      </If>
      <Text class="truncate text-xs text-muted-foreground">by {pluginOwner(props.plugin)}</Text>
      <If when={props.plugin.installed?.error}>
        <Text class="line-clamp-2 text-xs text-destructive">{props.plugin.installed?.error}</Text>
      </If>
    </BaseButton>
  )
}
