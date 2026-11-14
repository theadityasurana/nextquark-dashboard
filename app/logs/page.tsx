import { redirect } from "next/navigation"

export default function LogsPage() {
  redirect("/settings?tab=logs")
}
