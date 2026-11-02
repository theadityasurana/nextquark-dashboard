"use client"

import { Toaster } from "sonner"
import { useTheme } from "@/components/theme-provider"

export function AppControlToaster() {
  const { theme } = useTheme()
  return <Toaster theme={theme} position="bottom-right" richColors closeButton duration={6000} />
}
