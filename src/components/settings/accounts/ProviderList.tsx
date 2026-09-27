import { Dispatch, SetStateAction, useState } from "react"

import { Button } from "@/components/ui/button"

import { useConnectProvider } from "@/hooks/useConnectProvider"
import { useProviders } from "@/hooks/useProviders"
import { getErrorMessage } from "@/lib/api"
import {
  findProvider,
  getProviderDisplayName,
  orderAccountProviders,
  providerRequiresAccount,
} from "@/lib/providers"

import { ModalStep } from "./AddAccountModal"
import { ProviderIcon } from "./ProviderIcon"
import { beginProviderConnection } from "./provider-connection"

export const ProviderList = ({
  onClose,
  onSetStep,
}: {
  onClose: () => void
  onSetStep: Dispatch<SetStateAction<ModalStep>>
}) => {
  const { connect, isConnecting } = useConnectProvider()
  const { providers, error: loadError } = useProviders()
  const [error, setError] = useState<string | null>(null)

  const slugs = orderAccountProviders(
    providers.map((provider) => provider.slug).filter(providerRequiresAccount),
  )

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
      {slugs.map((name) => {
        const isCaldav = name === "caldav"
        const info = findProvider(providers, name)
        const displayName = isCaldav ? "Other CalDAV server" : getProviderDisplayName(name, info)

        return (
          <Button
            key={name}
            variant="secondary"
            className="gap-3"
            disabled={isConnecting}
            onClick={() => handleProviderClick(name)}
          >
            {!isCaldav && <ProviderIcon slug={name} info={info} className="size-4" />}
            {displayName}
          </Button>
        )
      })}
      {(error ?? loadError) && (
        <p role="alert" className="text-sm text-destructive">
          {error ?? loadError}
        </p>
      )}
    </div>
  )
}
