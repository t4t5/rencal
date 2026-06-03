import { emit } from "@tauri-apps/api/event"
import { useState } from "react"

import { rpc } from "@/rpc"
import type { CredentialFieldInput } from "@/rpc/bindings"
import { CALDIR_CHANGED } from "@/rpc/events"

import { useCalendars } from "@/contexts/CalendarStateContext"
import { useSettings } from "@/contexts/SettingsContext"

import { logger } from "@/lib/logger"

export const useConnectProvider = () => {
  const [isConnecting, setIsConnecting] = useState(false)
  const { reloadCalendars } = useCalendars()
  const { reloadSettings } = useSettings()

  async function connect(providerName: string) {
    setIsConnecting(true)

    try {
      await rpc.caldir.connect_provider(providerName)
      await Promise.all([reloadCalendars(), reloadSettings()])
      await emit(CALDIR_CHANGED)
    } catch (error) {
      logger.error("Failed to connect provider:", error)
    } finally {
      setIsConnecting(false)
    }
  }

  async function connectWithCredentials(providerName: string, credentials: CredentialFieldInput[]) {
    setIsConnecting(true)

    try {
      await rpc.caldir.connect_provider_with_credentials(providerName, credentials)
      await Promise.all([reloadCalendars(), reloadSettings()])
      await emit(CALDIR_CHANGED)
    } catch (error) {
      logger.error("Failed to connect provider:", error)
      throw error
    } finally {
      setIsConnecting(false)
    }
  }

  return {
    connect,
    connectWithCredentials,
    isConnecting,
  }
}
