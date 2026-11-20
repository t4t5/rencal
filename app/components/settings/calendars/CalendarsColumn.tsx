import { signal, Text, token, View } from "nsh"

import { pickIcsFile } from "@/components/ics-import/ics-import"
import { MoreMenu } from "@/components/settings/MoreMenu"
import {
  ErrorText,
  SettingsContent,
  SettingsItem,
  SettingsSection,
} from "@/components/settings/SettingsContent"
import { loadProviders, providers } from "@/components/settings/accounts/providers"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Menu, MenuItem } from "@/components/ui/menu"

import { api, type Calendar, getErrorMessage } from "@/lib/api"
import { eventPaint } from "@/lib/event-paint"
import { findProvider, getProviderDisplayName } from "@/lib/providers"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"

import { CalendarIcon, ChevronDownIcon, PlusIcon, RssIcon } from "@/icons"
import { calendars, reloadCalendars } from "@/stores/calendar"
import { defaultCalendar, groups, setDefaultCalendar, setGroups } from "@/stores/settings"
import { typography } from "@/themes"

import { AddSubscriptionModal } from "./AddSubscriptionModal"
import { ChangeCalendarColorModal } from "./ChangeCalendarColorModal"
import { DEFAULT_GROUP } from "./GroupsColumn"
import { NewCalendarModal } from "./NewCalendarModal"
import { RenameCalendarModal } from "./RenameCalendarModal"

/** The group `selected` after turning a calendar on or off; the default group lists none when it has all. */
export function toggledGroups(
  all: Record<string, string[]>,
  selected: string,
  allSlugs: string[],
  slug: string,
  enabled: boolean,
) {
  const slugs = new Set(all[selected] ?? allSlugs)
  if (enabled) slugs.add(slug)
  else slugs.delete(slug)

  const next = { ...all }
  if (selected === DEFAULT_GROUP && slugs.size === allSlugs.length) delete next[DEFAULT_GROUP]
  else next[selected] = [...slugs]
  return next
}

const importFailed = (error: unknown) =>
  toast.error("Couldn’t open file", {
    description: getErrorMessage(error, "Failed to pick a file"),
  })

type Section = { title: string; calendars: Calendar[] }

function sectionsOf(list: readonly Calendar[]): Section[] {
  const remote = new Map<string, Calendar[]>()
  for (const calendar of list) {
    if (calendar.provider === null) continue
    remote.set(calendar.provider, [...(remote.get(calendar.provider) ?? []), calendar])
  }
  const local = list.filter((calendar) => calendar.provider === null)
  return [
    ...[...remote].map(([provider, cals]) => ({
      title: getProviderDisplayName(provider, findProvider(providers(), provider)),
      calendars: cals,
    })),
    ...(local.length > 0 ? [{ title: "Local-only", calendars: local }] : []),
  ]
}

export function CalendarsColumn(props: { selectedGroup: string }) {
  const showAddSubscription = signal(false)
  const showNewCalendar = signal(false)

  void loadProviders()

  const allSlugs = () => calendars().map((calendar) => calendar.slug)
  const selectedSlugs = () => groups()[props.selectedGroup] ?? allSlugs()

  const setEnabled = (slug: string, enabled: boolean) =>
    setGroups(toggledGroups(groups(), props.selectedGroup, allSlugs(), slug, enabled))

  return (
    <SettingsContent>
      <If
        when={calendars().length > 0}
        else={
          <SettingsSection title="Calendars">
            <SettingsItem class="py-3">
              <Text class={cn(typography.body(), "text-muted-foreground")}>No calendars yet.</Text>
            </SettingsItem>
          </SettingsSection>
        }
      >
        <Each of={sectionsOf(calendars())} key={(section) => section.title}>
          {(section) => (
            <SettingsSection title={section().title}>
              <Each of={section().calendars} key={(calendar) => calendar.slug}>
                {(calendar) => (
                  <CalendarRow
                    calendar={calendar()}
                    checked={selectedSlugs().includes(calendar().slug)}
                    onCheckedChange={(enabled) => void setEnabled(calendar().slug, enabled)}
                  />
                )}
              </Each>
            </SettingsSection>
          )}
        </Each>
      </If>

      <Menu
        align="start"
        trigger={
          <View class="h-(--control-height) shrink-0 flex-row items-center gap-2 self-start rounded-(--radius-md) border border-button-border bg-secondary px-3 hover:bg-secondary-hover">
            <PlusIcon class="size-4" />
            <Text class={cn(typography.button(), "text-secondary-foreground")}>Add calendar</Text>
            <ChevronDownIcon class="size-4" color={token("muted-foreground")} />
          </View>
        }
      >
        <MenuItem onSelect={() => showNewCalendar.set(true)}>
          <PlusIcon class="size-4" />
          <Text class={typography.body()}>New calendar</Text>
        </MenuItem>
        <MenuItem onSelect={() => showAddSubscription.set(true)}>
          <RssIcon class="size-4" />
          <Text class={typography.body()}>Add subscription</Text>
        </MenuItem>
        <MenuItem onSelect={() => void pickIcsFile().catch(importFailed)}>
          <CalendarIcon class="size-4" />
          <Text class={typography.body()}>Import .ics file</Text>
        </MenuItem>
      </Menu>

      <If when={showNewCalendar()}>
        <NewCalendarModal onClose={() => showNewCalendar.set(false)} />
      </If>
      <If when={showAddSubscription()}>
        <AddSubscriptionModal onClose={() => showAddSubscription.set(false)} />
      </If>
    </SettingsContent>
  )
}

