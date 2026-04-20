import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import { useCalendars } from "@/contexts/CalendarStateContext"

import { getProviderDisplayName, getProviderIcon } from "@/lib/providers"

import { PlusIcon } from "@/icons/plus"

import { AddAccountModal } from "./AddAccountModal"

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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        {accounts.map(({ account, provider }) => {
          const ProviderIcon = getProviderIcon(provider)
          const displayName = getProviderDisplayName(provider)

          return (
            <div key={account} className="flex items-center gap-3">
              <div className="size-12 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                <ProviderIcon className="size-6" />
              </div>
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <span className="text-sm">{displayName}</span>
                <span className="text-xs text-muted-foreground truncate">{account}</span>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
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
                  </span>
                </TooltipTrigger>
                <TooltipContent>Coming soon</TooltipContent>
              </Tooltip>
            </div>
          )
        })}
      </div>

      <Button className="self-start gap-2" onClick={() => setShowAddAccount(true)}>
        <PlusIcon className="size-4" />
        Connect new account
      </Button>

      {showAddAccount && <AddAccountModal onClose={() => setShowAddAccount(false)} />}
    </div>
  )
}
