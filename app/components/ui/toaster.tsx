import { Overlay, Text, View } from "nsh"
import { Toast, ToastStack } from "nsh/base"
import { currentWindow, focusedWindow } from "nsh/desktop"

import { dismissToast, type Toast as ToastData, toasts } from "@/lib/toast"

const TINT: Record<ToastData["kind"], string> = {
  message: "bg-foreground",
  success: "bg-success",
  error: "bg-destructive",
}

function Item(props: { toast: ToastData }) {
  return (
    <Toast
      transitionStatus="present"
      accessibilityLabel={props.toast.title}
      onDismissRequest={() => dismissToast(props.toast.id)}
      class="w-[356px] flex-row items-center gap-3 rounded-(--radius-lg) border border-border bg-toast px-4 py-3 shadow-lg"
    >
      <If when={props.toast.kind !== "message"}>
        <View class={`size-2 shrink-0 rounded-(--radius-circle) ${TINT[props.toast.kind]}`} />
      </If>
      <View class="min-w-0 flex-1 gap-0.5">
        <Text class="text-sm font-medium text-toast-foreground">{props.toast.title}</Text>
        <If when={props.toast.description}>
          <Text class="text-sm text-muted-foreground">{props.toast.description}</Text>
        </If>
      </View>
    </Toast>
  )
}

/**
 * The messages from `lib/toast.ts`, stacked at the window's bottom right. Every
 * window has a toaster; the one in front shows them, the main window's while
 * another app is.
 */
export function Toaster() {
  const win = currentWindow()
  const inFront = () => {
    const focused = focusedWindow()
    return focused ? focused.id === win.id : win.main
  }
  return (
    <If when={toasts().length > 0 && inFront()}>
      <Overlay class="bottom-4 right-4 w-[356px]">
        <ToastStack
          placement="bottomRight"
          onCancel={() => {
            const newest = toasts().at(-1)
            if (newest) dismissToast(newest.id)
          }}
        >
          <Each of={toasts()} key={(toast) => toast.id}>
            {(toast) => <Item toast={toast()} />}
          </Each>
        </ToastStack>
      </Overlay>
    </If>
  )
}
