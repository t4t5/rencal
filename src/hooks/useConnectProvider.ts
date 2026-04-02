import { useState } from "react"

import { rpc } from "@/rpc"
import type { CredentialFieldInput } from "@/rpc/bindings"

import { useCalendars } from "@/contexts/CalendarStateContext"

import { logger } from "@/lib/logger"

export const useConnectProvider = () => {
  const [isConnecting, setIsConnecting] = useState(false)
  const { reloadCalendars } = useCalendars()

  async function connect(providerName: string) {
    setIsConnecting(true)

    try {
      await rpc.caldir.connect_provider(providerName)
      await reloadCalendars()
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
      await reloadCalendars()
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
