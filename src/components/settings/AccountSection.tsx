import { FaGoogle as GoogleIcon, FaApple as AppleIcon } from "react-icons/fa"
import { IconType } from "react-icons/lib"

import { useCalendar } from "@/contexts/CalendarContext"

import { Account, EmailProvider } from "@/db/types"

import { CalendarItem } from "./CalendarItem"

const providerToIcon: Record<EmailProvider, IconType> = {
  Google: GoogleIcon,
  Apple: AppleIcon,
}

export function AccountSection({ account }: { account: Account }) {
  const { calendars } = useCalendar()
  const accountCalendars = calendars.filter((c) => c.accountId === account.id)

  const ProviderIcon = providerToIcon[account.provider]

  return (
    <div className="p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <ProviderIcon className="size-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{account.email}</span>
      </div>
      <div className="flex flex-col">
        {accountCalendars.map((calendar) => (
          <CalendarItem key={calendar.id} calendar={calendar} />
        ))}
      </div>
    </div>
  )
}
