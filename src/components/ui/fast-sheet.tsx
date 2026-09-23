import * as React from "react"

import { cn } from "@/lib/utils"

import { sheetSharedStyles } from "./sheet-styles"

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
        data-slot="sheet-overlay"
        data-state={open ? "open" : "closed"}
        className={cn(
          sheetSharedStyles.overlay,
          "transition-opacity duration-150",
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
      data-slot="sheet-content"
      data-state={open ? "open" : "closed"}
      ref={ref}
      className={cn(
        sheetSharedStyles.content,
        "overflow-y-auto transition-transform duration-150",
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
  return (
    <div data-slot="sheet-header" className={cn(sheetSharedStyles.header, className)} {...props} />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="sheet-footer" className={cn(sheetSharedStyles.footer, className)} {...props} />
  )
}

function SheetTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="sheet-title"
      data-typography="heading"
      className={cn(sheetSharedStyles.title, className)}
      {...props}
    />
  )
}

function SheetDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="sheet-description"
      className={cn(sheetSharedStyles.description, className)}
      {...props}
    />
  )
}

export {
  Sheet as FastSheet,
  SheetContent as FastSheetContent,
  SheetHeader as FastSheetHeader,
  SheetFooter as FastSheetFooter,
  SheetTitle as FastSheetTitle,
  SheetDescription as FastSheetDescription,
}
