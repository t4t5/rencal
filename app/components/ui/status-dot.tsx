import { token, View } from "nsh"

import type { ResponseStatus } from "@/lib/cal-events"
import { cn } from "@/lib/utils"

import { CheckIcon, CloseIcon, QuestionMarkIcon } from "@/icons"

const COLORS: Record<string, string> = {
  accepted: "bg-success",
  declined: "bg-destructive",
  tentative: "bg-warning",
}

export function StatusDot(props: { status: ResponseStatus | null | undefined }) {
  const mark = { class: "size-3", color: token("background") }
  return (
    <View
      class={cn(
        "size-4 shrink-0 items-center justify-center rounded-(--radius-circle)",
        COLORS[props.status ?? ""] ?? "bg-muted-foreground",
      )}
    >
      <If when={props.status === "accepted"}>
        <CheckIcon {...mark} />
      </If>
      <If when={props.status === "declined"}>
        <CloseIcon {...mark} />
      </If>
      <If when={props.status === "tentative"}>
        <QuestionMarkIcon {...mark} />
      </If>
    </View>
  )
}
