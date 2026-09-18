import { useCallback, useState } from "react"

import { useCalendars } from "@/contexts/CalendarStateContext"
import { useSettings } from "@/contexts/SettingsContext"

import {
  connectProvider,
  connectProviderWithCredentials,
  type CredentialFieldInput,
} from "@/lib/api/providers"
import { logger } from "@/lib/logger"

export const useConnectProvider = () => {
  const [isConnecting, setIsConnecting] = useState(false)
  const { reloadCalendars } = useCalendars()
  const { reloadSettings } = useSettings()

  const connect = useCallback(
    async (providerName: string) => {
      setIsConnecting(true)

      try {
        await connectProvider(providerName)
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

  const connectWithCredentials = useCallback(
    async (providerName: string, credentials: CredentialFieldInput[]) => {
      setIsConnecting(true)

      try {
        await connectProviderWithCredentials(providerName, credentials)
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

  return {
    connect,
    connectWithCredentials,
    isConnecting,
  }
}
