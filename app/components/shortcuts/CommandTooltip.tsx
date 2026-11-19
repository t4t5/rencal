import { Text } from "nsh"
import { Tooltip } from "nsh/base"

import { Kbd, KbdGroup } from "@/components/ui/kbd"

import { cn } from "@/lib/utils"

import { actionKeys } from "@/stores/commands"
import { typography } from "@/themes"

import { formatHotkeyKey } from "./ShortcutKeys"

const DELAY_MS = 1000

/**
 * Goes in a view's `tooltip` prop: the text and the keys bound to `action`, if any.
 * `<Button tooltip={<CommandTooltip text="Search" action="search.open" />}>`
 */
export function CommandTooltip(props: { text: string; action: string; open?: boolean }) {
  const keys = () => actionKeys(props.action)?.split("+").map(formatHotkeyKey) ?? []
  return (
    <Tooltip
      delay={DELAY_MS}
      open={props.open}
      class="flex-row items-center gap-2 rounded-(--radius-md) bg-tooltip px-2 py-1"
    >
      <Text class={cn(typography.caption(), "text-tooltip-foreground")}>{props.text}</Text>
      <If when={keys().length > 0}>
        <KbdGroup>
          <Each of={keys()}>{(key) => <Kbd label={key()} />}</Each>
        </KbdGroup>
      </If>
    </Tooltip>
  )
}
