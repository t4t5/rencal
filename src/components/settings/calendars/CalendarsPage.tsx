import { useEffect, useMemo, useState } from "react"

import { Tabs, TabsContent } from "@/components/ui/tabs"

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
    <Tabs
      orientation="vertical"
      value={selectedGroup}
      onValueChange={setSelectedGroup}
      className="min-h-0 min-w-0 flex-1"
    >
      <GroupsColumn groups={groupNames} selectedGroup={selectedGroup} onSelect={setSelectedGroup} />
      <TabsContent value={selectedGroup} className="min-h-0 min-w-0 data-[state=active]:flex">
        <CalendarsColumn selectedGroup={selectedGroup} />
      </TabsContent>
    </Tabs>
  )
}
