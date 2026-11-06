/*
 * `localStorage`'s synchronous surface over NSH's asynchronous `Storage`:
 * `loadLocalStorage` reads it all once at startup, and writes go through.
 */
import { Storage } from "nsh"

const values = new Map<string, string>()

export async function loadLocalStorage(): Promise<void> {
  for (const key of await Storage.keys()) {
    const value = await Storage.getItem(key)
    if (value !== null) values.set(key, value)
  }
}

export const localStorage = {
  getItem: (key: string): string | null => values.get(key) ?? null,
  setItem(key: string, value: string) {
    values.set(key, value)
    void Storage.setItem(key, value)
  },
  removeItem(key: string) {
    values.delete(key)
    void Storage.removeItem(key)
  },
}
