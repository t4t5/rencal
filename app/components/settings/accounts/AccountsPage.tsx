import { effect, signal, Text, token, View } from "nsh"

import { MoreMenu } from "@/components/settings/MoreMenu"
import { ErrorText, SettingsContent } from "@/components/settings/SettingsContent"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { MenuItem } from "@/components/ui/menu"
import { Tooltip } from "@/components/ui/tooltip"

import { api, getErrorMessage, type Calendar, type ProviderInfo } from "@/lib/api"
import { findProvider, getProviderDisplayName } from "@/lib/providers"
import { cn } from "@/lib/utils"

import { CalendarIcon, PlusIcon } from "@/icons"
import { calendars, reloadCalendars } from "@/stores/calendar"
import { displayCase } from "@/themes"

import { AddAccountModal } from "./AddAccountModal"
import { ProviderIcon } from "./ProviderIcon"
import { beginProviderConnection, loadProviders, type ModalStep, providers } from "./providers"

type AccountRow = {
  key: string
  account: string
  provider: string | null
  calendarCount: number
}

export function accountRows(list: readonly Calendar[]): AccountRow[] {
  const rows = new Map<string, AccountRow>()
  for (const calendar of list) {
    if (calendar.account == null) continue
    const key = `${calendar.provider}/${calendar.account}`
    const row = rows.get(key)
    if (row) row.calendarCount += 1
    else {
      rows.set(key, {
        key,
        account: calendar.account,
        provider: calendar.provider,
        calendarCount: 1,
      })
    }
  }
  return [...rows.values()]
}

export function AccountsPage() {
  const showAddAccount = signal(false)
  const reconnectStep = signal<ModalStep | null>(null)
  const reconnectError = signal<string | null>(null)
  const accounts = () => accountRows(calendars())

  void loadProviders()

  function reconnect(provider: string | null) {
    if (provider == null) return
    reconnectError.set(null)
    beginProviderConnection(provider, {
      onClose: () => reconnectStep.set(null),
      onSetStep: reconnectStep.set,
    }).catch((error: unknown) => {
      reconnectError.set(getErrorMessage(error, "Failed to reconnect account"))
      console.error("Failed to start provider reconnection", error)
    })
  }

  return (
    <SettingsContent contentClass="w-[400px]">
      <If
        when={accounts().length > 0}
        else={<Text class="text-sm text-muted-foreground">No accounts connected yet.</Text>}
      >
        <View class="gap-4">
          <Each of={accounts()} key={(row) => row.key}>
            {(row) => (
              <Account
                account={row().account}
                provider={row().provider}
                calendarCount={row().calendarCount}
                info={findProvider(providers(), row().provider)}
                onReconnect={() => reconnect(row().provider)}
              />
            )}
          </Each>
        </View>
      </If>

      <ErrorText message={reconnectError()} />

      <Button class="self-start" onPress={() => showAddAccount.set(true)}>
        <PlusIcon class="size-4" color={token("primary-foreground")} />
        <Text class={cn("font-mono text-sm font-medium text-primary-foreground", displayCase())}>
          Connect new account
        </Text>
      </Button>

      <If when={showAddAccount()}>
        <AddAccountModal onClose={() => showAddAccount.set(false)} />
      </If>
      <If when={reconnectStep()}>
        {(step) => <AddAccountModal initialStep={step()} onClose={() => reconnectStep.set(null)} />}
      </If>
    </SettingsContent>
  )
}

type AccountStatus = "pending" | "connected" | "disconnected"

const STATUS_COLORS: Record<AccountStatus, string> = {
  pending: "bg-muted-foreground animate-pulse",
  connected: "bg-success",
  disconnected: "bg-destructive",
}

const STATUS_LABELS: Record<AccountStatus, string> = {
  pending: "Connecting...",
  connected: "Connected",
  disconnected: "Failed to connect",
}

function Account(props: {
  account: string
  provider: string | null
  calendarCount: number
  info: ProviderInfo | undefined
  onReconnect: () => void
}) {
  const showRemove = signal(false)
  const status = signal<AccountStatus>("pending")

  effect(() => {
    const { provider, account } = props
    if (provider == null) {
      status.set("disconnected")
      return
    }
    let cancelled = false
    status.set("pending")
    api.providers
      .checkConnection(provider, account)
      .then(() => {
        if (!cancelled) status.set("connected")
      })
      .catch((error: unknown) => {
        console.error("Failed to check provider connection", error)
        if (!cancelled) status.set("disconnected")
      })
    return () => {
      cancelled = true
    }
  })

  return (
    <View class="flex-row items-center gap-3">
      <View class="size-11 shrink-0 items-center justify-center rounded-(--radius-lg) bg-secondary">
        <ProviderIcon
          slug={props.provider}
          info={props.info}
          fallback={CalendarIcon}
          class="size-6"
        />
      </View>

      <View class="min-w-0 flex-1 gap-0.5">
        <Text class={cn("font-mono text-sm", displayCase())}>
          {getProviderDisplayName(props.provider, props.info)}
        </Text>
        <View class="flex-row items-center gap-1">
          <View
            class={cn("size-1.5 rounded-full", STATUS_COLORS[status()])}
            accessibilityLabel={STATUS_LABELS[status()]}
            tooltip={<Tooltip label={STATUS_LABELS[status()]} />}
          />
          <Text class="truncate text-xs text-muted-foreground">{props.account}</Text>
        </View>
      </View>

      <MoreMenu>
        <MenuItem label="Reconnect..." onSelect={props.onReconnect} />
        <If when={props.provider != null}>
          <MenuItem label="Remove account..." destructive onSelect={() => showRemove.set(true)} />
        </If>
      </MoreMenu>

      <If when={showRemove() && props.provider}>
        {(provider) => (
          <RemoveAccountDialog
            account={props.account}
            provider={provider() as string}
            calendarCount={props.calendarCount}
            onClose={() => showRemove.set(false)}
          />
        )}
      </If>
    </View>
  )
}

function RemoveAccountDialog(props: {
  account: string
  provider: string
  calendarCount: number
  onClose: () => void
}) {
  const removing = signal(false)
  const error = signal<string | null>(null)
  const calendarsLabel = () =>
    props.calendarCount === 1 ? "its calendar" : `its ${props.calendarCount} calendars`

  const remove = async () => {
    removing.set(true)
    error.set(null)
    try {
      await api.providers.removeAccount(props.provider, props.account)
      await reloadCalendars()
      props.onClose()
    } catch (e) {
      error.set(getErrorMessage(e, "Failed to remove account"))
      removing.set(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !removing()) props.onClose()
      }}
    >
      <DialogHeader>
        <DialogTitle>Remove account</DialogTitle>
        <DialogDescription>
          {`Remove "${props.account}"? This will remove ${calendarsLabel()} from this computer.`}
        </DialogDescription>
      </DialogHeader>
      <ErrorText message={error()} />
      <DialogFooter>
        <Button variant="secondary" label="Cancel" onPress={props.onClose} disabled={removing()} />
        <Button
          variant="destructive"
          label={removing() ? "Removing..." : "Remove account"}
          onPress={() => void remove()}
          disabled={removing()}
        />
      </DialogFooter>
    </Dialog>
  )
}
