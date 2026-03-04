import { FaGoogle as GoogleIcon, FaApple as AppleIcon } from "react-icons/fa"
import { FaMicrosoft as MicrosoftIcon } from "react-icons/fa"
import { IconType } from "react-icons/lib"
import { PiCalendarBlank as CalendarIcon } from "react-icons/pi"

import type { Calendar } from "@/rpc/bindings"

import { CalendarItemWithVisibilityToggle } from "./CalendarItem"

const providerToIcon: Record<string, IconType> = {
  google: GoogleIcon,
  icloud: AppleIcon,
  outlook: MicrosoftIcon,
}

export function AccountSection({ account, calendars }: { account: string; calendars: Calendar[] }) {
  const provider = calendars[0]?.provider ?? undefined
  const ProviderIcon = (provider ? providerToIcon[provider] : undefined) ?? CalendarIcon

  return (
    <div className="p-3 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <ProviderIcon className="size-4 text-muted-foreground ml-[-2px]" />
        <span className="text-sm text-muted-foreground">{account}</span>
      </div>

      <div className="flex flex-col gap-3">
        {calendars.map((calendar) => {
          return <CalendarItemWithVisibilityToggle key={calendar.slug} calendar={calendar} />
        })}
      </div>
    </div>
  )
}
