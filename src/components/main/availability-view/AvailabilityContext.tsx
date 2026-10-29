import { Temporal } from "@js-temporal/polyfill"
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import { setCalendarViewLeaveGuard } from "@/hooks/useCalendarView"
import {
  api,
  type AvailabilityDetails,
  type AvailabilityDraft,
  type AvailabilitySummary,
  type InstantSpan,
} from "@/lib/api"
import { getViewerTzid } from "@/lib/event-time"
import { createStrictContext } from "@/lib/strict-context"

import { normalizeHours, WEEKDAYS } from "./hours-reducer"

export type AvailabilityMode = "schedules" | "share"

export type AvailabilityEditor = {
  /** Null for a new draft that hasn't been saved. */
  id: string | null
  details: AvailabilityDetails | null
  /** What's on disk; null until a new draft is saved. */
  saved: AvailabilityDraft | null
  draft: AvailabilityDraft
  /** The file changed on disk while the draft was dirty. */
  conflict: AvailabilityDraft | null
}

type AvailabilityContextValue = {
  mode: AvailabilityMode
  setMode: (mode: AvailabilityMode) => void
  /** Null while loading. */
  summaries: AvailabilitySummary[] | null
  editor: AvailabilityEditor | null
  dirty: boolean
  select: (id: string) => Promise<void>
  startNew: () => Promise<void>
  updateDraft: (update: (draft: AvailabilityDraft) => AvailabilityDraft) => void
  /** Writes the draft; `dir` picks the directory for a new one. */
  save: (dir?: string | null) => Promise<void>
  discard: () => void
  remove: () => Promise<void>
  reloadFromDisk: () => void
  keepMine: () => void
  /** Resolves true when there's nothing to lose or the user chose to discard. */
  confirmDiscard: () => Promise<boolean>
  selections: readonly InstantSpan[]
  addSelection: (span: InstantSpan) => void
  removeSelection: (span: InstantSpan) => void
  clearSelections: () => void
}

const [Provider, useAvailability] =
  createStrictContext<AvailabilityContextValue>("AvailabilityContext")

export { useAvailability }

const LAST_ID_KEY = "rencal-availability-last"

function readLastId(): string | null {
  try {
    return localStorage.getItem(LAST_ID_KEY)
  } catch {
    return null
  }
}

function writeLastId(id: string) {
  try {
    localStorage.setItem(LAST_ID_KEY, id)
  } catch {
    // Convenience only.
  }
}

/** Mon–Fri 09:00–17:00, 30 minutes, in the viewer's zone. */
export function newDraft(): AvailabilityDraft {
  return {
    name: "",
    tzid: getViewerTzid(),
    hours: WEEKDAYS.map((day) => ({
      day,
      ranges: day === "sa" || day === "su" ? [] : [{ start: "09:00", end: "17:00" }],
    })),
    duration_minutes: 30,
    buffer_before_minutes: 0,
    buffer_after_minutes: 0,
    notice_minutes: 0,
    horizon_days: 14,
  }
}

function withAllDays(draft: AvailabilityDraft, hoursEditable: boolean): AvailabilityDraft {
  return hoursEditable ? { ...draft, hours: normalizeHours(draft.hours) } : draft
}

