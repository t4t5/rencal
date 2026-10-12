import { rpc } from "@/rpc"
import type {
  CredentialFieldInput,
  CredentialsConnectResult,
  ProviderConnectInfo,
  ProviderField,
  ProviderInfo,
} from "@/rpc/bindings"

import type { Calendar } from "@/lib/api/calendars"

export type { CredentialFieldInput, ProviderField, ProviderInfo }

/**
 * Rescans for provider binaries (bundled, plugins, `PATH`), sorted by slug.
 * Slugs are open strings.
 */
export function listProviders(): Promise<ProviderInfo[]> {
  return rpc.caldir.list_providers()
}

export function getProviderConnectInfo(providerName: string): Promise<ProviderConnectInfo> {
  return rpc.caldir.get_provider_connect_info(providerName)
}

/** Runs the provider's OAuth flow and returns the calendars it added. */
export function connectProvider(providerName: string): Promise<Calendar[]> {
  return rpc.caldir.connect_provider(providerName)
}

/**
 * Submits a credentials form. The provider either finishes connecting or asks
 * for another form (e.g. a 2FA code), which is submitted the same way.
 */
export function connectProviderWithCredentials(
  providerName: string,
  credentials: CredentialFieldInput[],
): Promise<CredentialsConnectResult> {
  return rpc.caldir.connect_provider_with_credentials(providerName, credentials)
}

/** Resolves when the stored account can still reach the provider; rejects otherwise. */
export async function checkProviderConnection(
  providerName: string,
  account: string,
): Promise<void> {
  await rpc.caldir.check_provider_connection(providerName, account)
}

export const providers = {
  list: listProviders,
  getConnectInfo: getProviderConnectInfo,
  connect: connectProvider,
  connectWithCredentials: connectProviderWithCredentials,
  checkConnection: checkProviderConnection,
} as const
