import { Suspense } from "react"
import { MessagingHub } from "@/components/screens/messaging-hub"

export default function MessagingPage() {
  return (
    <Suspense>
      <MessagingHub />
    </Suspense>
  )
}
