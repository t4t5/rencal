import { Button } from "@/components/ui/button"

const variants = ["default", "secondary", "destructive", "outline", "ghost", "link"] as const
const sizes = ["default", "sm", "lg", "icon", "icon-sm", "icon-lg"] as const

export default function App() {
  return (
    <div className="p-8 min-h-screen bg-background text-foreground">
      <h1 className="text-2xl font-bold mb-8">Vortex</h1>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Button</h2>

        <div className="flex flex-col gap-6">
          {variants.map((variant) => (
            <div key={variant} className="flex items-center gap-4">
              <span className="w-24 text-sm text-muted-foreground">{variant}</span>
              <Button variant={variant}>Button</Button>
            </div>
          ))}
        </div>

        <h3 className="text-md font-medium mt-8 mb-4">Sizes</h3>
        <div className="flex flex-col gap-4">
          {sizes.map((size) => (
            <div key={size} className="flex items-center gap-4">
              <span className="w-24 text-sm text-muted-foreground">{size}</span>
              <Button size={size}>{size.startsWith("icon") ? "X" : "Button"}</Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
