import { FormEvent, useState } from "react"
import { FaApple, FaGoogle } from "react-icons/fa6"
import { IoArrowBack as BackIcon } from "react-icons/io5"

import { Button } from "@/components/ui/button"
import { DialogDescription, DialogHeader, DialogTitle, Modal } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

import { useConnectProvider } from "@/hooks/useConnectProvider"

type ModalStep = "select-provider" | "icloud-instructions" | "icloud-credentials"

export function AddAccountModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<ModalStep>("select-provider")
  const { connect, connectWithCredentials, isConnecting } = useConnectProvider()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGoogleConnect() {
    await connect("google")
    onClose()
  }

  async function handleICloudSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!email || !password) {
      setError("Please fill in both fields")
      return
    }

    try {
      await connectWithCredentials("icloud", [
        { id: "apple_id", value: email },
        { id: "app_password", value: password },
      ])
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect iCloud account")
    }
  }

  return (
    <Modal onClose={onClose}>
      {step === "select-provider" && (
        <>
          <DialogHeader>
            <DialogTitle>Add Calendar Account</DialogTitle>
            <DialogDescription>Choose a calendar provider to connect.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              className="justify-start gap-3 h-12 border-input"
              disabled={isConnecting}
              onClick={handleGoogleConnect}
            >
              <FaGoogle className="size-4" />
              Google Calendar
            </Button>

            <Button
              variant="outline"
              className="justify-start gap-3 h-12 border-input"
              disabled={isConnecting}
              onClick={() => setStep("icloud-instructions")}
            >
              <FaApple className="size-5" />
              iCloud Calendar
            </Button>
          </div>
        </>
      )}

      {step === "icloud-instructions" && (
        <>
          <DialogHeader>
            <DialogTitle>Connect iCloud Calendar</DialogTitle>
            <DialogDescription>
              iCloud requires an App-Specific Password. This is a separate password you generate in
              your Apple account settings.
            </DialogDescription>
          </DialogHeader>

          <ol className="flex flex-col gap-2 text-sm text-muted-foreground list-decimal list-inside">
            <li>
              Go to{" "}
              <a
                href="https://account.apple.com/sign-in"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground underline underline-offset-4"
              >
                account.apple.com
              </a>
            </li>
            <li>Navigate to Sign-In and Security &gt; App-Specific Passwords</li>
            <li>Generate a new password for &ldquo;Rencal&rdquo;</li>
          </ol>

          <Button onClick={() => setStep("icloud-credentials")}>
            I Have My App-Specific Password
          </Button>
        </>
      )}

      {step === "icloud-credentials" && (
        <>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon-sm" onClick={() => setStep("icloud-instructions")}>
                <BackIcon className="size-4" />
              </Button>
              <DialogTitle>iCloud Credentials</DialogTitle>
            </div>
            <DialogDescription>
              Enter your Apple ID email and the app-specific password you generated.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleICloudSubmit} noValidate className="flex flex-col gap-3">
            <Input
              type="email"
              placeholder="Apple ID email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border-input"
            />

            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="App-Specific Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border-input pr-16"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" disabled={isConnecting}>
              {isConnecting ? "Connecting..." : "Connect iCloud Account"}
            </Button>
          </form>
        </>
      )}
    </Modal>
  )
}
