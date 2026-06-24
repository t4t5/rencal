import { useEffect, useMemo, useState } from "react"

import { useSettings } from "@/contexts/SettingsContext"

import { CalendarsColumn } from "./CalendarsColumn"
import { GroupsColumn } from "./GroupsColumn"

const DEFAULT_GROUP = "default"

export function CalendarsPage() {
  const { groups } = useSettings()
  const groupNames = useMemo(
    () => [
      DEFAULT_GROUP,
      ...Object.keys(groups)
        .filter((name) => name !== DEFAULT_GROUP)
        .sort(),
    ],
    [groups],
  )
  const [selectedGroup, setSelectedGroup] = useState(DEFAULT_GROUP)

  useEffect(() => {
    if (!groupNames.includes(selectedGroup)) {
      setSelectedGroup(DEFAULT_GROUP)
    }
  }, [groupNames, selectedGroup])

  return (
    <div className="flex grow">
      <GroupsColumn groups={groupNames} selectedGroup={selectedGroup} onSelect={setSelectedGroup} />
      <CalendarsColumn selectedGroup={selectedGroup} />
    </div>
  )
}
