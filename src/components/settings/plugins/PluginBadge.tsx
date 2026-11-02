import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

import { CONTRIBUTION_LABELS, type PluginListItem } from "./plugin-list"

const VARIANTS = {
  outline: "border-border text-muted-foreground",
  solid: "border-transparent bg-secondary text-secondary-foreground shadow-button-border",
  // Themes check --success as text, but pair no foreground with it as a fill.
  success: "border-success/50 bg-success/10 text-success",
}

export function PluginBadge({
  variant = "outline",
  children,
}: {
  variant?: keyof typeof VARIANTS
  children: ReactNode
}) {
  return (
    <span className={cn("shrink-0 rounded-xs border px-1.5 py-0.5 text-xs", VARIANTS[variant])}>
      {children}
    </span>
  )
}

export function PluginBadges({ plugin }: { plugin: PluginListItem }) {
  if (plugin.contributions.length === 0 && !plugin.installed) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {plugin.contributions.map((kind) => (
        <PluginBadge key={kind}>{CONTRIBUTION_LABELS[kind]}</PluginBadge>
      ))}
      {plugin.installed?.update_version ? (
        <PluginBadge variant="success">Update available</PluginBadge>
      ) : (
        plugin.installed && <PluginBadge variant="solid">Installed</PluginBadge>
      )}
    </div>
  )
}
