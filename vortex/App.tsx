import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"

import type { CvaConfig } from "./parse-cva"

export default function App() {
  const [config, setConfig] = useState<CvaConfig | null>(null)
  const [selectedVariant, setSelectedVariant] = useState<{
    variantName: string
    valueName: string
    classes: string
    line: number
  } | null>(null)

  useEffect(() => {
    fetch("/api/cva-config?file=./src/components/ui/button.tsx")
      .then((res) => res.json())
      .then((data) => setConfig(data[0]))
  }, [])

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
                <button
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
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Properties panel */}
      <div className="w-80 border-l border-border p-4 overflow-auto">
        <h2 className="font-semibold mb-4">Properties</h2>

        {selectedVariant ? (
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-sm text-muted-foreground">Variant</label>
              <div className="font-mono text-sm">
                {selectedVariant.variantName}.{selectedVariant.valueName}
              </div>
            </div>

            <div>
              <label className="text-sm text-muted-foreground">Line</label>
              <div className="font-mono text-sm">{selectedVariant.line}</div>
            </div>

            <div>
              <label className="text-sm text-muted-foreground">Classes</label>
              <div className="font-mono text-xs bg-muted p-2 rounded mt-1 break-all">
                {selectedVariant.classes}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Select a variant to view its properties</p>
        )}
      </div>
    </div>
  )
}
