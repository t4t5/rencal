import { Button } from "@/components/ui/button"

export function ActionBar() {
  return (
    <div className="p-4 flex justify-between">
      <Button variant="secondary">+</Button>
      <Button variant="secondary">Search</Button>
    </div>
  )
}
