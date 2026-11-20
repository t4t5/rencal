import type { InputRef, JSX, ViewRef } from "nsh"
import { Overlay, signal } from "nsh"
import type { InputProps } from "nsh/base"

/**
 * GTK keeps the focus when a press lands on something that can't take it, so a
 * field stays focused (and eats single-key shortcuts) after a click away. While
 * `when`, a press outside `anchor` calls `blur`, to drop it there as a browser
 * does. `blur` must only touch this field: by the time it runs, the press may
 * have focused another. Pass `anchor` from a signal: without one, every press
 * is outside, the field's own too.
 */
export function BlurOnPressOutside(props: {
  when: boolean
  anchor: ViewRef | undefined
  blur: () => void
}) {
  return (
    <If when={props.when && props.anchor}>
      {/* Draws nothing: it's how to hear a press outside the field. */}
      <Overlay anchor={props.anchor} class="size-0" onPressOutside={() => props.blur()} />
    </If>
  )
}

export type BlurProps = {
  ref?: InputRef | ((ref: InputRef) => void)
  /** Off while a press outside belongs to the field, like picking from its suggestions. */
  blurOnPressOutside?: boolean
}

/** The props `withBlurOnPressOutside` takes over: split them off with these. */
export const BLUR_KEYS = ["ref", "blurOnPressOutside", "onFocus", "onBlur"] as const

/** An input that `BlurOnPressOutside` unfocuses. */
export function withBlurOnPressOutside(
  props: BlurProps & Pick<InputProps, "onFocus" | "onBlur">,
  render: (handlers: {
    ref: (ref: InputRef) => void
    onFocus: () => void
    onBlur: () => void
  }) => JSX.Element,
) {
  // A signal, so the overlay's anchor follows the ref however late it's set.
  const input = signal<InputRef | undefined>(undefined)
  const focused = signal(false)

  return (
    <>
      {render({
        ref: (ref) => {
          input.set(ref)
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
      <BlurOnPressOutside
        when={focused() && props.blurOnPressOutside !== false}
        anchor={input()}
        blur={() => input()?.blur()}
      />
    </>
  )
}
