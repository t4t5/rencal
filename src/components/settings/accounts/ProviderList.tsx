import { Dispatch, SetStateAction, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"

import { useConnectProvider } from "@/hooks/useConnectProvider"
import { getErrorMessage, rencal } from "@/lib/api"
import {
  getProviderDisplayName,
  getProviderIcon,
  orderAccountProviders,
  providerRequiresAccount,
} from "@/lib/providers"

import { ModalStep } from "./AddAccountModal"
import { beginProviderConnection } from "./provider-connection"

export const ProviderList = ({
  onClose,
  onSetStep,
}: {
  onClose: () => void
  onSetStep: Dispatch<SetStateAction<ModalStep>>
}) => {
  const { connect, isConnecting } = useConnectProvider()

  const [providers, setProviders] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    rencal.providers
      .list()
      .then((all) => {
        setProviders(orderAccountProviders(all.filter(providerRequiresAccount)))
      })
      .catch((error: unknown) => {
        setError(getErrorMessage(error, "Failed to load providers"))
      })
  }, [])

  async function handleProviderClick(name: string) {
    setError(null)
    try {
      await beginProviderConnection({
        provider: name,
        connect,
        onClose,
        onSetStep,
      })
    } catch (error) {
      setError(getErrorMessage(error, "Failed to connect account"))
    }
  }

  return (
    <div className="flex flex-col gap-3 w-60">
      {providers.map((name) => {
        const isCaldav = name === "caldav"
        const Icon = getProviderIcon(name)
        const displayName = isCaldav ? "Other CalDAV server" : getProviderDisplayName(name)

        return (
          <Button
            key={name}
            variant="secondary"
            className="gap-3 h-12 border-input"
            disabled={isConnecting}
            onClick={() => handleProviderClick(name)}
          >
            {!isCaldav && Icon && <Icon className="size-4" />}
            {displayName}
          </Button>
        )
      })}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
