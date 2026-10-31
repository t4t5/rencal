import { useContext } from "react"

import { ViewRegistryContext } from "@/views/ViewRegistry"
import type { ViewDescriptor } from "@/views/manifest"

// Built-in views, then the views installed plugins contribute.
export const useViews = (): readonly ViewDescriptor[] => useContext(ViewRegistryContext)
