import { CloseIcon } from "@/icons/close"

export function RemoveItemButton({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 rounded-xs outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
    >
      <CloseIcon className="size-4" />
    </button>
  )
}
