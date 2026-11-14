import { redirect } from "next/navigation"

export default function AppControlPage() {
  redirect("/settings?tab=app-control")
}
