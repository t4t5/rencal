import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"

type AllDayContextMenuProps = {
  children: React.ReactNode
  onCreateEvent: () => void
  disabled?: boolean
}

export function AllDayContextMenu({ children, onCreateEvent, disabled }: AllDayContextMenuProps) {
  return (
    <ContextMenu modal={false}>
      <ContextMenuTrigger
        asChild
        disabled={disabled}
        onDoubleClick={disabled ? undefined : onCreateEvent}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => setTimeout(onCreateEvent)}>Create event</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
