import type { InputRef, JSX } from "nsh"
import { Overlay, signal } from "nsh"
import type { InputProps } from "nsh/base"

export type BlurProps = {
  ref?: InputRef | ((ref: InputRef) => void)
  /** Off while a press outside belongs to the field, like picking from its suggestions. */
  blurOnPressOutside?: boolean
}

/** The props `withBlurOnPressOutside` takes over: split them off with these. */
export const BLUR_KEYS = ["ref", "blurOnPressOutside", "onFocus", "onBlur"] as const

/**
 * GTK keeps the focus when a press lands on something that can't take it, so a
 * field stays focused (and eats single-key shortcuts) after a click away. This
 * drops it there, as a browser does.
 */
export function withBlurOnPressOutside(
  props: BlurProps & Pick<InputProps, "onFocus" | "onBlur">,
  render: (handlers: {
    ref: (ref: InputRef) => void
    onFocus: () => void
    onBlur: () => void
  }) => JSX.Element,
) {
  let input: InputRef | undefined
  const focused = signal(false)

  return (
    <>
      {render({
        ref: (ref) => {
          input = ref
          if (typeof props.ref === "function") props.ref(ref)
        },
        onFocus: () => {
          focused.set(true)
          props.onFocus?.()
        },
        onBlur: () => {
          focused.set(false)
          props.onBlur?.()
        },
      })}
      <If when={focused() && props.blurOnPressOutside !== false}>
        {/* Draws nothing: it's how to hear a press outside the field. */}
        <Overlay anchor={input} class="size-0" onPressOutside={() => input?.blur()} />
      </If>
    </>
  )
}
