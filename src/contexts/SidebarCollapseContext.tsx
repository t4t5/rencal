import { ReactNode, createContext, useCallback, useContext, useMemo } from "react"
import { z } from "zod"

import { useLocalStorage } from "@/hooks/useLocalStorage"

const sidebarCollapsedSchema = z.boolean()

const SIDEBAR_COLLAPSED_KEY = "rencal-sidebar-collapsed"

interface SidebarCollapseContextType {
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
  toggleCollapsed: () => void
}

const SidebarCollapseContext = createContext({} as SidebarCollapseContextType)

export function useSidebarCollapse() {
  return useContext(SidebarCollapseContext)
}

export function SidebarCollapseProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useLocalStorage(
    SIDEBAR_COLLAPSED_KEY,
    sidebarCollapsedSchema,
    false,
  )

  const toggleCollapsed = useCallback(() => {
    setCollapsed(!collapsed)
  }, [collapsed, setCollapsed])

  const value = useMemo(
    () => ({ collapsed, setCollapsed, toggleCollapsed }),
    [collapsed, setCollapsed, toggleCollapsed],
  )

  return <SidebarCollapseContext.Provider value={value}>{children}</SidebarCollapseContext.Provider>
}
