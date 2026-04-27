import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import { useCalendars } from "@/contexts/CalendarStateContext"
import { useSync } from "@/contexts/SyncContext"

export function MassDeleteConfirmDialog() {
  const { pendingMassDelete, confirmMassDelete, discardMassDelete, cancelMassDelete } = useSync()
  const { calendars } = useCalendars()

  const open = pendingMassDelete !== null
  const items = pendingMassDelete ?? []
  const totalDeletes = items.reduce((acc, p) => acc + p.to_push_delete_count, 0)

  const calendarLabel = (slug: string) => calendars.find((c) => c.slug === slug)?.name ?? slug

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && cancelMassDelete()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm large deletion</DialogTitle>
          <DialogDescription>
            Syncing would delete {totalDeletes} event{totalDeletes === 1 ? "" : "s"} from{" "}
            {items.length} calendar{items.length === 1 ? "" : "s"}. Continue?
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1 text-sm">
          {items.map((p) => (
            <li
              key={p.calendar_slug}
              className="flex justify-between gap-4 border border-divider p-2 rounded"
            >
              <span className="truncate">{calendarLabel(p.calendar_slug)}</span>
              <span className="text-muted-foreground tabular-nums">{p.to_push_delete_count}</span>
            </li>
          ))}
        </ul>
        <DialogFooter className="flex gap-2">
          <Button variant="secondary" onClick={cancelMassDelete} autoFocus>
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => void discardMassDelete()}>
            Restore events
          </Button>
          <Button variant="destructive" onClick={() => void confirmMassDelete()}>
            Delete {totalDeletes} event{totalDeletes === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
