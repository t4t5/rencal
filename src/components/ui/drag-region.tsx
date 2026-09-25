import { cn } from "@/lib/utils"

export function DragRegion({ className }: { className?: string }) {
  return <div className={cn("h-control", className)} data-tauri-drag-region />
}