function CalendarRow(props: {
  calendar: Calendar
  checked: boolean
  onCheckedChange: (enabled: boolean) => void
}) {
  const showRename = signal(false)
  const showColor = signal(false)
  const showDelete = signal(false)
  const isDefault = () => defaultCalendar() === props.calendar.slug
  const isLocal = () => props.calendar.provider === null

  const rename = async (name: string) => {
    await api.calendars.rename(props.calendar.slug, name)
    await reloadCalendars()
  }

  const changeColor = async (color: string) => {
    await api.calendars.setColor(props.calendar.slug, color)
    await reloadCalendars()
  }

  return (
    <SettingsItem>
      <Checkbox
        class="min-w-0 flex-1"
        checked={props.checked}
        color={eventPaint(props.calendar.color).color}
        onChange={props.onCheckedChange}
      >
        <Text class={cn(typography.body(), "truncate")}>
          {props.calendar.name || props.calendar.slug}
        </Text>
      </Checkbox>

      <If when={isDefault()}>
        <Text class={cn(typography.body(), "text-muted-foreground")}>Default</Text>
      </If>

      <MoreMenu>
        <MenuItem
          label="Set as default"
          disabled={isDefault() || props.calendar.read_only === true}
          onSelect={() => void setDefaultCalendar(props.calendar.slug)}
        />
        <MenuItem label="Rename calendar" onSelect={() => showRename.set(true)} />
        <MenuItem label="Change calendar color" onSelect={() => showColor.set(true)} />
        <MenuItem
          label={isLocal() ? "Delete calendar" : "Disconnect calendar"}
          destructive
          onSelect={() => showDelete.set(true)}
        />
      </MoreMenu>

      <If when={showRename()}>
        <RenameCalendarModal
          calendar={props.calendar}
          onClose={() => showRename.set(false)}
          onSubmit={rename}
        />
      </If>
      <If when={showColor()}>
        <ChangeCalendarColorModal
          calendar={props.calendar}
          onClose={() => showColor.set(false)}
          onSubmit={changeColor}
        />
      </If>
      <If when={showDelete()}>
        <DeleteCalendarDialog calendar={props.calendar} onClose={() => showDelete.set(false)} />
      </If>
    </SettingsItem>
  )
}

function DeleteCalendarDialog(props: { calendar: Calendar; onClose: () => void }) {
  const deleting = signal(false)
  const error = signal<string | null>(null)
  const calendarName = () => props.calendar.name || props.calendar.slug
  const isLocal = () => props.calendar.provider === null

  const remove = async () => {
    deleting.set(true)
    error.set(null)
    try {
      await api.calendars.delete(props.calendar.slug)
      await reloadCalendars()
      props.onClose()
    } catch (e) {
      error.set(getErrorMessage(e, "Failed to delete calendar"))
      deleting.set(false)
    }
  }

  const removeLabel = () => {
    if (deleting()) return isLocal() ? "Deleting..." : "Disconnecting..."
    return isLocal() ? "Delete calendar" : "Disconnect calendar"
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !deleting()) props.onClose()
      }}
    >
      <DialogHeader>
        <DialogTitle>{isLocal() ? "Delete calendar" : "Disconnect calendar"}</DialogTitle>
        <DialogDescription>
          {isLocal()
            ? `Are you sure you want to delete "${calendarName()}"? All events will be permanently deleted.`
            : `Disconnect "${calendarName()}"? This will delete the directory from this computer.`}
        </DialogDescription>
      </DialogHeader>
      <ErrorText message={error()} />
      <DialogFooter>
        <Button
          variant="secondary"
          label="Cancel"
          autoFocus
          onPress={props.onClose}
          disabled={deleting()}
        />
        <Button
          variant="destructive"
          label={removeLabel()}
          onPress={() => void remove()}
          disabled={deleting()}
        />
      </DialogFooter>
    </Dialog>
  )
}
