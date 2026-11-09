import type { InputRef } from "nsh"
import { signal, split, token } from "nsh"
import { Input as BaseInput, type InputProps } from "nsh/base"

import { cn } from "@/lib/utils"

const MIN_VERTICAL_PADDING = 6
const BORDER_WIDTH = 1

type Props = InputProps & { ref?: InputRef | ((ref: InputRef) => void) }

/** A multiline input that grows with its text, drawing its own box. */
export function Textarea(props: Props) {
  const [own, rest] = split(props, ["class"])
  return (
    <GrowingInput
      {...rest}
      bordered
      class={cn(
        "w-full rounded-(--radius-md) border px-2",
        "border-transparent hover:border-input focus:border-transparent focus:bg-secondary",
        own.class,
      )}
    />
  )
}

/** The same, for a wrapper that owns the box. */
export function TextareaInner(props: Props) {
  return <GrowingInput {...props} />
}

function GrowingInput(props: Props & { bordered?: boolean }) {
  const [own, rest] = split(props, ["class", "bordered", "onContentSizeChange"])
  const contentHeight = signal(0)
  // One line fills a control's height, inside a border of its own or its wrapper's.
  const minHeight = () => token("control-height") - 2 * BORDER_WIDTH
  const padding = () => Math.max(MIN_VERTICAL_PADDING, (minHeight() - contentHeight()) / 2)
  const border = () => (own.bordered ? 2 * BORDER_WIDTH : 0)
  return (
    <BaseInput
      {...rest}
      multiline
      onContentSizeChange={(event) => {
        contentHeight.set(event.size.height)
        own.onContentSizeChange?.(event)
      }}
      style={{
        height: contentHeight() + 2 * padding() + border(),
        paddingVertical: padding(),
      }}
      class={cn(
        "min-w-0 text-sm text-foreground placeholder:text-placeholder-foreground",
        own.class,
      )}
    />
  )
}
