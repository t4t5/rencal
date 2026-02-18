import { PiPlus as PlusIcon } from "react-icons/pi"

import { Button } from "@/components/ui/button"

import { useCalendarState } from "@/contexts/CalendarStateContext"

import { useConnectProvider } from "@/hooks/useConnectProvider"

import { AccountSection } from "./AccountSection"

export function Settings() {
  const { calendars } = useCalendarState()

  const { connect, isConnecting } = useConnectProvider()

  const calendarsByAccount = Object.groupBy(calendars, (c) => c.account ?? c.provider ?? "Local")

  return (
    <div className="flex flex-col">
      {Object.entries(calendarsByAccount).map(([account, calendars]) => (
        <AccountSection key={account} account={account} calendars={calendars ?? []} />
      ))}

      <Button
        variant="ghost"
        className="justify-start text-muted-foreground"
        disabled={isConnecting}
        onClick={() => connect("google")}
      >
        <PlusIcon className="size-4" />
        Add calendar account
      </Button>
    </div>
  )
}
