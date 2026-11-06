import { AddAccountModal } from "@/components/settings/accounts/AddAccountModal"

import { closeConnectPrompt, connectPromptOpen } from "@/stores/draft"

/** Shown when composing needs a writable calendar and there's none. */
export function ConnectPrompt() {
  return (
    <If when={connectPromptOpen()}>
      <AddAccountModal onClose={closeConnectPrompt} />
    </If>
  )
}
