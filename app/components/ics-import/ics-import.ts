/*
 * What wants importing: files opened with renCal, queued by the backend, and
 * files dropped on the window or picked, queued here. One dialog at a time.
 */
import { signal } from "nsh"
import { Backend } from "rencal/native"

import { api, getErrorMessage, type IcsImportResult } from "@/lib/api"
import { takePendingIcsFile } from "@/lib/api/internal"
import { toast } from "@/lib/toast"

import { jumpToEvent } from "@/stores/agenda"

const current = signal<string | null>(null)
const queued: string[] = []

export const importingPath = () => current()

async function next() {
  if (current() !== null) return
  try {
    const path = queued.shift() ?? (await takePendingIcsFile())
    if (path) current.set(path)
  } catch (error) {
    console.error("Failed to open .ics file:", error)
    toast.error("Couldn’t open file", {
      description: getErrorMessage(error, "Failed to read the opened file"),
    })
  }
}

export function closeImport() {
  current.set(null)
  void next()
}

export function onImported(result: IcsImportResult) {
  if (result.event) void jumpToEvent(result.event)
}

export function startIcsImport() {
  api.notifications.listen("ics-file-available", () => void next())
  void next()
}

export const icsPaths = (uris: readonly string[]) =>
  uris.flatMap((uri) => {
    if (!uri.startsWith("file:") || !/\.(ics|ical|ifb|icalendar)$/i.test(uri)) return []
    return [decodeURIComponent(new URL(uri).pathname)]
  })

/** `onFileDrop` of the window. */
export function dropFiles(event: { uris: string[] }) {
  queued.push(...icsPaths(event.uris))
  void next()
}

/** Asks for a file with the system's dialog. */
export async function pickIcsFile() {
  const path = await Backend.pickPath(false, "Import .ics file", ["ics"])
  if (!path) return
  queued.push(path)
  void next()
}
