import { useMemo, useState } from "react"
import type { KeyboardEvent } from "react"

import { Command, CommandItem, CommandList } from "@/components/ui/command"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { StatusDot } from "@/components/ui/status-dot"

import { EventAttendee } from "@/rpc/bindings"

import { useContacts } from "@/hooks/useContacts"
import { suggestContacts } from "@/lib/contact-suggestions"
import { cn } from "@/lib/utils"

import { UserIcon } from "@/icons/user"

import { RemoveItemButton } from "./RemoveItemButton"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function AttendeesDisplay({
  organizer,
  attendees,
  readOnly,
  onAttendeesChange,
}: {
  organizer?: EventAttendee | null
  attendees?: EventAttendee[]
  readOnly?: boolean
  onAttendeesChange?: (attendees: EventAttendee[]) => void
}) {
  const [inputValue, setInputValue] = useState("")
  const [hasInvalidEmail, setHasInvalidEmail] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false)

  const canEdit = !readOnly && !!onAttendeesChange
  const contacts = useContacts(canEdit)
  const attendeeList = attendees ?? []

  const organizerAttendee = organizer
    ? attendeeList.find((a) => attendeeKey(a.email) === attendeeKey(organizer.email))
    : null

  const hasAttendees = attendeeList.length > 0
  const excludeEmails = useMemo(
    () => [
      ...attendeeList.map((attendee) => attendee.email),
      ...(organizer?.email ? [organizer.email] : []),
    ],
    [attendeeList, organizer?.email],
  )

  const suggestions = useMemo(
    () => suggestContacts(contacts, inputValue, excludeEmails),
    [contacts, excludeEmails, inputValue],
  )

  const showSuggestions =
    canEdit && !suggestionsDismissed && inputValue.trim().length > 0 && suggestions.length > 0

  if (!hasAttendees && !canEdit) return null

  const addAttendee = () => {
    const email = attendeeKey(inputValue)

    if (!email) {
      setHasInvalidEmail(false)
      return
    }

    if (!EMAIL_RE.test(email)) {
      setHasInvalidEmail(true)
      return
    }

    const exists = attendeeList.some((attendee) => attendeeKey(attendee.email) === email)
    const isOrganizer = organizer && attendeeKey(organizer.email) === email

    if (!exists && !isOrganizer) {
      onAttendeesChange?.([...attendeeList, { name: null, email, response_status: "needs-action" }])
    }

    setInputValue("")
    setHasInvalidEmail(false)
    setHighlightedIndex(0)
    setSuggestionsDismissed(false)
  }

  const addSuggestedAttendee = (index: number) => {
    const contact = suggestions[index]

    if (!contact) return

    onAttendeesChange?.([
      ...attendeeList,
      { name: contact.name, email: contact.email, response_status: "needs-action" },
    ])

    setInputValue("")
    setHasInvalidEmail(false)
    setHighlightedIndex(0)
    setSuggestionsDismissed(false)
  }

  const removeAttendee = (email: string) => {
    onAttendeesChange?.(attendeeList.filter((attendee) => attendeeKey(attendee.email) !== email))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && suggestions.length > 0) {
      e.preventDefault()
      setHighlightedIndex((index) => (index + 1) % suggestions.length)
      return
    }

    if (e.key === "ArrowUp" && suggestions.length > 0) {
      e.preventDefault()
      setHighlightedIndex((index) => (index === 0 ? suggestions.length - 1 : index - 1))
      return
    }

    if (e.key === "Escape" && showSuggestions) {
      e.preventDefault()
      setSuggestionsDismissed(true)
      setHighlightedIndex(0)
      return
    }

    if (e.key === "Enter" && showSuggestions) {
      e.preventDefault()
      addSuggestedAttendee(highlightedIndex)
      return
    }

    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      if (inputValue.trim()) {
        e.preventDefault()
        addAttendee()
      }
    }
  }

  return (
    <div className="flex flex-col">
      {organizerAttendee && <AttendeeRow attendee={organizerAttendee} label="Organiser" />}

      {attendeeList
        .filter((a) => attendeeKey(a.email) !== (organizer ? attendeeKey(organizer.email) : null))
        .map((a) => (
          <AttendeeRow
            key={a.email}
            attendee={a}
            onRemove={canEdit ? () => removeAttendee(attendeeKey(a.email)) : undefined}
          />
        ))}

      {canEdit && (
        <Popover open={showSuggestions}>
          <PopoverAnchor asChild>
            <InputGroup
              className={cn("w-auto", {
                "mt-1": !!attendees?.length,
              })}
            >
              {!attendees?.length && (
                <InputGroupAddon>
                  <UserIcon />
                </InputGroupAddon>
              )}

              <InputGroupInput
                value={inputValue}
                placeholder={"Add participant"}
                className="min-w-0 px-2 text-sm"
                aria-invalid={hasInvalidEmail}
                onChange={(e) => {
                  setInputValue(e.target.value)
                  setHasInvalidEmail(false)
                  setHighlightedIndex(0)
                  setSuggestionsDismissed(false)
                }}
                onBlur={() => {
                  if (inputValue.trim()) addAttendee()
                }}
                onKeyDown={onKeyDown}
              />
            </InputGroup>
          </PopoverAnchor>

          <PopoverContent
            className="w-(--radix-popover-trigger-width) p-0"
            align="start"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <Command
              value={suggestions[highlightedIndex]?.email}
              onValueChange={(value) => {
                const index = suggestions.findIndex((contact) => contact.email === value)
                if (index >= 0) setHighlightedIndex(index)
              }}
            >
              <CommandList>
                {suggestions.map((contact, index) => (
                  <CommandItem
                    key={contact.email}
                    value={contact.email}
                    onMouseDown={(e) => e.preventDefault()}
                    onSelect={() => addSuggestedAttendee(index)}
                    className="items-start"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate">{contact.name ?? contact.email}</span>
                      {contact.name && (
                        <span className="truncate text-xs text-muted-foreground">
                          {contact.email}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}

function attendeeKey(email: string) {
  return email.trim().toLowerCase()
}

function AttendeeRow({
  attendee,
  label,
  onRemove,
}: {
  attendee: EventAttendee
  label?: string
  onRemove?: () => void
}) {
  const displayName = attendee.name ?? attendee.email

  return (
    <div className="group flex items-center gap-2 py-1 px-3 text-sm">
      <StatusDot status={attendee.response_status} />

      <div className="grow gap-2 items-center flex">
        <span className="truncate">{displayName}</span>
        {label && <span className="text-muted-foreground shrink-0">{label}</span>}
      </div>

      {onRemove && <RemoveItemButton onClick={onRemove} />}
    </div>
  )
}
