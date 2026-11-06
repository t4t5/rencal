import { type JSX, View } from "nsh"

import { cn } from "@/lib/utils"

/** A field with an icon or button beside its input: this is the box, not the input. */
export function InputGroup(props: { class?: string; readOnly?: boolean; children?: JSX.Element }) {
  return (
    <View
      class={cn(
        "group min-h-(--control-height) w-full flex-row items-center gap-2 rounded-(--radius-md) border border-transparent px-2",
        !props.readOnly &&
          "hover:border-input focus-within:border-transparent focus-within:bg-secondary",
        props.class,
      )}
    >
      {props.children}
    </View>
  )
}
