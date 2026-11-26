"use client"

import { Settings2, SlidersHorizontal, ScrollText, FlaskConical, Megaphone } from "lucide-react"
import { PageTabs } from "@/components/page-tabs"
import { SettingsScreen } from "@/components/screens/settings-screen"
import { AppControlOverview } from "@/components/app-control/overview-screen"
import { LogsScreen } from "@/components/screens/logs-screen"
import { WebExperimentsScreen } from "@/components/screens/web-experiments-screen"
import { IrisReferralsScreen } from "@/components/screens/iris-referrals-screen"

/** Settings, App Control (remote config for the Iris app), website Experiments and Referrals, and Logs. */
export function SettingsHub() {
  return (
    <PageTabs
      tabs={[
        { value: "general", label: "General", icon: Settings2, render: () => <SettingsScreen /> },
        { value: "app-control", label: "App control", icon: SlidersHorizontal, render: () => <AppControlOverview /> },
        { value: "experiments", label: "Experiments", icon: FlaskConical, render: () => <WebExperimentsScreen /> },
        { value: "referrals", label: "Referrals", icon: Megaphone, render: () => <IrisReferralsScreen /> },
        { value: "logs", label: "Logs", icon: ScrollText, render: () => <LogsScreen /> },
      ]}
    />
  )
}
