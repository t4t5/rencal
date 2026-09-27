import type { ProviderInfo } from "@/lib/api"
import { getProviderIcon } from "@/lib/providers"
import { IconType } from "@/lib/types"

/** A plugin's icon wins over renCal's built-in ones. */
export function ProviderIcon({
  slug,
  info,
  fallback,
  className,
}: {
  slug: string | null
  info: ProviderInfo | undefined
  fallback?: IconType
  className?: string
}) {
  // An <img> keeps any script in a plugin's SVG inert.
  if (info?.icon) return <img src={info.icon} alt="" draggable={false} className={className} />

  const Icon = getProviderIcon(slug) ?? fallback
  return Icon ? <Icon className={className} /> : null
}
