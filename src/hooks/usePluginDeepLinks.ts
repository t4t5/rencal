import { useEffect } from "react"

import { openSettingsWindow } from "@/components/toolbar/SettingsButton"

import { api } from "@/lib/api"
import { hasPendingPluginInstall } from "@/lib/api/internal"

export function usePluginDeepLinks(): void {
  useEffect(() => {
    let disposed = false
    const openPlugins = () => void openSettingsWindow({ tab: "plugins" })
    const subscription = api.notifications.listen("plugin-deep-link-available", openPlugins)

    void subscription.ready
      .then(async () => {
        if (!disposed && (await hasPendingPluginInstall())) openPlugins()
      })
      .catch((error: unknown) => console.error("Failed to open plugin deep link:", error))

    return () => {
      disposed = true
      subscription.unlisten()
    }
  }, [])
}
