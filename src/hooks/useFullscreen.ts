import { getCurrentWindow } from "@tauri-apps/api/window"
import { useEffect, useState } from "react"

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const appWindow = getCurrentWindow()

    appWindow.isFullscreen().then(setIsFullscreen)

    const unlisten = appWindow.onResized(() => {
      appWindow.isFullscreen().then(setIsFullscreen)
    })

    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])

  return isFullscreen
}
