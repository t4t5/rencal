import { signal, Text, View } from "nsh"

import { ErrorText } from "@/components/settings/SettingsContent"
import { Button } from "@/components/ui/button"

import { getErrorMessage } from "@/lib/api"
import {
  findProvider,
  getProviderDisplayName,
  orderAccountProviders,
  providerRequiresAccount,
} from "@/lib/providers"
import { cn } from "@/lib/utils"

import { displayCase } from "@/themes"

import { ProviderIcon } from "./ProviderIcon"
import {
  beginProviderConnection,
  isConnecting,
  type ModalStep,
  providers,
  providersError,
} from "./providers"

export function ProviderList(props: { onClose: () => void; onSetStep: (step: ModalStep) => void }) {
  const error = signal<string | null>(null)

  const slugs = () =>
    orderAccountProviders(
      providers()
        .map((provider) => provider.slug)
        .filter(providerRequiresAccount),
    )

  async function connect(slug: string) {
    error.set(null)
    try {
      await beginProviderConnection(slug, props)
    } catch (e) {
      error.set(getErrorMessage(e, "Failed to connect account"))
    }
  }

  return (
    <View class="w-60 gap-3">
      <Each of={slugs()}>
        {(slug) => (
          <Button
            variant="secondary"
            class="gap-3"
            disabled={isConnecting()}
            onPress={() => void connect(slug())}
          >
            <If when={slug() !== "caldav"}>
              <ProviderIcon slug={slug()} info={findProvider(providers(), slug())} class="size-4" />
            </If>
            <Text
              class={cn("font-mono text-sm font-medium text-secondary-foreground", displayCase())}
            >
              {slug() === "caldav"
                ? "Other CalDAV server"
                : getProviderDisplayName(slug(), findProvider(providers(), slug()))}
            </Text>
          </Button>
        )}
      </Each>
      <ErrorText message={error() ?? providersError()} />
    </View>
  )
}
