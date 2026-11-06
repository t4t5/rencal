import { token } from "nsh"
import { Button } from "nsh/base"

import { CloseIcon } from "@/icons"

export function RemoveItemButton(props: { onPress?: () => void }) {
  return (
    <Button
      onPress={props.onPress}
      accessibilityLabel="Remove"
      class="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
    >
      <CloseIcon color={token("muted-foreground")} />
    </Button>
  )
}
