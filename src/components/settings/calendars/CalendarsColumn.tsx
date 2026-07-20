import { CSSProperties, ReactNode, useState } from "react"

import { SettingsContent } from "@/components/settings/SettingsContent"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"

import { rpc } from "@/rpc"
import type { Calendar } from "@/rpc/bindings"

import { useCalendars } from "@/contexts/CalendarStateContext"
import { useSettings } from "@/contexts/SettingsContext"

import { getCalendarColor } from "@/lib/calendar-styles"
import { getProviderDisplayName } from "@/lib/providers"

import { MoreHorizIcon } from "@/icons/more-horiz"
import { RssIcon } from "@/icons/rss"

import { AddSubscriptionModal } from "./AddSubscriptionModal"
import { ChangeCalendarColorModal } from "./ChangeCalendarColorModal"
import { RenameCalendarModal } from "./RenameCalendarModal"

const DEFAULT_GROUP = "default"

export function CalendarsColumn({ selectedGroup }: { selectedGroup: string }) {
  const { calendars } = useCalendars()
  const { groups, setGroups } = useSettings()
  const [showAddSubscriptionModal, setShowAddSubscriptionModal] = useState(false)

  const allCalendarSlugs = calendars.map((calendar) => calendar.slug)
  const visibleCalendarSlugs = groups[selectedGroup]
  const selectedCalendarSlugs = visibleCalendarSlugs ?? allCalendarSlugs

  const setCalendarEnabled = async (calendarSlug: string, enabled: boolean) => {
    const nextSelectedSlugs = new Set(selectedCalendarSlugs)

    if (enabled) {
      nextSelectedSlugs.add(calendarSlug)
    } else {
      nextSelectedSlugs.delete(calendarSlug)
    }

    const nextGroups = { ...groups }
    const nextSlugs = Array.from(nextSelectedSlugs)

    if (selectedGroup === DEFAULT_GROUP && nextSlugs.length === allCalendarSlugs.length) {
      delete nextGroups[DEFAULT_GROUP]
    } else {
      nextGroups[selectedGroup] = nextSlugs
    }

    await setGroups(nextGroups)
  }

  const remoteCalendars = calendars.filter((c) => c.provider !== null)
  const localCalendars = calendars.filter((c) => c.provider === null)
  const calendarsByProvider = Object.groupBy(remoteCalendars, (c) => c.provider as string)

  return (
    <SettingsContent className="grow py-7">
      {!!calendars.length && (
        <div className="flex flex-col gap-4">
          {Object.entries(calendarsByProvider).map(([provider, cals]) => (
            <CalendarAccount
              key={provider}
              title={getProviderDisplayName(provider)}
              calendars={cals ?? []}
              selectedCalendarSlugs={selectedCalendarSlugs}
              onCalendarEnabledChange={setCalendarEnabled}
            />
          ))}

          {localCalendars.length > 0 && (
            <CalendarAccount
              title="Local-only"
              calendars={localCalendars}
              selectedCalendarSlugs={selectedCalendarSlugs}
              onCalendarEnabledChange={setCalendarEnabled}
            />
          )}
        </div>
      )}

      {!calendars.length && <div className="text-sm text-muted-foreground">No calendars yet.</div>}

      <Button
        variant="secondary"
        className="self-start gap-2"
        onClick={() => setShowAddSubscriptionModal(true)}
      >
        <RssIcon className="size-4" />
        Add subscription
      </Button>

      {showAddSubscriptionModal && (
        <AddSubscriptionModal onClose={() => setShowAddSubscriptionModal(false)} />
      )}
    </SettingsContent>
  )
}

function CalendarAccount({
  title,
  calendars,
  selectedCalendarSlugs,
  onCalendarEnabledChange,
}: {
  title: string
  calendars: Calendar[]
  selectedCalendarSlugs: string[]
  onCalendarEnabledChange: (calendarSlug: string, enabled: boolean) => Promise<void>
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-muted-foreground">{title}</span>
      <div className="flex flex-col gap-1">
        {calendars.map((calendar) => (
          <CalendarDropdownMenuWrapper key={calendar.slug} calendar={calendar}>
            <TogglableCalendarItem
              calendar={calendar}
              checked={selectedCalendarSlugs.includes(calendar.slug)}
              onCheckedChange={(enabled) => onCalendarEnabledChange(calendar.slug, enabled)}
            />
          </CalendarDropdownMenuWrapper>
        ))}
      </div>
    </div>
  )
}

