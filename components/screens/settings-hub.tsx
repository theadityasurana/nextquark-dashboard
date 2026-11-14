"use client"

import { Settings2, SlidersHorizontal, ScrollText } from "lucide-react"
import { PageTabs } from "@/components/page-tabs"
import { SettingsScreen } from "@/components/screens/settings-screen"
import { AppControlOverview } from "@/components/app-control/overview-screen"
import { LogsScreen } from "@/components/screens/logs-screen"

/** Settings, App Control (remote config for the Iris app) and Logs, formerly three pages. */
export function SettingsHub() {
  return (
    <PageTabs
      tabs={[
        { value: "general", label: "General", icon: Settings2, render: () => <SettingsScreen /> },
        { value: "app-control", label: "App control", icon: SlidersHorizontal, render: () => <AppControlOverview /> },
        { value: "logs", label: "Logs", icon: ScrollText, render: () => <LogsScreen /> },
      ]}
    />
  )
}
