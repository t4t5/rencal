/* What renCal has to tell the user, read by `ToastStack` in `components/ui/toaster.tsx`. */
import { signal } from "nsh"

export type Toast = {
  id: number
  kind: "message" | "success" | "error"
  title: string
  description?: string
}

const SHOWN_MS = 4000

let nextId = 1
const shown = signal<Toast[]>([])

export const toasts = () => shown()

export function dismissToast(id: number) {
  shown.update((list) => list.filter((toast) => toast.id !== id))
}

function show(kind: Toast["kind"], title: string, options?: { description?: string }) {
  const id = nextId++
  shown.update((list) => [...list, { id, kind, title, description: options?.description }])
  setTimeout(() => dismissToast(id), SHOWN_MS)
}

export const toast = Object.assign(
  (title: string, options?: { description?: string }) => show("message", title, options),
  {
    success: (title: string, options?: { description?: string }) => show("success", title, options),
    error: (title: string, options?: { description?: string }) => show("error", title, options),
  },
)
