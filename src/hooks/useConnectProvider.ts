import { useCallback, useState } from "react"

import { useCalendars } from "@/contexts/CalendarStateContext"
import { useSettings } from "@/contexts/SettingsContext"

import { api, type CredentialFieldInput, type ProviderField } from "@/lib/api"
import { logger } from "@/lib/logger"

export const useConnectProvider = () => {
  const [isConnecting, setIsConnecting] = useState(false)
  const { reloadCalendars } = useCalendars()
  const { reloadSettings } = useSettings()

  const connect = useCallback(
    async (providerName: string) => {
      setIsConnecting(true)

      try {
        await api.providers.connect(providerName)
        await Promise.all([reloadCalendars(), reloadSettings()])
      } catch (error) {
        logger.error("Failed to connect provider:", error)
        throw error
      } finally {
        setIsConnecting(false)
      }
    },
    [reloadCalendars, reloadSettings],
  )

  /** Resolves to the provider's next form (e.g. a 2FA code), or null once connected. */
  const connectWithCredentials = useCallback(
    async (
      providerName: string,
      credentials: CredentialFieldInput[],
    ): Promise<ProviderField[] | null> => {
      setIsConnecting(true)

      try {
        const result = await api.providers.connectWithCredentials(providerName, credentials)
        if (result.status === "needs_credentials") return result.fields
        await Promise.all([reloadCalendars(), reloadSettings()])
        return null
      } catch (error) {
        logger.error("Failed to connect provider:", error)
        throw error
      } finally {
        setIsConnecting(false)
      }
    },
    [reloadCalendars, reloadSettings],
  )

  return {
    connect,
    connectWithCredentials,
    isConnecting,
  }
}