export function TogglableCalendarItem({
  calendar,
  checked,
  onCheckedChange,
  children,
}: {
  calendar: Calendar
  checked: boolean
  onCheckedChange: (enabled: boolean) => void
  children?: ReactNode
}) {
  const { name, slug } = calendar
  const id = `calendar-${slug}`

  const calendarColor = getCalendarColor(calendar)
  const calendarColorStyle = { "--calendar-color": calendarColor } as CSSProperties

  return (
    <div className="flex items-center justify-between group max-w-full min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={(value) => onCheckedChange(value === true)}
          style={calendarColorStyle}
          className="cursor-pointer data-[state=checked]:border-[var(--calendar-color)] data-[state=checked]:bg-[var(--calendar-color)]"
        />

        <Label htmlFor={id} className="cursor-pointer text-sm text-foreground truncate">
          {name || slug}
        </Label>
      </div>

      {children}
    </div>
  )
}

function CalendarDropdownMenuWrapper({
  calendar,
  children,
}: {
  calendar: Calendar
  children: ReactNode
}) {
  const { reloadCalendars } = useCalendars()
  const { defaultCalendar, setDefaultCalendar } = useSettings()
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [showColorModal, setShowColorModal] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const isDefault = defaultCalendar === calendar.slug

  const renameCalendar = async (name: string) => {
    await rpc.caldir.rename_calendar(calendar.slug, name)
    await reloadCalendars()
  }

  const changeCalendarColor = async (color: string) => {
    await rpc.caldir.set_calendar_color(calendar.slug, color)
    await reloadCalendars()
  }

  return (
    <div className="flex items-center gap-3">
      <div className="grow">{children}</div>

      {isDefault && <span className="text-sm text-muted-foreground">Default</span>}

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <MoreHorizIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={isDefault}
            onClick={() => void setDefaultCalendar(calendar.slug)}
          >
            Set as default
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowRenameModal(true)}>
            Rename calendar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowColorModal(true)}>
            Change calendar color
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setShowDeleteDialog(true)}>
            {calendar.provider === null ? "Delete calendar" : "Disconnect calendar"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {showRenameModal && (
        <RenameCalendarModal
          calendar={calendar}
          onClose={() => setShowRenameModal(false)}
          onSubmit={renameCalendar}
        />
      )}

      {showColorModal && (
        <ChangeCalendarColorModal
          calendar={calendar}
          onClose={() => setShowColorModal(false)}
          onSubmit={changeCalendarColor}
        />
      )}

      {showDeleteDialog && (
        <DeleteCalendarDialog
          calendar={calendar}
          onClose={() => setShowDeleteDialog(false)}
          onDeleted={reloadCalendars}
        />
      )}
    </div>
  )
}

function DeleteCalendarDialog({
  calendar,
  onClose,
  onDeleted,
}: {
  calendar: Calendar
  onClose: () => void
  onDeleted: () => Promise<void>
}) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const calendarName = calendar.name || calendar.slug
  const isLocal = calendar.provider === null

  const deleteCalendar = async () => {
    setIsDeleting(true)
    setError(null)

    try {
      await rpc.caldir.delete_calendar(calendar.slug)
      await onDeleted()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setIsDeleting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && !isDeleting && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isLocal ? "Delete calendar" : "Disconnect calendar"}</DialogTitle>
          <DialogDescription>
            {isLocal
              ? `Are you sure you want to delete "${calendarName}"? All events will be permanently deleted.`
              : `Disconnect "${calendarName}"? This will delete the directory from this computer.`}
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="flex gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isDeleting} autoFocus>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => void deleteCalendar()} disabled={isDeleting}>
            {isDeleting
              ? isLocal
                ? "Deleting..."
                : "Disconnecting..."
              : isLocal
                ? "Delete calendar"
                : "Disconnect calendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
