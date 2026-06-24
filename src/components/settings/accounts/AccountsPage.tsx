import { useEffect, useState } from "react"

import { SettingsContent } from "@/components/settings/SettingsContent"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import { rpc } from "@/rpc"

import { useCalendars } from "@/contexts/CalendarStateContext"

import { useConnectProvider } from "@/hooks/useConnectProvider"
import { getProviderDisplayName, getProviderIcon } from "@/lib/providers"
import { cn } from "@/lib/utils"

import { MoreHorizIcon } from "@/icons/more-horiz"
import { PlusIcon } from "@/icons/plus"

import { AddAccountModal, type ModalStep } from "./AddAccountModal"
import { beginProviderConnection } from "./provider-connection"

export function AccountsPage() {
  const { calendars } = useCalendars()
  const { connect } = useConnectProvider()
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [reconnectStep, setReconnectStep] = useState<ModalStep | null>(null)

  const calendarsWithAccount = calendars.filter((c) => c.account != null)
  const calendarsByAccount = Object.groupBy(calendarsWithAccount, (c) => c.account!)

  const accounts = Object.entries(calendarsByAccount).map(([account, cals]) => {
    const provider = cals?.[0]?.provider ?? null
    return { account, provider }
  })

  function reconnect(provider: string | null) {
    if (provider == null) return

    beginProviderConnection({
      provider,
      connect,
      onClose: () => setReconnectStep(null),
      onSetStep: setReconnectStep,
    }).catch((error: unknown) => {
      console.error("Failed to start provider reconnection", error)
    })
  }

  return (
    <SettingsContent className="py-6 w-[400px]">
      {!!accounts.length && (
        <div className="flex flex-col gap-4">
          {accounts.map(({ account, provider }) => (
            <Account
              key={account}
              account={account}
              provider={provider}
              onReconnect={() => reconnect(provider)}
            />
          ))}
        </div>
      )}

      {!accounts.length && (
        <div className="text-sm text-muted-foreground">No accounts connected yet.</div>
      )}

      <Button className="self-start gap-2" onClick={() => setShowAddAccount(true)}>
        <PlusIcon className="size-4" />
        Connect new account
      </Button>

      {showAddAccount && <AddAccountModal onClose={() => setShowAddAccount(false)} />}

      {reconnectStep != null && (
        <AddAccountModal onClose={() => setReconnectStep(null)} initialStep={reconnectStep} />
      )}
    </SettingsContent>
  )
}

type AccountStatus = "pending" | "connected" | "disconnected"

const statusColors: Record<AccountStatus, string> = {
  pending: "bg-muted-foreground",
  connected: "bg-success",
  disconnected: "bg-destructive",
}

const statusLabels: Record<AccountStatus, string> = {
  pending: "Connecting...",
  connected: "Connected",
  disconnected: "Failed to connect",
}

function Account({
  account,
  provider,
  onReconnect,
}: {
  account: string
  provider: string | null
  onReconnect: () => void
}) {
  const [status, setStatus] = useState<AccountStatus>(provider == null ? "disconnected" : "pending")

  useEffect(() => {
    if (provider == null) {
      setStatus("disconnected")
      return
    }

    let cancelled = false

    setStatus("pending")

    rpc.caldir
      .check_provider_connection(provider, account)
      .then(() => {
        if (!cancelled) setStatus("connected")
      })
      .catch((error: unknown) => {
        console.error("Failed to check provider connection", error)
        if (!cancelled) setStatus("disconnected")
      })

    return () => {
      cancelled = true
    }
  }, [account, provider])

  const ProviderIcon = getProviderIcon(provider)
  const displayName = getProviderDisplayName(provider)

  const statusLabel = statusLabels[status]
  const statusColor = statusColors[status]

  return (
    <div className="flex items-center gap-3">
      <div className="size-11 rounded-lg bg-secondary flex items-center justify-center shrink-0">
        <ProviderIcon className="size-6" />
      </div>

      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span className="heading text-sm">{displayName}</span>

        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild tabIndex={-1}>
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  statusColor,
                  status === "pending" && "animate-pulse",
                )}
                aria-label={statusLabel}
              />
            </TooltipTrigger>
            <TooltipContent>{statusLabel}</TooltipContent>
          </Tooltip>

          <span className="text-xs text-muted-foreground truncate">{account}</span>
        </div>
      </div>

      <MoreMenu onReconnect={onReconnect} />
    </div>
  )
}

const MoreMenu = ({ onReconnect }: { onReconnect: () => void }) => {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <MoreHorizIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onReconnect}>Reconnect...</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
