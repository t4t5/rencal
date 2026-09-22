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
import { MoreButton } from "@/components/ui/more-button"
import { TabsList, TabsTrigger } from "@/components/ui/tabs"

import { useCalendars } from "@/contexts/CalendarStateContext"
import { useSettings } from "@/contexts/SettingsContext"

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
    <SettingsContent className="w-[220px] border-r border-border gap-2 py-[15px] grow-0 px-2">
      <div className="flex justify-between items-center w-full">
        <span data-typography="heading" className="text-sm text-muted-foreground pl-1">
          Groups
        </span>

        <Button size="icon" variant="ghost" onClick={() => setModalState({ mode: "create" })}>
          <PlusIcon className="size-4" />
        </Button>
      </div>

      <TabsList variant="navigation" aria-label="Calendar groups" className="w-full">
        {groups.map((group) => {
          const isDefault = group === DEFAULT_GROUP

          return (
            <div key={group} className="group relative w-full">
              <TabsTrigger value={group} className={isDefault ? undefined : "pr-10"}>
                <span className="overflow-hidden text-ellipsis">{formatGroupName(group)}</span>
              </TabsTrigger>
              {!isDefault && (
                <div className="absolute right-0 top-1/2 -translate-y-1/2">
                  <MoreMenu
                    onEdit={() => setModalState({ mode: "edit", group })}
                    onDelete={() => void deleteGroup(group)}
                  />
                </div>
              )}
            </div>
          )
        })}
      </TabsList>

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
        <MoreButton
          className="invisible group-hover:visible"
          onClick={(event) => event.stopPropagation()}
        />
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
