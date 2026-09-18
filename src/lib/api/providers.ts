import { rpc } from "@/rpc"
import type { CredentialFieldInput, ProviderConnectInfo, ProviderField } from "@/rpc/bindings"

import type { Calendar } from "@/lib/api/calendars"

export type { CredentialFieldInput, ProviderField }

/** Provider slugs are open strings; the set comes from the bundled provider binaries. */
export function listProviders(): Promise<string[]> {
  return rpc.caldir.list_providers()
}

export function getProviderConnectInfo(providerName: string): Promise<ProviderConnectInfo> {
  return rpc.caldir.get_provider_connect_info(providerName)
}

/** Runs the provider's OAuth flow and returns the calendars it added. */
export function connectProvider(providerName: string): Promise<Calendar[]> {
  return rpc.caldir.connect_provider(providerName)
}

export function connectProviderWithCredentials(
  providerName: string,
  credentials: CredentialFieldInput[],
): Promise<Calendar[]> {
  return rpc.caldir.connect_provider_with_credentials(providerName, credentials)
}

/** Resolves when the stored account can still reach the provider; rejects otherwise. */
export async function checkProviderConnection(
  providerName: string,
  account: string,
): Promise<void> {
  await rpc.caldir.check_provider_connection(providerName, account)
}
