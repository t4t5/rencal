import { useCallback, useState } from "react"
import { z } from "zod"

export function useLocalStorage<T extends z.ZodType>(
  key: string,
  schema: T,
  defaultValue: z.infer<T>,
): [z.infer<T>, (value: z.infer<T>) => void] {
  const [storedValue, setStoredValue] = useState<z.infer<T>>(() => {
    const item = localStorage.getItem(key)
    if (item === null) return defaultValue
    const result = schema.safeParse(JSON.parse(item))
    return result.success ? result.data : defaultValue
  })

  const setValue = useCallback(
    (value: z.infer<T>) => {
      setStoredValue(value)
      localStorage.setItem(key, JSON.stringify(value))
    },
    [key],
  )

  return [storedValue, setValue]
}
