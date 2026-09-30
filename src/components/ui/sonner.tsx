import { Toaster as Sonner, type ToasterProps } from "sonner"

// Unstyled: Sonner's injected CSS is unlayered and would beat Tailwind utilities.
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-(--width) items-center gap-3 rounded-lg border bg-toast px-4 py-3 text-sm text-toast-foreground shadow-lg",
          icon: "flex size-4 shrink-0 items-center [&>svg]:size-4",
          content: "flex min-w-0 flex-col gap-0.5",
          title: "font-medium",
          description: "text-muted-foreground",
          success: "[&_[data-icon]]:text-success",
          warning: "[&_[data-icon]]:text-warning",
          error: "[&_[data-icon]]:text-destructive",
        },
      }}
      {...props}
    />
  )
}
