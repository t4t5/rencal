import { Temporal } from "@js-temporal/polyfill"
import { useState } from "react"
import { toast } from "sonner"

import { TimeZoneSelect } from "@/components/event-parts/inputs/TimeZoneSelect"
import { Button } from "@/components/ui/button"
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MoreButton } from "@/components/ui/more-button"
import {
  Select,
  SelectButton,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { api, getErrorMessage, type AvailabilityDraft, type AvailabilitySource } from "@/lib/api"

import { CheckIcon } from "@/icons/check"
import { PlusIcon } from "@/icons/plus"

import { type AvailabilityEditor, useAvailability } from "./AvailabilityContext"
// import { BookingWindow } from "./BookingWindow"
import { formatMinutes } from "./BookingWindow"
import { CopyFreeTimesPopover } from "./CopyFreeTimesPopover"
import { WeeklyHoursEditor } from "./WeeklyHoursEditor"
import { hoursReducer, invalidRange } from "./hours-reducer"

const DURATIONS = [15, 30, 45, 60, 90]

/** What the grid and Copy evaluate: the saved file while clean, the draft once edited. */
export function scheduleSource(editor: AvailabilityEditor, dirty: boolean): AvailabilitySource {
  return editor.id !== null && !dirty
    ? { kind: "saved", id: editor.id }
    : { kind: "draft", id: editor.id, draft: editor.draft }
}

export function SchedulesPanel() {
  const { summaries, editor, startNew } = useAvailability()

  if (summaries === null && editor === null) return null

  if (editor === null) {
    return (
      <div className="flex flex-col items-start gap-3 p-4 text-sm">
        <p className="text-muted-foreground">
          An availability says when you can be booked. Share it as text, or check what someone
          booking would see.
        </p>
        <Button className="gap-2" onClick={() => void startNew()}>
          <PlusIcon className="size-4" />
          New
        </Button>
      </div>
    )
  }

  return <ScheduleEditor editor={editor} />
}

function ScheduleEditor({ editor }: { editor: AvailabilityEditor }) {
  const { dirty, updateDraft, save, discard } = useAvailability()
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirs, setDirs] = useState<string[] | null>(null)
  const { draft, details } = editor
  const hoursEditable = details?.hours_editable ?? true
  const invalid = hoursEditable && invalidRange(draft.hours) !== null

  const patch = (next: Partial<AvailabilityDraft>) => updateDraft((d) => ({ ...d, ...next }))

  const runSave = async (dir: string | null) => {
    setSaving(true)
    setError(null)
    try {
      await save(dir)
      toast.success("Saved availability")
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't save availability"))
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async () => {
    if (editor.id === null) {
      const available = await api.availability.listDirs()
      if (available.length > 1) {
        setDirs(available)
        return
      }
    }
    await runSave(null)
  }

  return (
    <div className="flex flex-col min-h-0 grow">
      <PickerRow editor={editor} />

      <div className="flex flex-col gap-5 overflow-y-auto p-4 grow min-h-0">
        {editor.conflict && <ConflictBanner />}

        <input
          aria-label="Name"
          placeholder="Untitled availability"
          className="bg-transparent text-xl font-medium outline-none placeholder:text-placeholder-foreground"
          value={draft.name}
          onChange={(e) => patch({ name: e.target.value })}
        />

        <DurationField
          value={draft.duration_minutes}
          onChange={(duration_minutes) => patch({ duration_minutes })}
        />

        <section className="flex flex-col gap-2">
          <span className="text-sm font-medium">Weekly hours</span>
          {hoursEditable ? (
            <WeeklyHoursEditor
              hours={draft.hours}
              dispatch={(action) =>
                updateDraft((d) => ({ ...d, hours: hoursReducer(d.hours, action) }))
              }
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              This file's hours aren't plain weekly hours, so they can't be edited here. They're
              kept as they are when you save.
            </p>
          )}
        </section>

        {hoursEditable && (
          <section className="flex flex-col gap-1">
            <span className="text-sm font-medium">Timezone</span>
            <TimeZoneSelect
              value={{ kind: "datetime_zoned", value: Temporal.Now.zonedDateTimeISO(draft.tzid) }}
              onChange={(tzid) => patch({ tzid })}
            />
          </section>
        )}

        {/* Hidden until "Copy link"; its values still bound the copied text. */}
        {/* <BookingWindow draft={draft} onChange={patch} /> */}

        {details && details.override_count > 0 && (
          <p className="text-sm text-muted-foreground">
            {details.override_count === 1
              ? "1 date override from the file is applied but can't be edited here yet."
              : `${details.override_count} date overrides from the file are applied but can't be edited here yet.`}
          </p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <div data-slot="availability-panel-footer" className="flex gap-2 p-4 border-t border-border">
        <CopyFreeTimesPopover
          source={invalid ? null : scheduleSource(editor, dirty)}
          defaultTzid={draft.tzid}
        >
          <Button variant="secondary">Copy free times</Button>
        </CopyFreeTimesPopover>
        <div className="grow" />
        {dirty && (
          <>
            <Button variant="ghost" onClick={discard} disabled={saving}>
              Discard
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving || invalid}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        )}
      </div>

      {dirs && (
        <DirectoryDialog
          dirs={dirs}
          onClose={() => setDirs(null)}
          onPick={(dir) => {
            setDirs(null)
            void runSave(dir)
          }}
        />
      )}
    </div>
  )
}

function PickerRow({ editor }: { editor: AvailabilityEditor }) {
  const { summaries, select, startNew, remove } = useAvailability()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const current = summaries?.find((s) => s.id === editor.id)
  const label = editor.id === null ? "New availability" : (current?.name ?? editor.draft.name)

  return (
    <div className="flex items-center gap-2 px-4 pt-1">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <SelectButton tabIndex={-1} className="min-w-0 grow justify-between">
            <span className="truncate">{label || "Untitled availability"}</span>
          </SelectButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {summaries?.map((summary) => (
            <DropdownMenuItem
              key={summary.id}
              className="gap-3"
              onSelect={() => void select(summary.id)}
            >
              <span className="flex size-4 items-center justify-center">
                {summary.id === editor.id && <CheckIcon className="size-4" />}
              </span>
              <span className="truncate grow">{summary.name}</span>
              <span className="text-xs text-muted-foreground">
                {formatMinutes(summary.duration_minutes)}
              </span>
            </DropdownMenuItem>
          ))}
          {!!summaries?.length && <DropdownMenuSeparator />}
          <DropdownMenuItem className="gap-3" onSelect={() => void startNew()}>
            <PlusIcon className="size-4" />
            New availability
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {editor.id !== null && (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <MoreButton />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
              Delete availability
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {confirmDelete && (
        <DeleteDialog
          name={label}
          onClose={() => setConfirmDelete(false)}
          onDelete={async () => {
            await remove()
            toast.success("Deleted availability")
          }}
        />
      )}
    </div>
  )
}

function DurationField({
  value,
  onChange,
}: {
  value: number
  onChange: (minutes: number) => void
}) {
  const preset = DURATIONS.includes(value)
  const [custom, setCustom] = useState(!preset)

  return (
    <section className="flex items-center justify-between gap-3">
      <Label className="text-sm font-medium">Duration</Label>
      <div className="flex items-center gap-2">
        {(custom || !preset) && (
          <Input
            aria-label="Duration in minutes"
            type="number"
            min={1}
            className="w-20"
            value={value}
            onChange={(e) => onChange(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
          />
        )}
        <Select
          value={custom || !preset ? "custom" : String(value)}
          onValueChange={(next) => {
            if (next === "custom") {
              setCustom(true)
              return
            }
            setCustom(false)
            onChange(Number(next))
          }}
        >
          <SelectTrigger variant="default" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DURATIONS.map((minutes) => (
              <SelectItem key={minutes} value={String(minutes)}>
                {formatMinutes(minutes)}
              </SelectItem>
            ))}
            <SelectItem value="custom">Custom (min)</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </section>
  )
}

function ConflictBanner() {
  const { reloadFromDisk, keepMine } = useAvailability()
  return (
    <div
      data-slot="availability-conflict"
      className="flex flex-col gap-2 rounded-md border border-warning p-3 text-sm"
    >
      <span>Changed on disk while you were editing.</span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={reloadFromDisk}>
          Reload
        </Button>
        <Button variant="ghost" size="sm" onClick={keepMine}>
          Keep mine
        </Button>
      </div>
    </div>
  )
}

function DeleteDialog({
  name,
  onClose,
  onDelete,
}: {
  name: string
  onClose: () => void
  onDelete: () => Promise<void>
}) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async () => {
    setDeleting(true)
    setError(null)
    try {
      await onDelete()
      onClose()
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't delete availability"))
      setDeleting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !deleting && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete availability</DialogTitle>
          <DialogDescription>
            Delete "{name || "Untitled availability"}"? The file is removed from this computer.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="flex gap-2">
          <Button variant="secondary" onClick={onClose} disabled={deleting} autoFocus>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => void handleDelete()} disabled={deleting}>
            {deleting ? "Deleting..." : "Delete availability"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DirectoryDialog({
  dirs,
  onClose,
  onPick,
}: {
  dirs: string[]
  onClose: () => void
  onPick: (dir: string) => void
}) {
  const [dir, setDir] = useState(dirs[0])

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save to which directory?</DialogTitle>
          <DialogDescription>You have several availability directories.</DialogDescription>
        </DialogHeader>
        <Select value={dir} onValueChange={setDir}>
          <SelectTrigger variant="default" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {dirs.map((slug) => (
              <SelectItem key={slug} value={slug}>
                {slug}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onPick(dir)}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
