import { emit, listen } from "@tauri-apps/api/event"
import { useEffect, useState } from "react"

import { rpc } from "@/rpc"
import type { TimeFormat } from "@/rpc/bindings"

const TIME_FORMAT_CHANGED = "time-format-changed"

export function useTimeFormat() {
  const [timeFormat, setTimeFormatState] = useState<TimeFormat>("24h")

  useEffect(() => {
    rpc.caldir.get_time_format().then(setTimeFormatState).catch(console.error)

    const unlisten = listen<TimeFormat>(TIME_FORMAT_CHANGED, (event) => {
      setTimeFormatState(event.payload)
    })

    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])

  const setTimeFormat = async (tf: TimeFormat) => {
    setTimeFormatState(tf)
    await rpc.caldir.set_time_format(tf)
    await emit(TIME_FORMAT_CHANGED, tf)
  }

  return { timeFormat, setTimeFormat }
}
