import { FaGoogle as GoogleIcon, FaApple as AppleIcon } from "react-icons/fa"
import { PiEyeClosed as EyeClosedIcon, PiRss as RssIcon, PiPlus as PlusIcon } from "react-icons/pi"

import { Button } from "@/components/ui/button"

import { cn } from "@/lib/utils"

type Provider = "google" | "icloud"

interface Calendar {
  name: string
  color: string
  visible: boolean
  isSubscription?: boolean
}

interface Account {
  email: string
  provider: Provider
  calendars: Calendar[]
}

const mockAccounts: Account[] = [
  {
    email: "tristan@taprootwizards.com",
    provider: "google",
    calendars: [
      { name: "tristan@taprootwizards.com", color: "#4285F4", visible: true },
      { name: "Team Calendar", color: "#34A853", visible: true },
      { name: "Holidays in United Kingdom", color: "#FF9500", visible: true, isSubscription: true },
    ],
  },
  {
    email: "tristan.edwards@me.com",
    provider: "icloud",
    calendars: [
      { name: "Eventbrite", color: "#FF6D00", visible: true },
      { name: "Hem", color: "#5C6BC0", visible: true },
      { name: "Layer3", color: "#C6A300", visible: false },
      { name: "Ludu", color: "#66BB6A", visible: false },
      { name: "Other work", color: "#9E9E9E", visible: false },
      { name: "Safello", color: "#4CAF50", visible: false },
      { name: "TT", color: "#F44336", visible: false },
      { name: "Birthdays", color: "#2196F3", visible: false, isSubscription: true },
    ],
  },
]

function ProviderIcon({ provider }: { provider: Provider }) {
  if (provider === "google") {
    return <GoogleIcon className="size-4 text-muted-foreground" />
  }
  return <AppleIcon className="size-4 text-muted-foreground" />
}

function CalendarItem({ calendar }: { calendar: Calendar }) {
  const { name, color, visible, isSubscription } = calendar

  return (
    <div
      className={cn("flex items-center justify-between py-1.5 group", {
        "opacity-40": !visible,
      })}
    >
      <div className="flex items-center gap-3">
        {isSubscription ? (
          <RssIcon className="size-3 shrink-0" style={{ color }} />
        ) : (
          <div className="size-3 rounded-[3px] shrink-0" style={{ backgroundColor: color }} />
        )}
        <span className="text-sm">{name}</span>
      </div>
      {!visible && <EyeClosedIcon className="size-5 text-muted-foreground" />}
    </div>
  )
}

function AccountSection({ account }: { account: Account }) {
  return (
    <div className="p-3">
      <div className="flex items-center gap-2 mb-2">
        <ProviderIcon provider={account.provider} />
        <span className="text-sm text-muted-foreground">{account.email}</span>
      </div>
      <div className="flex flex-col">
        {account.calendars.map((calendar) => (
          <CalendarItem key={calendar.name} calendar={calendar} />
        ))}
      </div>
    </div>
  )
}

export function Settings() {
  return (
    <div className="flex flex-col">
      {mockAccounts.map((account) => (
        <AccountSection key={account.email} account={account} />
      ))}
      <Button variant="ghost" className="justify-start text-muted-foreground">
        <PlusIcon className="size-4" />
        Add calendar account
      </Button>
    </div>
  )
}
