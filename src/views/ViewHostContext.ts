import { createStrictContext } from "@/lib/strict-context"

// Lets a view switch to another one by id (year → week on a day double-click).
type ViewHost = {
  showView: (id: string) => void
}

export const [ViewHostProvider, useViewHost] = createStrictContext<ViewHost>("ViewHost")
