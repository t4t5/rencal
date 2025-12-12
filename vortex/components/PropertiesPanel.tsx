export interface VariantData {
  variantName: string
  valueName: string
  classes: string
  line: number
}

export function PropertiesPanel({
  selectedVariant,
  onChange,
  onSave,
}: {
  selectedVariant: VariantData
  onChange: (updated: VariantData) => void
  onSave: () => Promise<void>
}) {
  return (
    <div className="w-80 border-l border-border p-4 overflow-auto">
      <h2 className="font-semibold mb-4">Properties</h2>

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
          <textarea
            value={selectedVariant.classes}
            onChange={(e) => onChange({ ...selectedVariant, classes: e.target.value })}
            className="w-full font-mono text-xs bg-muted p-2 rounded mt-1 min-h-24 resize-y"
          />
          <button
            onClick={onSave}
            className="mt-2 px-3 py-1.5 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
