"use client"

import dynamic from "next/dynamic"

const QueueScreen = dynamic(
  () => import("@/components/screens/queue-screen").then(m => m.QueueScreen),
  { ssr: false }
)

export default function QueueClientWrapper() {
  return <QueueScreen />
}
