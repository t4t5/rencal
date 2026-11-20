// The views installed plugins contribute (`external-views-changed` follows edits).
import { signal } from "nsh"

import { api, type ExternalView } from "@/lib/api"
import { logger } from "@/lib/logger"

const list = signal<ExternalView[]>([])

export const pluginViews = () => list()

export async function startPluginViews() {
  api.notifications.listen("external-views-changed", (snapshot) => list.set(snapshot.views))
  try {
    list.set((await api.views.listExternal()).views)
  } catch (error) {
    logger.error("Failed to load plugin views", error)
  }
}
