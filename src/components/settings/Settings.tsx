import { eq } from "drizzle-orm"
import { FaGoogle as GoogleIcon, FaApple as AppleIcon } from "react-icons/fa"
import { IconType } from "react-icons/lib"
import {
  PiEyeClosed as EyeClosedIcon,
  PiEye as EyeIcon,
  /*PiRss as RssIcon,*/ PiPlus as PlusIcon,
} from "react-icons/pi"

import { Button } from "@/components/ui/button"

import { useAuth } from "@/contexts/AuthContext"
import { useCalendar } from "@/contexts/CalendarContext"

import { cn } from "@/lib/utils"

import { db, schema } from "@/db/database"
import { Account, Calendar, EmailProvider } from "@/db/types"

const providerToIcon: Record<EmailProvider, IconType> = {
  Google: GoogleIcon,
  Apple: AppleIcon,
}

function CalendarItem({ calendar }: { calendar: Calendar }) {
  const { name, color, selected } = calendar
  const { reloadCalendars } = useCalendar()

  const onToggleVisibility = async () => {
    await db
      .update(schema.calendars)
      .set({ selected: !selected })
      .where(eq(schema.calendars.id, calendar.id))

    await reloadCalendars()
  }

  return (
    <div
      className={cn("flex items-center justify-between py-1.5 group", {
        "opacity-40": !selected,
      })}
    >
      <div className="flex items-center gap-3">
        <div
          className="size-3 rounded-[3px] shrink-0"
          style={{ backgroundColor: color ?? undefined }}
        />
        {/*isSubscription ? (
          <RssIcon className="size-3 shrink-0" style={{ color }} />
        ) : (
          <div className="size-3 rounded-[3px] shrink-0" style={{ backgroundColor: color }} />
        )*/}
        <span className="text-sm">{name}</span>
      </div>

      <div className="cursor-pointer" onClick={onToggleVisibility}>
        {selected ? (
          <EyeIcon className="size-4 opacity-0 group-hover:opacity-50" />
        ) : (
          <EyeClosedIcon className="size-4 text-muted-foreground" />
        )}
      </div>
    </div>
  )
}

function AccountSection({ account }: { account: Account }) {
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

export function Settings() {
  const { accounts } = useAuth()

  return (
    <div className="flex flex-col">
      {accounts.map((account) => (
        <AccountSection key={account.id} account={account} />
      ))}

      <Button variant="ghost" className="justify-start text-muted-foreground">
        <PlusIcon className="size-4" />
        Add calendar account
      </Button>
    </div>
  )
}
