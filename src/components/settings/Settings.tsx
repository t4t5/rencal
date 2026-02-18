import { PiPlus as PlusIcon } from "react-icons/pi"

import { Button } from "@/components/ui/button"

import { useCalendarState } from "@/contexts/CalendarStateContext"

import { useConnectGoogle } from "@/hooks/useConnectGoogle"
import { useFetchGoogleCalendars } from "@/hooks/useFetchGoogleCalendars"

import { AccountSection } from "./AccountSection"

export function Settings() {
  const { calendars } = useCalendarState()

  const { fetchCalendars, isLoading } = useFetchGoogleCalendars()

  const { connect, isConnecting } = useConnectGoogle({
    onConnect: async (account) => {
      await fetchCalendars(account)
    },
  })

  const calendarsByAccount = Object.groupBy(calendars, (c) => c.account ?? c.provider ?? "Local")

  return (
    <div className="flex flex-col">
      {Object.entries(calendarsByAccount).map(([account, calendars]) => (
        <AccountSection key={account} account={account} calendars={calendars ?? []} />
      ))}

      <Button
        variant="ghost"
        className="justify-start text-muted-foreground"
        disabled={isConnecting || isLoading}
        onClick={connect}
      >
        <PlusIcon className="size-4" />
        Add calendar account
      </Button>
    </div>
  )
}
