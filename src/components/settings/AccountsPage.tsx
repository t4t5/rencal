import { Google, Microsoft, Apple } from "@lobehub/icons"
import { useState } from "react"
import { IconType } from "react-icons/lib"
import { PiPlus as PlusIcon, PiCalendarBlank as CalendarIcon } from "react-icons/pi"

import { Button } from "@/components/ui/button"

import { useCalendars } from "@/contexts/CalendarStateContext"

import { AddAccountModal } from "./AddAccountModal"

export const providerToIcon: Record<string, IconType> = {
  google: Google.Color,
  icloud: Apple,
  outlook: Microsoft.Color,
}

export const providerDisplayName: Record<string, string> = {
  google: "Google",
  icloud: "iCloud",
  outlook: "Outlook",
  caldav: "CalDAV",
}

export function AccountsPage() {
  const { calendars } = useCalendars()
  const [showAddAccount, setShowAddAccount] = useState(false)

  const calendarsWithAccount = calendars.filter((c) => c.account != null)
  const calendarsByAccount = Object.groupBy(calendarsWithAccount, (c) => c.account!)

  const accounts = Object.entries(calendarsByAccount).map(([account, cals]) => {
    const provider = cals?.[0]?.provider ?? null
    return { account, provider }
  })

  return (
    <div className="flex flex-col gap-4">
      {accounts.map(({ account, provider }) => {
        const ProviderIcon = (provider ? providerToIcon[provider] : undefined) ?? CalendarIcon
        const displayName = provider ? (providerDisplayName[provider] ?? provider) : account

        return (
          <div key={account} className="flex items-center gap-4">
            <div className="size-12 rounded-lg bg-secondary flex items-center justify-center shrink-0">
              <ProviderIcon className="size-6" />
            </div>
            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
              <span className="text-sm">{displayName}</span>
              <span className="text-xs text-muted-foreground truncate">{account}</span>
            </div>
            <Button
              variant="secondary"
              disabled
              size="sm"
              onClick={() => {
                // TODO: Wire to backend disconnect RPC when available
              }}
            >
              Disconnect
            </Button>
          </div>
        )
      })}

      <Button className="self-start gap-2" onClick={() => setShowAddAccount(true)}>
        <PlusIcon className="size-4" />
        Connect new account
      </Button>

      {showAddAccount && <AddAccountModal onClose={() => setShowAddAccount(false)} />}
    </div>
  )
}
