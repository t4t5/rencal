import { type JSX, Text, View } from "nsh"
import { Button as BaseButton, Dialog as BaseDialog } from "nsh/base"

import { cn } from "@/lib/utils"

import { CloseIcon } from "@/icons"
import { displayCase } from "@/themes"

/** A centered modal: pressing the backdrop or Escape closes it. */
export function Dialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  class?: string
  showCloseButton?: boolean
  children?: JSX.Element
}) {
  return (
    <BaseDialog
      open={props.open}
      onOpenChange={(event) => props.onOpenChange(event.open)}
      animation="fade"
      backdropClass="bg-overlay"
      class={cn(
        "m-auto w-[512px] max-w-full gap-4 rounded-(--radius-lg) border border-border bg-background p-6 text-foreground shadow-lg",
        props.class,
      )}
    >
      <If when={props.showCloseButton ?? true}>
        <BaseButton
          onPress={() => props.onOpenChange(false)}
          accessibilityLabel="Close"
          class="absolute right-1 top-1 p-1 opacity-70 hover:opacity-100"
        >
          <CloseIcon class="size-4" />
        </BaseButton>
      </If>
      {props.children}
    </BaseDialog>
  )
}

export function DialogHeader(props: { class?: string; children?: JSX.Element }) {
  return <View class={cn("gap-2", props.class)}>{props.children}</View>
}

export function DialogFooter(props: { class?: string; children?: JSX.Element }) {
  return <View class={cn("flex-row justify-end gap-2", props.class)}>{props.children}</View>
}

export function DialogTitle(props: { class?: string; children?: JSX.Element }) {
  return (
    <Text class={cn("font-mono text-center text-base font-semibold", displayCase(), props.class)}>
      {props.children}
    </Text>
  )
}

export function DialogDescription(props: { class?: string; children?: JSX.Element }) {
  return <Text class={cn("text-sm text-muted-foreground", props.class)}>{props.children}</Text>
}
