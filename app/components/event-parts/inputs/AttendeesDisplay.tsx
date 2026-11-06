import { keymap, Overlay, resource, signal, Text, token, untracked, View, type ViewRef } from "nsh"

import { Input } from "@/components/ui/input"
import { Item, ItemContent, ItemMedia } from "@/components/ui/item"
import { POPUP_SURFACE } from "@/components/ui/popover"
import { StatusDot } from "@/components/ui/status-dot"
import { Tooltip } from "@/components/ui/tooltip"

import { api, type Contact } from "@/lib/api"
import type { EventAttendee } from "@/lib/cal-events"
import { isValidContactEmail, suggestContacts } from "@/lib/contact-suggestions"
import { cn } from "@/lib/utils"

import { UserIcon } from "@/icons"

import { RemoveItemButton } from "./RemoveItemButton"

const attendeeKey = (email: string) => email.trim().toLowerCase()

function AttendeeRow(props: { attendee: EventAttendee; label?: string; onRemove?: () => void }) {
  const hasName = () => !!props.attendee.name && props.attendee.name !== props.attendee.email
  return (
    <View tooltip={hasName() ? <Tooltip label={props.attendee.email} /> : undefined}>
      <Item class="group min-h-(--control-height) border border-transparent py-1">
        <ItemMedia>
          <StatusDot status={props.attendee.response_status} />
        </ItemMedia>
        <ItemContent class="flex-row items-center gap-2">
          <Text class="truncate text-sm text-foreground">
            {props.attendee.name ?? props.attendee.email}
          </Text>
          <If when={props.label}>
            <Text class="shrink-0 text-sm text-muted-foreground">{props.label}</Text>
          </If>
        </ItemContent>
        <If when={props.onRemove}>
          <RemoveItemButton onPress={props.onRemove} />
        </If>
      </Item>
    </View>
  )
}

/** The list under the field. The field keeps the keyboard, so arrows are bound here. */
function Suggestions(props: {
  anchor: ViewRef | undefined
  contacts: Contact[]
  highlighted: number
  onHighlight: (index: number) => void
  onPick: (index: number) => void
  onDismiss: () => void
}) {
  const step = (by: number) => {
    const count = untracked(() => props.contacts.length)
    props.onHighlight((untracked(() => props.highlighted) + by + count) % count)
  }
  keymap.bind("down", () => step(1), { when: "always", repeat: true })
  keymap.bind("up", () => step(-1), { when: "always", repeat: true })

  return (
    <Overlay
      anchor={props.anchor}
      placement="bottom"
      align="start"
      offset={4}
      margin={8}
      onCancel={props.onDismiss}
      class={cn(POPUP_SURFACE, "w-[316px] p-1")}
    >
      <Each of={props.contacts} key={(contact) => contact.email}>
        {(contact, index) => (
          <View
            role="button"
            onPress={() => props.onPick(index())}
            class={cn(
              "rounded-(--radius-sm) px-2 py-1.5 hover:bg-accent",
              index() === props.highlighted && "bg-accent",
            )}
          >
            <Text class="truncate text-sm text-foreground">
              {contact().name ?? contact().email}
            </Text>
            <If when={contact().name}>
              <Text class="truncate text-xs text-muted-foreground">{contact().email}</Text>
            </If>
          </View>
        )}
      </Each>
    </Overlay>
  )
}

export function AttendeesDisplay(props: {
  organizer?: EventAttendee | null
  attendees?: EventAttendee[]
  readOnly?: boolean
  onAttendeesChange?: (attendees: EventAttendee[]) => void
}) {
  const inputValue = signal("")
  const hasInvalidEmail = signal(false)
  const highlighted = signal(0)
  const dismissed = signal(false)
  let field: ViewRef | undefined

  const canEdit = () => !props.readOnly && !!props.onAttendeesChange
  const contacts = resource(canEdit, () => api.contacts.list())
  const list = () => props.attendees ?? []
  const organizerKey = () => (props.organizer ? attendeeKey(props.organizer.email) : null)
  const organizerAttendee = () => list().find((a) => attendeeKey(a.email) === organizerKey())
  const others = () => list().filter((a) => attendeeKey(a.email) !== organizerKey())

  const suggestions = () =>
    suggestContacts(contacts() ?? [], inputValue(), [
      ...list().map((attendee) => attendee.email),
      ...(props.organizer?.email ? [props.organizer.email] : []),
    ])
  const showSuggestions = () =>
    canEdit() && !dismissed() && inputValue().trim().length > 0 && suggestions().length > 0

  const clearField = () => {
    inputValue.set("")
    hasInvalidEmail.set(false)
    highlighted.set(0)
    dismissed.set(false)
  }

  const addTyped = (typed: string) => {
    const email = attendeeKey(typed)
    if (!email) {
      hasInvalidEmail.set(false)
      return
    }
    if (!isValidContactEmail(email)) {
      hasInvalidEmail.set(true)
      return
    }
    const exists = list().some((attendee) => attendeeKey(attendee.email) === email)
    if (!exists && organizerKey() !== email) {
      props.onAttendeesChange?.([...list(), { name: null, email, response_status: "needs-action" }])
    }
    clearField()
  }

  const addSuggested = (index: number) => {
    const contact = suggestions()[index]
    if (!contact || !isValidContactEmail(contact.email)) return
    props.onAttendeesChange?.([
      ...list(),
      { name: contact.name, email: contact.email, response_status: "needs-action" },
    ])
    clearField()
  }

  return (
    <If when={list().length > 0 || canEdit()}>
      <View>
        <If when={organizerAttendee()}>
          {(attendee) => <AttendeeRow attendee={attendee()} label="Organiser" />}
        </If>
        <Each of={others()} key={(attendee) => attendee.email}>
          {(attendee) => (
            <AttendeeRow
              attendee={attendee()}
              onRemove={
                canEdit()
                  ? () => {
                      const key = attendeeKey(attendee().email)
                      props.onAttendeesChange?.(
                        list().filter((other) => attendeeKey(other.email) !== key),
                      )
                    }
                  : undefined
              }
            />
          )}
        </Each>
        <If when={canEdit()}>
          <View ref={field} class={cn("flex-row items-center", list().length > 0 && "mt-1")}>
            <View class="absolute left-2">
              <If when={list().length === 0}>
                <UserIcon color={token("muted-foreground")} />
              </If>
            </View>
            <Input
              class="flex-1 pl-8"
              placeholder="Add participant"
              value={inputValue()}
              invalid={hasInvalidEmail()}
              submitBehavior="submit"
              autoCapitalize="none"
              autoCorrect={false}
              onChange={({ value }) => {
                if (value.endsWith(",")) {
                  addTyped(value.slice(0, -1))
                  return
                }
                inputValue.set(value)
                hasInvalidEmail.set(false)
                highlighted.set(0)
                dismissed.set(false)
              }}
              onSubmit={() => {
                if (showSuggestions()) addSuggested(highlighted())
                else addTyped(inputValue())
              }}
              onBlur={() => {
                if (inputValue().trim()) addTyped(inputValue())
              }}
            />
          </View>
          <If when={showSuggestions()}>
            <Suggestions
              anchor={field}
              contacts={suggestions()}
              highlighted={highlighted()}
              onHighlight={(index) => highlighted.set(index)}
              onPick={addSuggested}
              onDismiss={() => dismissed.set(true)}
            />
          </If>
        </If>
      </View>
    </If>
  )
}
