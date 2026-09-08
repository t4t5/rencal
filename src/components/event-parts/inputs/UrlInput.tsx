import { openUrl } from "@tauri-apps/plugin-opener"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import { detectedUrlSourceLabel, toOpenableUrl, type DetectedUrl } from "@/lib/event-url"

import { ArrowUpRightIcon } from "@/icons/arrow-up-right"
import { LinkIcon } from "@/icons/link"
import { QuestionMarkCircleIcon } from "@/icons/question-mark-circle"

export const UrlInput = ({
  value,
  onChange,
  onClose,
  readOnly,
  detected,
}: {
  value?: string | null
  onChange: (url: string) => void
  onClose?: () => void
  readOnly?: boolean
  /** A link found in the event's location or notes, shown as a "virtual" URL above the field. */
  detected?: DetectedUrl | null
}) => {
  const url = value?.trim() ?? ""

  return (
    <>
      {detected && <UrlLink url={detected.url} hint={detectedUrlSourceLabel[detected.source]} />}

      {readOnly ? (
        url ? (
          <UrlLink url={url} />
        ) : null
      ) : (
        <InputGroup>
          <InputGroupAddon>
            <LinkIcon />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Add link"
            value={value ?? ""}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 pl-2"
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                onClose?.()
              }
            }}
          />
          {url && (
            <InputGroupButton
              size="icon-xs"
              aria-label="Open link"
              className="mr-1 h-6! shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => openUrl(toOpenableUrl(url))}
            >
              <ArrowUpRightIcon />
            </InputGroupButton>
          )}
        </InputGroup>
      )}
    </>
  )
}

/**
 * A read-only link row. Only the URL text is clickable, so a stray click on
 * the row doesn't open the browser. An optional hint says where the link came from.
 */
function UrlLink({ url, hint }: { url: string; hint?: string }) {
  return (
    <InputGroup className="pr-1">
      <InputGroupAddon>
        <LinkIcon />
      </InputGroupAddon>

      <div className="flex min-w-0 flex-1">
        <button
          type="button"
          className="min-w-0 cursor-pointer truncate rounded-xs px-2 py-1 text-sm outline-none hover:underline focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          onClick={() => openUrl(toOpenableUrl(url))}
        >
          {url}
        </button>
      </div>

      {hint && (
        <Tooltip>
          <TooltipTrigger asChild tabIndex={-1}>
            <span
              className="flex size-6 shrink-0 items-center justify-center text-muted-foreground opacity-0 group-hover/input-group:opacity-100 group-focus-within/input-group:opacity-100"
              aria-label={hint}
            >
              <QuestionMarkCircleIcon className="size-4" />
            </span>
          </TooltipTrigger>
          <TooltipContent>{hint}</TooltipContent>
        </Tooltip>
      )}
    </InputGroup>
  )
}
