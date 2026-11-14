import { Suspense } from "react"
import { SettingsHub } from "@/components/screens/settings-hub"

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsHub />
    </Suspense>
  )
}
