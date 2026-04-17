import { Dispatch, SetStateAction, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"

import { rpc } from "@/rpc"

import { useConnectProvider } from "@/hooks/useConnectProvider"
import { getProviderDisplayName, getProviderIcon, providerRequiresAccount } from "@/lib/providers"

import { ModalStep } from "./AddAccountModal"

export const ProviderList = ({
  onClose,
  onSetStep,
}: {
  onClose: () => void
  onSetStep: Dispatch<SetStateAction<ModalStep>>
}) => {
  const { connect, isConnecting } = useConnectProvider()

  const [providers, setProviders] = useState<string[]>([])

  useEffect(() => {
    rpc.caldir.list_providers().then((all) => {
      const filtered = all.filter(providerRequiresAccount)

      // We want "caldav" to be shown last:
      const sorted = filtered.sort((a, b) => {
        if (a === "caldav") return 1
        if (b === "caldav") return -1
        return 0
      })

      setProviders(sorted)
    })
  }, [])

  async function handleProviderClick(name: string) {
    const info = await rpc.caldir.get_provider_connect_info(name)

    if (info.step === "oauth_redirect" || info.step === "hosted_oauth") {
      await connect(name)
      onClose()
    } else if (info.step === "needs_setup") {
      onSetStep({
        kind: "setup",
        provider: name,
        instructions: info.instructions ?? "",
        fields: info.fields,
      })
    } else if (info.step === "credentials") {
      onSetStep({ kind: "credentials", provider: name, fields: info.fields })
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
            {!isCaldav && <Icon className="size-4" />}
            {displayName}
          </Button>
        )
      })}
    </div>
  )
}
