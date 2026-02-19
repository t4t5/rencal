import { useState } from "react"
import { PiPlus as PlusIcon } from "react-icons/pi"

import { Button } from "@/components/ui/button"

import { useCalendarState } from "@/contexts/CalendarStateContext"

import { AccountSection } from "./AccountSection"
import { AddAccountModal } from "./AddAccountModal"

export function Settings() {
  const { calendars } = useCalendarState()
  const [showAddAccount, setShowAddAccount] = useState(false)

  const calendarsByAccount = Object.groupBy(calendars, (c) => c.account ?? c.provider ?? "Local")

  return (
    <div className="flex flex-col">
      {Object.entries(calendarsByAccount).map(([account, calendars]) => (
        <AccountSection key={account} account={account} calendars={calendars ?? []} />
      ))}

      <Button
        variant="ghost"
        className="justify-start text-muted-foreground"
        onClick={() => setShowAddAccount(true)}
      >
        <PlusIcon className="size-4" />
        Add calendar account
      </Button>

      {showAddAccount && <AddAccountModal onClose={() => setShowAddAccount(false)} />}
    </div>
  )
}
