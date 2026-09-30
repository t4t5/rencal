import { useState } from "react"

import { cn } from "@/lib/utils"

import { RencalLogomarkIcon } from "@/icons/rencal-logomark"

export function PluginPreview({ url, name }: { url: string | null; name: string }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">("loading")
  return (
    <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xs bg-muted">
      {status !== "loaded" && <RencalLogomarkIcon className="w-8 opacity-15 grayscale" />}
      {url && status !== "failed" && (
        <img
          src={url}
          alt={`${name} preview`}
          width={960}
          height={540}
          decoding="async"
          className={cn(
            "absolute size-full object-cover transition-opacity duration-150",
            status === "loaded" ? "opacity-100" : "opacity-0",
          )}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("failed")}
        />
      )}
    </div>
  )
}
