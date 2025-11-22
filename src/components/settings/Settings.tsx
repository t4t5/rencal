import { ConnectGoogle } from "@/components/settings/ConnectGoogle"
import { GoogleCalendars } from "@/components/settings/GoogleCalendars"

export function Settings() {
  return (
    <div className="flex flex-col">
      <ConnectGoogle />
      <GoogleCalendars />
    </div>
  )
}
