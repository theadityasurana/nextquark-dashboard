import { redirect } from "next/navigation"

// AI Agents only re-listed Live Queue runs; its Performance view now lives there.
export default function AgentsPage() {
  redirect("/queue")
}
