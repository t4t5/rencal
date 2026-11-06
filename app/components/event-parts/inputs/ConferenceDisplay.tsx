import { openUrl, Text, token, View } from "nsh"
import { Button as BaseButton } from "nsh/base"

import { Button } from "@/components/ui/button"
import { Item, ItemContent, ItemMedia } from "@/components/ui/item"

import type { Calendar } from "@/lib/api"
import {
  calendarConferenceProvider,
  conferenceLabel,
  type ConferenceProvider,
  detectConference,
  type EventConference,
} from "@/lib/conference"
import { cn } from "@/lib/utils"

import { GoogleMeetIcon, VideoIcon } from "@/icons"
import { displayCase } from "@/themes"

import { RemoveItemButton } from "./RemoveItemButton"

function ConferenceLink(props: { url: string; label: string }) {
  return (
    <View class="gap-1 py-1">
      <Button class="w-full" onPress={() => void openUrl(props.url)}>
        <VideoIcon color={token("primary-foreground")} />
        <Text class={cn("font-mono text-sm font-medium text-primary-foreground", displayCase())}>
          Join {props.label}
        </Text>
      </Button>
      <Text class="truncate text-xs text-muted-foreground">{props.url}</Text>
    </View>
  )
}

function ConferenceItem(props: {
  provider: ConferenceProvider
  readonly?: boolean
  onRemove?: () => void
}) {
  return (
    <Item variant="accent">
      <ItemMedia>
        <If when={props.provider === "google"} else={<VideoIcon />}>
          <GoogleMeetIcon />
        </If>
      </ItemMedia>
      <ItemContent>
        <Text class="truncate text-sm text-foreground">{conferenceLabel[props.provider]}</Text>
      </ItemContent>
      <If when={!props.readonly && props.onRemove}>
        <RemoveItemButton onPress={props.onRemove} />
      </If>
    </Item>
  )
}

export function ConferenceDisplay(props: {
  conference?: EventConference | null
  location?: string | null
  calendar?: Calendar
  readonly?: boolean
  onConferenceChange?: (conference: EventConference | null) => void
}) {
  const live = () => (props.conference?.status === "live" ? props.conference : null)
  const requested = () => (props.conference?.status === "requested" ? props.conference : null)
  // Conference links detected in the event's location.
  const detected = () => (props.conference ? null : detectConference(props.location))
  const requestable = () => {
    if (props.conference || detected() || props.readonly || !props.onConferenceChange) return null
    return calendarConferenceProvider(props.calendar)
  }

  return (
    <>
      <If when={live()}>
        {(conference) => (
          <ConferenceLink url={conference().url} label={conferenceLabel[conference().provider]} />
        )}
      </If>
      <If when={requested()}>
        {(conference) => (
          <ConferenceItem
            provider={conference().provider}
            readonly={props.readonly}
            onRemove={() => props.onConferenceChange?.(null)}
          />
        )}
      </If>
      <If when={detected()}>
        {(link) => <ConferenceLink url={link().url} label={link().label} />}
      </If>
      <If when={requestable()}>
        {(provider) => (
          <BaseButton
            onPress={() =>
              props.onConferenceChange?.({ status: "requested", provider: provider() })
            }
            class="h-(--control-height) w-full flex-row items-center gap-2 rounded-(--radius-md) border border-transparent px-2 hover:bg-accent"
          >
            <ItemMedia>
              <VideoIcon color={token("muted-foreground")} />
            </ItemMedia>
            <ItemContent>
              <Text class="text-sm text-muted-foreground">Add {conferenceLabel[provider()]}</Text>
            </ItemContent>
          </BaseButton>
        )}
      </If>
    </>
  )
}
