import { openUrl } from "@tauri-apps/plugin-opener"

import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"

import { ArrowUpRightIcon } from "@/icons/arrow-up-right"
import { LinkIcon } from "@/icons/link"

/** Make a typed link openable: "example.com" → "https://example.com". */
const toOpenableUrl = (url: string): string =>
  /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`

export const UrlInput = ({
  value,
  onChange,
  onClose,
  readOnly,
}: {
  value?: string | null
  onChange: (url: string) => void
  onClose?: () => void
  readOnly?: boolean
}) => {
  const url = value?.trim() ?? ""
  const open = () => openUrl(toOpenableUrl(url))

  if (readOnly) {
    if (!url) return null

    return (
      <Button
        type="button"
        variant="ghost"
        className="w-full justify-start px-0 font-normal bodytext!"
        onClick={open}
      >
        <InputGroupAddon>
          <LinkIcon />
        </InputGroupAddon>
        <span className="truncate">{url}</span>
      </Button>
    )
  }

  return (
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
          onClick={open}
        >
          <ArrowUpRightIcon />
        </InputGroupButton>
      )}
    </InputGroup>
  )
}
