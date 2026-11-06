import { Image, signal, View } from "nsh"

import { RencalLogomarkIcon } from "@/icons"

export function PluginPreview(props: { url: string; name: string }) {
  const status = signal<"loading" | "loaded" | "failed">("loading")
  return (
    <View class="aspect-video w-full items-center justify-center overflow-hidden rounded-(--radius-xs) bg-muted">
      <If when={status() !== "loaded"}>
        <RencalLogomarkIcon class="w-8 opacity-15" />
      </If>
      <If when={status() !== "failed"}>
        <Image
          src={props.url}
          accessibilityLabel={`${props.name} preview`}
          class="absolute size-full"
          style={{ objectFit: "cover" }}
          onLoad={() => status.set("loaded")}
          onError={() => status.set("failed")}
        />
      </If>
    </View>
  )
}
