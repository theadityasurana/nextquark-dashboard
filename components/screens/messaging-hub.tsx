"use client"

import { Mail, BellRing } from "lucide-react"
import { PageTabs } from "@/components/page-tabs"
import { EmailsScreen } from "@/components/screens/emails-screen"
import { NotificationsScreen } from "@/components/screens/notifications-screen"

/** Email campaigns and push notifications, formerly two pages. */
export function MessagingHub() {
  return (
    <PageTabs
      tabs={[
        { value: "email", label: "Email", icon: Mail, render: () => <EmailsScreen /> },
        { value: "notifications", label: "Push notifications", icon: BellRing, render: () => <NotificationsScreen /> },
      ]}
    />
  )
}
