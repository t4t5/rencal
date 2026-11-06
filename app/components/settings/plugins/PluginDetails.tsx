import { openUrl, signal, Text, View } from "nsh"

import { ErrorText } from "@/components/settings/SettingsContent"
import { Button } from "@/components/ui/button"

import { api, getErrorMessage } from "@/lib/api"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"

import { displayCase } from "@/themes"

import { PluginPreview } from "./PluginPreview"
import { pluginOwner, type PluginListItem } from "./plugin-list"

type Action = "install" | "update" | "uninstall"

export function createPluginAction(plugin: () => PluginListItem, onChanged: () => void) {
  const action = signal<Action | null>(null)
  const error = signal<string | null>(null)

  async function run(next: Action, perform: () => Promise<unknown>) {
    action.set(next)
    error.set(null)
    try {
      await perform()
      if (next === "install") toast.success(`Installed ${plugin().name}`)
      if (next === "uninstall") toast.success(`Uninstalled ${plugin().name}`)
      action.set(null)
      onChanged()
    } catch (e) {
      error.set(
        getErrorMessage(
          e,
          next === "uninstall" ? "Failed to uninstall plugin" : "Failed to install plugin",
        ),
      )
      action.set(null)
    }
  }

  return { action, error, run }
}

export type PluginActionState = ReturnType<typeof createPluginAction>

function DetailRow(props: { label: string; value: string }) {
  return (
    <View class="flex-row gap-6">
      <Text class="w-20 shrink-0 text-sm text-muted-foreground">{props.label}</Text>
      <Text class="min-w-0 flex-1 text-sm">{props.value}</Text>
    </View>
  )
}

/** Actions, preview and details shared by the settings sheet and the deep-link dialog. */
export function PluginDetails(props: { plugin: PluginListItem; state: PluginActionState }) {
  const installed = () => props.plugin.installed
  const action = () => props.state.action()
  // Local checkouts shadow their repo, so installing from it would replace them.
  const repository = () => (installed()?.local_dir ? null : props.plugin.repo)
  const version = () => installed()?.version ?? props.plugin.version
  const repairable = () => !installed()?.update_version && installed()?.error
  const canUpdate = () => repository() && (installed()?.update_version || repairable())
  const hasView = () => props.plugin.contributions.includes("view")

  return (
    <>
      <View class="gap-3">
        <View class="flex-row flex-wrap gap-2">
          <If when={installed() && canUpdate()}>
            <Button
              disabled={action() !== null}
              label={
                action() === "update"
                  ? "Updating…"
                  : installed()?.update_version
                    ? `Update to ${installed()?.update_version}`
                    : "Reinstall"
              }
              onPress={() =>
                void props.state.run("update", () => api.plugins.install(repository() as string))
              }
            />
          </If>
          <If when={installed()}>
            {(plugin) => (
              <Button
                variant="destructive"
                disabled={action() !== null}
                label={action() === "uninstall" ? "Uninstalling…" : "Uninstall"}
                onPress={() =>
                  void props.state.run("uninstall", () => api.plugins.uninstall(plugin().id))
                }
              />
            )}
          </If>
          <If when={!installed() && repository()}>
            <Button
              disabled={action() !== null}
              label={action() === "install" ? "Installing…" : "Install"}
              onPress={() =>
                void props.state.run("install", () => api.plugins.install(repository() as string))
              }
            />
          </If>
          <If when={props.plugin.repo}>
            {(repo) => (
              <Button
                variant="secondary"
                label="View on GitHub"
                onPress={() => void openUrl(`https://github.com/${repo()}`)}
              />
            )}
          </If>
        </View>
        <If when={!props.plugin.listed}>
          <Text class="text-xs text-muted-foreground">
            This plugin isn't listed in the renCal catalog.
          </Text>
        </If>
        <If when={hasView()}>
          <Text class="text-xs text-muted-foreground">
            Its view is a React module, so it needs a build for this version of renCal to show up.
          </Text>
        </If>
        <ErrorText message={installed()?.error} />
        <ErrorText message={props.state.error()} />
      </View>
      <If when={props.plugin.preview_url}>
        {(url) => <PluginPreview url={url()} name={props.plugin.name} />}
      </If>
      <View class="gap-3 border-t border-border pt-6">
        <Text class={cn("font-mono text-sm", displayCase())}>Details</Text>
        <View class="gap-2">
          <DetailRow label="Author" value={pluginOwner(props.plugin)} />
          <If when={props.plugin.repo}>
            {(repo) => <DetailRow label="Repository" value={repo()} />}
          </If>
          <If when={installed()?.local_dir}>
            {(path) => <DetailRow label="Path" value={path()} />}
          </If>
          <If when={version()}>
            {(current) => (
              <DetailRow
                label="Version"
                value={
                  installed()?.update_version
                    ? `${current()} · ${installed()?.update_version} available`
                    : current()
                }
              />
            )}
          </If>
        </View>
      </View>
    </>
  )
}
