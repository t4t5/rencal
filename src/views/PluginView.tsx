import { Component, type ComponentType, lazy, type ReactNode, Suspense } from "react"

import type { ExternalView } from "@/lib/api"
import { logger } from "@/lib/logger"

import { loadPluginModule } from "@/views/plugin-modules"

class PluginErrorBoundary extends Component<
  { name: string; children: ReactNode },
  { error: Error | null }
> {
  state = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    logger.error(`View plugin "${this.props.name}" failed`, error)
  }

  render() {
    const { error } = this.state as { error: Error | null }
    if (!error) return this.props.children
    return (
      <div
        data-slot="plugin-view-error"
        className="flex flex-col items-center justify-center gap-1 h-full p-6 text-center"
      >
        <p className="text-sm font-medium">The {this.props.name} view failed to load</p>
        <p className="text-xs text-muted-foreground max-w-md">{error.message}</p>
      </div>
    )
  }
}

// The script is loaded when the view first renders, and a failure stays inside it.
export function pluginViewComponent(view: ExternalView): ComponentType {
  const View = lazy(async () => {
    const module = await loadPluginModule(view.script)
    if (typeof module.default !== "function") {
      throw new Error(`${view.id} doesn't default-export a component`)
    }
    return { default: module.default as ComponentType }
  })

  function PluginView() {
    return (
      <PluginErrorBoundary name={view.name}>
        <Suspense>
          <View />
        </Suspense>
      </PluginErrorBoundary>
    )
  }
  PluginView.displayName = `PluginView(${view.id})`
  return PluginView
}
