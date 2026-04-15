import * as React from "react"

import { cn } from "@/lib/utils"

function Sheet({
  open,
  onOpenChange,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}) {
  React.useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation()
        onOpenChange(false)
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, onOpenChange])

  return (
    <>
      {/* Overlay */}
      <div
        className={cn(
          "fixed inset-0 z-50 bg-black/50 transition-opacity duration-150",
          open ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        onClick={() => onOpenChange(false)}
      />
      {children}
    </>
  )
}

function SheetContent({
  ref,
  open,
  className,
  children,
  side = "right",
}: {
  ref?: React.Ref<HTMLDivElement>
  open: boolean
  className?: string
  children: React.ReactNode
  side?: "top" | "right" | "bottom" | "left"
}) {
  const translate = {
    right: open ? "translate-x-0" : "translate-x-full",
    left: open ? "translate-x-0" : "-translate-x-full",
    bottom: open ? "translate-y-0" : "translate-y-full",
    top: open ? "translate-y-0" : "-translate-y-full",
  }[side]

  const position = {
    right: "inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm",
    left: "inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm",
    top: "inset-x-0 top-0 h-auto border-b",
    bottom: "inset-x-0 bottom-0 h-auto border-t",
  }[side]

  return (
    <div
      ref={ref}
      className={cn(
        "bg-background fixed z-50 flex flex-col gap-4 overflow-y-auto shadow-lg outline-none transition-transform duration-150 will-change-transform",
        position,
        translate,
        className,
      )}
    >
      {children}
    </div>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5 p-4", className)} {...props} />
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mt-auto flex flex-col gap-2 p-4", className)} {...props} />
}

function SheetTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 className={cn("text-foreground font-semibold font-heading", className)} {...props} />
}

function SheetDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-muted-foreground text-sm", className)} {...props} />
}

export {
  Sheet as FastSheet,
  SheetContent as FastSheetContent,
  SheetHeader as FastSheetHeader,
  SheetFooter as FastSheetFooter,
  SheetTitle as FastSheetTitle,
  SheetDescription as FastSheetDescription,
}
