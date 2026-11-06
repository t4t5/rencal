import { type JSX, Text, token, View } from "nsh"
import { Tooltip as BaseTooltip } from "nsh/base"

import { Button } from "@/components/ui/button"

import type { SyncPreview } from "@/lib/api"

import { CloudCheckIcon, CloudIcon, CloudOffIcon, CloudWarningIcon, SyncIcon } from "@/icons"
import { calendarOf } from "@/stores/calendar"
import { autoSyncEnabled } from "@/stores/settings"
import { isOnline, pendingPreviews, syncError, syncNow, syncStatus } from "@/stores/sync"

type Shown = "offline" | "error" | "syncing" | "checking" | "pending" | "synced"

const shown = (pending: number): Shown => {
  if (!isOnline()) return "offline"
  if (syncError()) return "error"
  if (syncStatus() === "syncing") return "syncing"
  if (syncStatus() === "checking") return "checking"
  return pending ? "pending" : "synced"
}

const changesOf = (preview: SyncPreview) =>
  [
    preview.to_pull_count > 0 && `${preview.to_pull_count} to pull`,
    preview.to_push_count > 0 && `${preview.to_push_count} to push`,
  ]
    .filter(Boolean)
    .join(", ")

function ChangesPreview() {
  return (
    <View class="gap-1">
      <Text class="text-xs font-medium text-tooltip-foreground">Click to sync</Text>
      <Each of={pendingPreviews()} key={(preview) => preview.calendar_slug}>
        {(preview) => (
          <Text class="text-xs text-muted-foreground">
            {calendarOf(preview().calendar_slug)?.name ?? preview().calendar_slug}:{" "}
            {changesOf(preview())}
          </Text>
        )}
      </Each>
    </View>
  )
}

function Hint(props: { children?: JSX.Element }) {
  return (
    <BaseTooltip
      placement="bottom"
      delay={0}
      class="max-w-64 rounded-(--radius-md) bg-tooltip px-3 py-1.5"
    >
      {props.children}
    </BaseTooltip>
  )
}

const hintText = (text: string | null) => (
  <Text class="text-xs text-tooltip-foreground">{text}</Text>
)

export function SyncStatus() {
  const pendingCount = () =>
    pendingPreviews().reduce((sum, p) => sum + p.to_push_count + p.to_pull_count, 0)
  const state = () => shown(pendingCount())

  return (
    <View
      tooltip={
        <Hint>
          <If when={state() === "pending" && !autoSyncEnabled()}>
            <ChangesPreview />
          </If>
          <If when={state() !== "pending"}>
            {hintText(
              {
                offline: "No internet connection",
                error: syncError(),
                syncing: "Syncing...",
                checking: "Checking for changes...",
                synced: "Up-to-date",
                pending: null,
              }[state()],
            )}
          </If>
        </Hint>
      }
    >
      <Button variant="ghost" size="icon" accessibilityLabel="Sync" onPress={() => void syncNow()}>
        <If when={state() === "offline"}>
          <CloudOffIcon class="size-4" color={token("destructive")} />
        </If>
        <If when={state() === "error"}>
          <CloudWarningIcon class="size-4" color={token("warning")} />
        </If>
        <If when={state() === "syncing"}>
          <SyncIcon class="size-4 animate-spin" color={token("muted-foreground")} />
        </If>
        <If when={state() === "checking"}>
          <CloudIcon class="size-5 animate-pulse" color={token("muted-foreground")} />
        </If>
        <If when={state() === "pending"}>
          <CloudIcon class="size-5" color={token("muted-foreground")} />
        </If>
        <If when={state() === "synced"}>
          <CloudCheckIcon class="size-5" color={token("muted-foreground")} />
        </If>
        <If when={pendingCount() > 0 && !autoSyncEnabled()}>
          <View class="absolute -right-0.5 -top-0.5 h-[14px] min-w-[14px] items-center justify-center rounded-full bg-primary px-[3px]">
            <Text class="text-2xs font-medium text-primary-foreground">{pendingCount()}</Text>
          </View>
        </If>
      </Button>
    </View>
  )
}
