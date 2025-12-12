import { Button } from "@/components/ui/button"

export default function App() {
  return (
    <div className="p-8 min-h-screen bg-background text-foreground">
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Button</h2>

        <Button variant="default">Button</Button>
      </section>
    </div>
  )
}
