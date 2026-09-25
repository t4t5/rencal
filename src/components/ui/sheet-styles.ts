export const sheetSharedStyles = {
  overlay: "fixed inset-0 z-50 bg-overlay",
  content:
    "bg-background fixed z-50 flex flex-col gap-4 shadow-lg outline-none will-change-transform",
  header: "flex flex-col gap-1.5 p-4",
  footer: "mt-auto flex flex-col gap-2 p-4",
  title: "text-foreground font-semibold",
  description: "text-muted-foreground text-sm",
} as const
