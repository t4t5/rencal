import { useState } from "react"

import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { StatusDot } from "@/components/ui/status-dot"

import { EventAttendee } from "@/rpc/bindings"

import { cn } from "@/lib/utils"

import { CloseIcon } from "@/icons/close"
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

  const canEdit = !readOnly && !!onAttendeesChange
  const attendeeList = attendees ?? []
  const organizerAttendee = organizer
    ? attendeeList.find((a) => attendeeKey(a.email) === attendeeKey(organizer.email))
    : null
  const hasAttendees = attendeeList.length > 0

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
  }

  const removeAttendee = (email: string) => {
    onAttendeesChange?.(attendeeList.filter((attendee) => attendeeKey(attendee.email) !== email))
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
        <InputGroup
          className={cn("w-auto", {
            "ml-7": !!attendees?.length,
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
            }}
            onBlur={() => {
              if (inputValue.trim()) addAttendee()
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
                if (inputValue.trim()) {
                  e.preventDefault()
                  addAttendee()
                }
              }
            }}
          />
        </InputGroup>
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
