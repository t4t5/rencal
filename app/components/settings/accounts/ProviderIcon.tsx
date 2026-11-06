import { Image, type JSX } from "nsh"

import type { ProviderInfo } from "@/lib/api"
import { getProviderIcon } from "@/lib/providers"

/** A plugin's icon wins over renCal's built-in ones. */
export function ProviderIcon(props: {
  slug: string | null
  info: ProviderInfo | undefined
  fallback?: (props: { class?: string }) => JSX.Element
  class?: string
}) {
  const builtin = () => getProviderIcon(props.slug) ?? props.fallback
  return (
    <If
      when={props.info?.icon}
      else={<If when={builtin()}>{(Icon) => Icon()({ class: props.class })}</If>}
    >
      {(icon) => <Image src={icon()} class={props.class} />}
    </If>
  )
}
