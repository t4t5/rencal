import { Settings } from "@/components/settings/Settings"

export function SettingsPage() {
  return (
    <div className="flex flex-col p-4 gap-4">
      <div data-tauri-drag-region className="flex items-center h-8">
        <h1 className="font-bold text-lg" data-tauri-drag-region>
          Accounts
        </h1>
      </div>
      <Settings />
    </div>
  )
}
