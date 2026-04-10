import { useEffect, useState } from "react"

import { rpc } from "@/rpc"
import type { TimeFormat } from "@/rpc/bindings"

export function useTimeFormat() {
  const [timeFormat, setTimeFormatState] = useState<TimeFormat>("24h")

  useEffect(() => {
    rpc.caldir.get_time_format().then(setTimeFormatState).catch(console.error)
  }, [])

  const setTimeFormat = async (tf: TimeFormat) => {
    setTimeFormatState(tf)
    await rpc.caldir.set_time_format(tf)
  }

  return { timeFormat, setTimeFormat }
}
