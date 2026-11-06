import { openUrl, Text, token, View } from "nsh"

import { Button } from "@/components/ui/button"
import { InputInner } from "@/components/ui/input"
import { InputGroup } from "@/components/ui/input-group"
import { Tooltip } from "@/components/ui/tooltip"

import { type DetectedUrl, detectedUrlSourceLabel, toOpenableUrl } from "@/lib/event-url"

import { ArrowUpRightIcon, LinkIcon, QuestionMarkCircleIcon } from "@/icons"

/**
 * A read-only link row. Only the URL text is pressable, so a stray press on the
 * row doesn't open the browser. A hint says where the link came from.
 */
function UrlLink(props: { url: string; hint?: string }) {
  return (
    <InputGroup readOnly>
      <LinkIcon color={token("muted-foreground")} />
      <View class="min-w-0 flex-1 flex-row">
        <Text
          role="link"
          onPress={() => void openUrl(toOpenableUrl(props.url))}
          class="truncate py-1 text-sm text-foreground hover:underline"
        >
          {props.url}
        </Text>
      </View>
      <If when={props.hint}>
        <View class="opacity-0 group-hover:opacity-100" tooltip={<Tooltip label={props.hint!} />}>
          <QuestionMarkCircleIcon color={token("muted-foreground")} />
        </View>
      </If>
    </InputGroup>
  )
}

export function UrlInput(props: {
  value?: string | null
  onChange: (url: string) => void
  onClose?: () => void
  readOnly?: boolean
  /** A link found in the event's location or notes, shown above the field. */
  detected?: DetectedUrl | null
}) {
  const url = () => props.value?.trim() ?? ""

  return (
    <>
      <If when={props.detected}>
        {(detected) => (
          <UrlLink url={detected().url} hint={detectedUrlSourceLabel[detected().source]} />
        )}
      </If>
      <If
        when={!props.readOnly}
        else={
          <If when={url()}>
            <UrlLink url={url()} />
          </If>
        }
      >
        <InputGroup>
          <LinkIcon color={token("muted-foreground")} />
          <InputInner
            placeholder="Add link"
            value={props.value ?? ""}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            onChange={({ value }) => props.onChange(value)}
            onSubmit={() => props.onClose?.()}
          />
          <If when={url()}>
            <Button
              variant="ghost"
              size="icon-xs"
              onPress={() => void openUrl(toOpenableUrl(url()))}
            >
              <ArrowUpRightIcon color={token("muted-foreground")} />
            </Button>
          </If>
        </InputGroup>
      </If>
    </>
  )
}
