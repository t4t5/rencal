import { ReactNode, createContext, useContext, useEffect, useState } from "react"

import { logger } from "@/lib/logger"

import { Storage, getDb } from "@/storage/db"

interface StorageContextType {
  store: Storage
}

const StorageContext = createContext({} as StorageContextType)

export function useStorage() {
  return useContext(StorageContext)
}

export function StorageProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<Storage | null>(null)

  useEffect(() => {
    async function initializeStorage() {
      try {
        const db = await getDb()
        setStore(db)
        logger.info("Connected to DB!")
      } catch (error) {
        logger.error("Failed to connect to DB:", error)
      }
    }

    void initializeStorage()
  }, [])

  // Don't render children until store is initialized
  if (!store) {
    return <div>Loading storage...</div>
  }

  const value = {
    store,
  }

  return <StorageContext.Provider value={value}>{children}</StorageContext.Provider>
}
