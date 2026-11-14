import { type JSX, signal, Text, token, View } from "nsh"

import { TimeZonePicker } from "@/components/event-parts/inputs/TimeZonePicker"
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu"
import { Tooltip } from "@/components/ui/tooltip"

import { MAX_EXTRA_TIME_ZONES, nowZoned, timeZoneCity } from "@/lib/event-time"

import { CloseIcon, GlobeIcon, PlusIcon } from "@/icons"
import { viewerTzid } from "@/stores/clock"
import { setExtraTimeZones, storedTimeZones } from "@/stores/settings"

const PICKER_POPUP = "w-80"

/** The zones a pick can't be: the viewer's and the extra ones, but `tzid`. */
const takenBesides = (tzid?: string) =>
  [viewerTzid(), ...storedTimeZones()].filter((other) => other !== tzid)

const hasRoom = () => storedTimeZones().length < MAX_EXTRA_TIME_ZONES

/**
 * A "+" that opens a list of zones and adds the pick to the extra time zones.
 * Renders nothing once those are full.
 */
export function AddTimeZoneButton() {
  const open = signal(false)
  // Offsets as they are today.
  const now = nowZoned()
  return (
    <If when={hasRoom()}>
      <View tooltip={<Tooltip label="Add time zone" placement="bottom" />}>
        <TimeZonePicker
          at={now}
          open={open()}
          onOpenChange={(next) => open.set(next)}
          exclude={takenBesides()}
          onSelect={(tzid) => void setExtraTimeZones([...storedTimeZones(), tzid])}
          popupClass={PICKER_POPUP}
          accessibilityLabel="Add time zone"
          trigger={
            <View
              testID="time-zone-add"
              class="size-5 items-center justify-center rounded-(--radius-sm) hover:bg-accent aria-expanded:bg-accent"
            >
              <PlusIcon class="size-3.5" color={token("muted-foreground")} />
            </View>
          }
        />
      </View>
    </If>
  )
}

/**
 * A menu on `children`, e.g. a zone's name, to change `tzid` in the extra time
 * zones, add another zone while there's room, or remove `tzid`.
 */
export function TimeZoneMenu(props: { tzid: string; children: JSX.Element }) {
  const picking = signal<"change" | "add" | null>(null)
  // The list opens once the menu has gone, so the two never fight over the keys.
  let pickNext: "change" | "add" | null = null
  const now = nowZoned()

  const pick = (next: string) =>
    void setExtraTimeZones(
      picking() === "add"
        ? [...storedTimeZones(), next]
        : storedTimeZones().map((other) => (other === props.tzid ? next : other)),
    )

  return (
    <View class="relative">
      <Menu
        align="start"
        popupClass="min-w-60"
        trigger={props.children}
        onClose={() => {
          if (!pickNext) return
          picking.set(pickNext)
          pickNext = null
        }}
      >
        <MenuItem onSelect={() => (pickNext = "change")}>
          <GlobeIcon class="size-4" />
          <Text class="text-sm">Change time zone</Text>
          <Text class="ml-auto pl-4 text-sm text-muted-foreground">{timeZoneCity(props.tzid)}</Text>
        </MenuItem>
        <If when={hasRoom()}>
          <MenuItem onSelect={() => (pickNext = "add")}>
            <PlusIcon class="size-4" />
            <Text class="text-sm">Add time zone</Text>
          </MenuItem>
        </If>
        <MenuSeparator />
        <MenuItem
          onSelect={() =>
            void setExtraTimeZones(storedTimeZones().filter((other) => other !== props.tzid))
          }
        >
          <CloseIcon class="size-4" color={token("destructive")} />
          <Text class="text-sm text-destructive">Remove time zone from list</Text>
        </MenuItem>
      </Menu>
      {/* The list's anchor: the menu's trigger is the menu's. */}
      <View class="absolute left-0 right-0 bottom-0 h-0" style={{ pointerEvents: "none" }}>
        <TimeZonePicker
          value={picking() === "change" ? props.tzid : undefined}
          at={now}
          open={picking() !== null}
          onOpenChange={(open) => !open && picking.set(null)}
          exclude={
            picking() === "add"
              ? [...takenBesides(props.tzid), props.tzid]
              : takenBesides(props.tzid)
          }
          onSelect={pick}
          popupClass={PICKER_POPUP}
          trigger={<View class="h-0 w-full" />}
        />
      </View>
    </View>
  )
}

/** A zone's name in the gutter: the viewer's is plain, the others open their menu. */
export function ZoneName(props: { tzid: string; name: string; local: boolean }) {
  return (
    <If
      when={props.local}
      else={
        <TimeZoneMenu tzid={props.tzid}>
          <View class="rounded-(--radius-sm) px-1 py-1 hover:bg-accent aria-expanded:bg-accent">
            <Text class="font-mono text-2xs leading-none text-muted-foreground">{props.name}</Text>
          </View>
        </TimeZoneMenu>
      }
    >
      <View class="px-1">
        <Text class="font-mono text-2xs leading-none text-muted-foreground">{props.name}</Text>
      </View>
    </If>
  )
}
