import { effect, resource, signal, Text, View } from "nsh"

import { ErrorText } from "@/components/settings/SettingsContent"
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

import { api, getErrorMessage } from "@/lib/api"
import { toast } from "@/lib/toast"

import { PluginBadges } from "./PluginBadge"
import { createPluginAction, PluginDetails } from "./PluginDetails"
import { mergePlugins, resolveSelection } from "./plugin-list"

const repo = signal<string | null>(null)
// Links stay queued in the backend while an action runs, so they can't swap the
// dialog mid-install.
let busy = false

async function next() {
  if (busy) return
  try {
    const link = await api.plugins.takePendingInstall()
    if (link) repo.set(link.repo)
  } catch (error) {
    console.error("Failed to open plugin deep link:", error)
    toast.error("Couldn’t open plugin link", {
      description: getErrorMessage(error, "Failed to read the plugin install link"),
    })
  }
}

// List after the catalog: the backend finds updates against the catalog it fetched.
async function loadPlugins() {
  const catalog = await api.plugins.catalog()
  return mergePlugins(await api.plugins.list(), catalog)
}

function InstallDialog(props: { repo: string; onClose: () => void }) {
  const plugins = resource(loadPlugins)
  const plugin = () => resolveSelection(plugins() ?? [], { id: null, repo: props.repo })
  const state = createPluginAction(plugin, props.onClose)
  const loadError = () => {
    const error = plugins.error()
    return error ? getErrorMessage(error, "Failed to load plugin details") : null
  }

  effect(() => {
    busy = state.action() !== null
    if (!busy) void next()
  })

  return (
    <Dialog
      open
      class="w-[448px]"
      onOpenChange={(open) => {
        if (!open && !state.action()) props.onClose()
      }}
    >
      <DialogHeader class="gap-3">
        <DialogTitle class="pr-6 text-left text-lg">{plugin().name}</DialogTitle>
        <PluginBadges plugin={plugin()} />
        <If when={plugin().description}>
          <DialogDescription>{plugin().description}</DialogDescription>
        </If>
      </DialogHeader>
      <ErrorText message={loadError()} />
      <If
        when={plugins() || loadError()}
        else={<Text class="text-sm text-muted-foreground">Loading plugin…</Text>}
      >
        <View class="gap-4">
          <PluginDetails plugin={plugin()} state={state} />
        </View>
      </If>
    </Dialog>
  )
}

/** Shows `rencal://plugin/install` links so they can be installed in place. */
export function PluginInstallDialog() {
  api.notifications.listen("plugin-deep-link-available", () => void next())
  void next()

  return (
    <If when={repo()}>
      {(current) => <InstallDialog repo={current()} onClose={() => repo.set(null)} />}
    </If>
  )
}
