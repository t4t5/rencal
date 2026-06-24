import { FormEvent, useEffect, useMemo, useState } from "react"

import { SettingsContent } from "@/components/settings/SettingsContent"
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"

import { useCalendars } from "@/contexts/CalendarStateContext"
import { useSettings } from "@/contexts/SettingsContext"

import { cn } from "@/lib/utils"

import { MoreHorizIcon } from "@/icons/more-horiz"
import { PlusIcon } from "@/icons/plus"

const DEFAULT_GROUP = "default"

export function GroupsColumn({
  groups,
  selectedGroup,
  onSelect,
}: {
  groups: string[]
  selectedGroup: string
  onSelect: (group: string) => void
}) {
  const { calendars } = useCalendars()
  const { groups: calendarGroups, setGroups } = useSettings()
  const [modalState, setModalState] = useState<
    { mode: "create" } | { mode: "edit"; group: string } | null
  >(null)

  const createGroup = async (name: string) => {
    const calendarSlugs = calendars.map((calendar) => calendar.slug)
    await setGroups({ ...calendarGroups, [name]: calendarSlugs })
    onSelect(name)
  }

  const renameGroup = async (oldName: string, newName: string) => {
    const nextGroups = { ...calendarGroups }
    const groupCalendars = nextGroups[oldName] ?? calendars.map((calendar) => calendar.slug)
    delete nextGroups[oldName]
    nextGroups[newName] = groupCalendars
    await setGroups(nextGroups)
    if (selectedGroup === oldName) onSelect(newName)
  }

  const deleteGroup = async (group: string) => {
    const nextGroups = { ...calendarGroups }
    delete nextGroups[group]
    await setGroups(nextGroups)
    if (selectedGroup === group) onSelect(DEFAULT_GROUP)
  }

  return (
    <SettingsContent className="w-[220px] border-r border-r-divider gap-2 py-6">
      <div className="flex justify-between items-center w-full">
        <span className="text-sm text-muted-foreground">Groups</span>

        <Button size="icon-sm" variant="ghost" onClick={() => setModalState({ mode: "create" })}>
          <PlusIcon className="size-4" />
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {groups.map((group) => {
          const isDefault = group === DEFAULT_GROUP

          return (
            <div
              key={group}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(group)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onSelect(group)
              }}
              className={cn(
                "text-sm flex items-center justify-between gap-2 rounded-md text-muted-foreground px-3 py-2 group text-left cursor-pointer",
                {
                  "bg-secondary text-accent-foreground": selectedGroup === group,
                },
              )}
            >
              <span className="overflow-hidden text-ellipsis">{formatGroupName(group)}</span>
              {!isDefault && (
                <MoreMenu
                  onEdit={() => setModalState({ mode: "edit", group })}
                  onDelete={() => void deleteGroup(group)}
                />
              )}
            </div>
          )
        })}
      </div>

      {modalState && (
        <GroupModal
          groups={groups}
          initialName={modalState.mode === "edit" ? modalState.group : ""}
          title={modalState.mode === "edit" ? "Edit group" : "New group"}
          onClose={() => setModalState(null)}
          onSubmit={(name) =>
            modalState.mode === "edit" ? renameGroup(modalState.group, name) : createGroup(name)
          }
        />
      )}
    </SettingsContent>
  )
}

function GroupModal({
  groups,
  initialName,
  title,
  onClose,
  onSubmit,
}: {
  groups: string[]
  initialName: string
  title: string
  onClose: () => void
  onSubmit: (name: string) => Promise<void>
}) {
  const [name, setName] = useState(initialName)
  const [isSaving, setIsSaving] = useState(false)
  const normalizedInitialName = initialName.trim().toLowerCase()
  const trimmedName = name.trim()
  const normalizedName = trimmedName.toLowerCase()
  const existingNames = useMemo(
    () =>
      groups.map((group) => group.toLowerCase()).filter((group) => group !== normalizedInitialName),
    [groups, normalizedInitialName],
  )
  const error = getGroupNameError(trimmedName, normalizedName, existingNames)

  useEffect(() => {
    setName(initialName)
  }, [initialName])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (error || isSaving) return

    setIsSaving(true)
    try {
      await onSubmit(trimmedName)
      onClose()
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Choose a unique name for this calendar group.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Group name"
              aria-invalid={!!error}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={!!error || isSaving}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function getGroupNameError(name: string, normalizedName: string, existingNames: string[]) {
  if (!name) return "Enter a group name."
  if (normalizedName === DEFAULT_GROUP) return "Default is reserved."
  if (existingNames.includes(normalizedName)) return "A group with this name already exists."
  return null
}

function formatGroupName(group: string) {
  if (group === DEFAULT_GROUP) return "Default"
  return group
}

const MoreMenu = ({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) => {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className="invisible group-hover:visible"
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
