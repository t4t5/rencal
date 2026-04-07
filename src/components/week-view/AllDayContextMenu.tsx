import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"

type AllDayContextMenuProps = {
  children: React.ReactNode
  onCreateEvent: () => void
}

export function AllDayContextMenu({ children, onCreateEvent }: AllDayContextMenuProps) {
  return (
    <ContextMenu modal={false}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => setTimeout(onCreateEvent)}>Create event</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
