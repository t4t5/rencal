import type { InputRef } from "nsh"
import { signal, split, token } from "nsh"
import { Input as BaseInput, type InputProps } from "nsh/base"

import { cn } from "@/lib/utils"

const VERTICAL_PADDING = 7

type Props = InputProps & { ref?: InputRef | ((ref: InputRef) => void) }

/** A multiline input that grows with its text, drawing its own box. */
export function Textarea(props: Props) {
  const [own, rest] = split(props, ["class"])
  return (
    <TextareaInner
      {...rest}
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
  const [own, rest] = split(props, ["class", "onContentSizeChange"])
  const height = signal(token("control-height"))
  return (
    <BaseInput
      {...rest}
      multiline
      onContentSizeChange={(event) => {
        height.set(Math.max(token("control-height"), event.size.height + VERTICAL_PADDING * 2 + 2))
        own.onContentSizeChange?.(event)
      }}
      style={{ height: height() }}
      class={cn(
        "min-w-0 py-[7px] text-sm text-foreground placeholder:text-placeholder-foreground",
        own.class,
      )}
    />
  )
}