export function sameDraft(a: AvailabilityDraft, b: AvailabilityDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

// Share selections live for the session, across leaving and re-entering the view.
let selections: InstantSpan[] = []
const selectionListeners = new Set<() => void>()

function setSelections(next: InstantSpan[]) {
  selections = next
  selectionListeners.forEach((listener) => listener())
}

function subscribeSelections(listener: () => void) {
  selectionListeners.add(listener)
  return () => selectionListeners.delete(listener)
}

/** Add `span`, coalescing it with any selection it overlaps or touches. */
function addSpan(spans: readonly InstantSpan[], span: InstantSpan): InstantSpan[] {
  let { start, end } = span
  const kept: InstantSpan[] = []
  for (const other of spans) {
    const overlaps =
      Temporal.Instant.compare(other.start, end) <= 0 &&
      Temporal.Instant.compare(other.end, start) >= 0
    if (overlaps) {
      if (Temporal.Instant.compare(other.start, start) < 0) start = other.start
      if (Temporal.Instant.compare(other.end, end) > 0) end = other.end
    } else {
      kept.push(other)
    }
  }
  return [...kept, { start, end }].toSorted((a, b) => Temporal.Instant.compare(a.start, b.start))
}

export function AvailabilityProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AvailabilityMode>("schedules")
  const [summaries, setSummaries] = useState<AvailabilitySummary[] | null>(null)
  const [editor, setEditor] = useState<AvailabilityEditor | null>(null)
  const [pendingConfirm, setPendingConfirm] = useState<((ok: boolean) => void) | null>(null)
  const shared = useSyncExternalStore(subscribeSelections, () => selections)

  const editorRef = useRef(editor)
  editorRef.current = editor

  const dirty = editor !== null && (editor.saved === null || !sameDraft(editor.draft, editor.saved))
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty

  const confirmDiscard = useCallback((): Promise<boolean> => {
    if (!dirtyRef.current) return Promise.resolve(true)
    return new Promise((resolve) => setPendingConfirm(() => resolve))
  }, [])

  const load = useCallback(async (id: string): Promise<AvailabilityEditor> => {
    const details = await api.availability.get(id)
    const saved = withAllDays(details.draft, details.hours_editable)
    return { id, details, saved, draft: saved, conflict: null }
  }, [])

  const select = useCallback(
    async (id: string) => {
      if (editorRef.current?.id === id) return
      if (!(await confirmDiscard())) return
      setEditor(await load(id))
      writeLastId(id)
    },
    [confirmDiscard, load],
  )

  const startNew = useCallback(async () => {
    if (!(await confirmDiscard())) return
    setEditor({ id: null, details: null, saved: null, draft: newDraft(), conflict: null })
  }, [confirmDiscard])

  // Refetch the list and the open file; a clean draft follows the disk, a dirty one is flagged.
  const refresh = useCallback(async () => {
    const list = await api.availability.list()
    setSummaries(list)

    const current = editorRef.current
    if (current === null) {
      const remembered = readLastId()
      const first = list.find((s) => s.id === remembered) ?? list[0]
      if (first) setEditor(await load(first.id))
      return
    }
    if (current.id === null) return
    if (!list.some((s) => s.id === current.id)) {
      // Deleted elsewhere. A dirty draft can still be saved as a new file.
      if (dirtyRef.current) {
        setEditor({ ...current, id: null, details: null, saved: null })
        return
      }
      setEditor(list[0] ? await load(list[0].id) : null)
      return
    }

    const fresh = await load(current.id)
    setEditor((latest) => {
      if (!latest || latest.id !== current.id) return latest
      const latestDirty = latest.saved === null || !sameDraft(latest.draft, latest.saved)
      if (!latestDirty) return fresh
      if (latest.saved && sameDraft(fresh.draft, latest.saved)) {
        return { ...latest, details: fresh.details }
      }
      return { ...latest, conflict: fresh.draft, details: fresh.details }
    })
  }, [load])

  useEffect(() => {
    void refresh()
    const subscription = api.notifications.listen("availabilities-changed", () => void refresh())
    return () => subscription.unlisten()
  }, [refresh])

  // Hold the user back from leaving the view with unsaved edits.
  useEffect(() => {
    if (!dirty) return
    return setCalendarViewLeaveGuard(confirmDiscard)
  }, [dirty, confirmDiscard])

  const updateDraft = useCallback(
    (update: (draft: AvailabilityDraft) => AvailabilityDraft) =>
      setEditor((current) => current && { ...current, draft: update(current.draft) }),
    [],
  )

  const save = useCallback(
    async (dir: string | null = null) => {
      const current = editorRef.current
      if (!current) return
      const id =
        current.id === null
          ? await api.availability.create(current.draft, dir)
          : (await api.availability.update(current.id, current.draft), current.id)
      writeLastId(id)
      // Our own write echoes back through the watcher; reload now so it compares equal.
      const fresh = await load(id)
      setEditor(fresh)
      setSummaries(await api.availability.list())
    },
    [load],
  )

  const discard = useCallback(() => {
    setEditor((current) => {
      if (!current) return current
      if (current.saved) return { ...current, draft: current.saved, conflict: null }
      return null
    })
    // Discarding a new draft falls back to the first saved one.
    if (editorRef.current?.saved === null) void refresh()
  }, [refresh])

  const remove = useCallback(async () => {
    const current = editorRef.current
    if (!current?.id) return
    await api.availability.delete(current.id)
    setEditor(null)
    await refresh()
  }, [refresh])

  const reloadFromDisk = useCallback(
    () =>
      setEditor((current) =>
        current?.conflict
          ? { ...current, saved: current.conflict, draft: current.conflict, conflict: null }
          : current,
      ),
    [],
  )

  const keepMine = useCallback(
    () =>
      setEditor((current) =>
        current?.conflict ? { ...current, saved: current.conflict, conflict: null } : current,
      ),
    [],
  )

  const value = useMemo<AvailabilityContextValue>(
    () => ({
      mode,
      setMode,
      summaries,
      editor,
      dirty,
      select,
      startNew,
      updateDraft,
      save,
      discard,
      remove,
      reloadFromDisk,
      keepMine,
      confirmDiscard,
      selections: shared,
      addSelection: (span) => setSelections(addSpan(selections, span)),
      removeSelection: (span) => setSelections(selections.filter((s) => s !== span)),
      clearSelections: () => setSelections([]),
    }),
    [
      mode,
      summaries,
      editor,
      dirty,
      select,
      startNew,
      updateDraft,
      save,
      discard,
      remove,
      reloadFromDisk,
      keepMine,
      confirmDiscard,
      shared,
    ],
  )

  // On discard the caller replaces the editor, or leaves the view and unmounts it.
  const resolveConfirm = (ok: boolean) => {
    pendingConfirm?.(ok)
    setPendingConfirm(null)
  }

  return (
    <Provider value={value}>
      {children}
      <Dialog
        open={pendingConfirm !== null}
        onOpenChange={(open) => !open && resolveConfirm(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard changes?</DialogTitle>
            <DialogDescription>
              {editor?.draft.name.trim()
                ? `Your edits to "${editor.draft.name.trim()}" haven't been saved.`
                : "This availability hasn't been saved."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button variant="secondary" onClick={() => resolveConfirm(false)} autoFocus>
              Keep editing
            </Button>
            <Button variant="destructive" onClick={() => resolveConfirm(true)}>
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Provider>
  )
}
