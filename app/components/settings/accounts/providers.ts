/* The providers renCal can run, with plugin names and icons; one list for all of Settings. */
import { signal } from "nsh"

import {
  api,
  type CredentialFieldInput,
  getErrorMessage,
  type ProviderField,
  type ProviderInfo,
} from "@/lib/api"
import { logger } from "@/lib/logger"

import { reloadCalendars } from "@/stores/calendar"
import { reloadSettings } from "@/stores/settings"

const list = signal<ProviderInfo[]>([])
const loadError = signal<string | null>(null)
const connecting = signal(false)

export const providers = () => list()
export const providersError = () => loadError()
export const isConnecting = () => connecting()

let latest = 0
let listening = false

/** Rescans, so a binary installed on `PATH` shows up when a provider list opens. */
export async function loadProviders() {
  if (!listening) {
    listening = true
    // Installing or uninstalling a provider plugin changes the list.
    api.notifications.listen("providers-changed", () => void loadProviders())
  }
  const request = ++latest
  try {
    const next = await api.providers.list()
    if (request !== latest) return
    list.set(next)
    loadError.set(null)
  } catch (error) {
    if (request === latest) loadError.set(getErrorMessage(error, "Failed to load providers"))
  }
}

async function whileConnecting<T>(work: () => Promise<T>): Promise<T> {
  connecting.set(true)
  try {
    return await work()
  } catch (error) {
    logger.error("Failed to connect provider:", error)
    throw error
  } finally {
    connecting.set(false)
  }
}

export const connectProvider = (name: string) =>
  whileConnecting(async () => {
    await api.providers.connect(name)
    await Promise.all([reloadCalendars(), reloadSettings()])
  })

/** Resolves to the provider's next form (e.g. a 2FA code), or null once connected. */
export const connectWithCredentials = (
  name: string,
  credentials: CredentialFieldInput[],
): Promise<ProviderField[] | null> =>
  whileConnecting(async () => {
    const result = await api.providers.connectWithCredentials(name, credentials)
    if (result.status === "needs_credentials") return result.fields
    await Promise.all([reloadCalendars(), reloadSettings()])
    return null
  })

export type ModalStep =
  | { kind: "select-provider" }
  | { kind: "setup"; provider: string; instructions: string; fields: ProviderField[] }
  | { kind: "credentials"; provider: string; fields: ProviderField[] }
  | { kind: "local-calendar" }

export async function beginProviderConnection(
  provider: string,
  { onClose, onSetStep }: { onClose: () => void; onSetStep: (step: ModalStep) => void },
) {
  const info = await api.providers.getConnectInfo(provider)

  if (info.step === "oauth_redirect" || info.step === "hosted_oauth") {
    await connectProvider(provider)
    onClose()
  } else if (info.step === "needs_setup") {
    onSetStep({
      kind: "setup",
      provider,
      instructions: info.instructions ?? "",
      fields: info.fields,
    })
  } else if (info.step === "credentials") {
    onSetStep({ kind: "credentials", provider, fields: info.fields })
  }
}
