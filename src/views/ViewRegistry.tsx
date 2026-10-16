import { createContext, type ReactNode, useEffect, useMemo, useRef, useState } from "react"

import { api, type ExternalView } from "@/lib/api"
import { logger } from "@/lib/logger"

import { pluginViewComponent } from "@/views/PluginView"
import { BUILTIN_VIEWS, type ViewDescriptor } from "@/views/manifest"

const STYLE_ATTR = "data-plugin-view"

export const ViewRegistryContext = createContext<readonly ViewDescriptor[]>(BUILTIN_VIEWS)

// Loaded before the first render so a stored plugin view opens directly
// instead of showing the default view until plugins arrive.
export async function preloadExternalViews(): Promise<ExternalView[]> {
  try {
    return (await api.views.listExternal()).views
  } catch (err) {
    logger.error("Failed to load plugin views", err)
    return []
  }
}

function applyPluginStyles(views: readonly ExternalView[]) {
  // Ordered below host utilities in global.css, so plugin classes can't override host layout.
  const styles = new Map(
    views.flatMap((view) => (view.css ? [[view.id, `@layer plugins {\n${view.css}\n}`]] : [])),
  )
  for (const element of document.head.querySelectorAll<HTMLStyleElement>(`style[${STYLE_ATTR}]`)) {
    if (!styles.has(element.getAttribute(STYLE_ATTR) ?? "")) element.remove()
  }
  for (const [id, css] of styles) {
    let element = document.head.querySelector<HTMLStyleElement>(
      `style[${STYLE_ATTR}="${CSS.escape(id)}"]`,
    )
    if (!element) {
      element = document.createElement("style")
      element.setAttribute(STYLE_ATTR, id)
      document.head.appendChild(element)
    }
    if (element.textContent !== css) element.textContent = css
  }
}

export function ViewRegistryProvider({
  initialExternalViews,
  children,
}: {
  initialExternalViews: ExternalView[]
  children: ReactNode
}) {
  const [externalViews, setExternalViews] = useState(initialExternalViews)

  useEffect(() => {
    const subscription = api.notifications.listen("external-views-changed", (snapshot) =>
      setExternalViews(snapshot.views),
    )
    return subscription.unlisten
  }, [])

  useEffect(() => applyPluginStyles(externalViews), [externalViews])

  // Keep a view's component while its script is unchanged, so rescans for
  // unrelated plugin edits don't remount it.
  const components = useRef(
    new Map<string, { script: string; component: ViewDescriptor["component"] }>(),
  )

  const views = useMemo(() => {
    const plugins = externalViews.map((view): ViewDescriptor => {
      let cached = components.current.get(view.id)
      if (cached?.script !== view.script) {
        cached = { script: view.script, component: pluginViewComponent(view) }
        components.current.set(view.id, cached)
      }
      return {
        id: view.id,
        name: view.name,
        component: cached.component,
      }
    })
    return [...BUILTIN_VIEWS, ...plugins]
  }, [externalViews])

  return <ViewRegistryContext.Provider value={views}>{children}</ViewRegistryContext.Provider>
}
