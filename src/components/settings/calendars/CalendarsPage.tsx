import { CalendarsColumn } from "./CalendarsColumn"
import { GroupsColumn } from "./GroupsColumn"

export function CalendarsPage() {
  return (
    <div className="flex grow">
      <GroupsColumn />
      <CalendarsColumn />
    </div>
  )
}
