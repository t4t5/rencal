import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"

import { PropertiesPanel, VariantData } from "./components/PropertiesPanel"
import type { CvaConfig } from "./parse-cva"

export default function App() {
  const [config, setConfig] = useState<CvaConfig | null>(null)

  const [selectedVariant, setSelectedVariant] = useState<VariantData | null>(null)

  useEffect(() => {
    fetch("/api/cva-config?file=./src/components/ui/button.tsx")
      .then((res) => res.json())
      .then((data) => setConfig(data[0]))
  }, [])

  const onSave = async () => {
    if (!selectedVariant) return
    if (!config) return

    const res = await fetch("/api/update-classes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file: config.filePath,
        line: selectedVariant.line,
        classes: selectedVariant.classes,
      }),
    })
    if (res.ok) {
      console.log("[Vortex] Saved!")
    } else {
      const error = await res.json()
      console.error("[Vortex] Save failed:", error)
    }
  }

  if (!config) return <div className="p-8">Loading...</div>

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Variants grid */}
      <div className="flex-1 p-8 overflow-auto">
        <h1 className="text-2xl font-bold mb-6">Button</h1>

        {config.variants.map((variant) => (
          <section key={variant.name} className="mb-8">
            <h2 className="text-sm font-medium text-muted-foreground mb-3">{variant.name}</h2>
            <div className="flex flex-wrap gap-4">
              {variant.values.map((value) => (
                <div
                  key={value.name}
                  onClick={() =>
                    setSelectedVariant({
                      variantName: variant.name,
                      valueName: value.name,
                      classes: value.classes,
                      line: value.line,
                    })
                  }
                  className={`p-4 rounded-lg border-2 transition-colors ${
                    selectedVariant?.valueName === value.name &&
                    selectedVariant?.variantName === variant.name
                      ? "border-blue-500 bg-blue-500/10"
                      : "border-transparent hover:border-muted"
                  }`}
                >
                  <Button
                    variant={variant.name === "variant" ? (value.name as "default") : undefined}
                    size={variant.name === "size" ? (value.name as "default") : undefined}
                  >
                    {value.name}
                  </Button>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {!!selectedVariant && (
        <PropertiesPanel
          selectedVariant={selectedVariant}
          onChange={setSelectedVariant}
          onSave={onSave}
        />
      )}
    </div>
  )
}
