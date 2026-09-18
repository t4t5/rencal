import { useCallback, useState } from "react"

import { useCalendars } from "@/contexts/CalendarStateContext"
import { useSettings } from "@/contexts/SettingsContext"

import { api, type CredentialFieldInput } from "@/lib/api"
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

  const connectWithCredentials = useCallback(
    async (providerName: string, credentials: CredentialFieldInput[]) => {
      setIsConnecting(true)

      try {
        await api.providers.connectWithCredentials(providerName, credentials)
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
