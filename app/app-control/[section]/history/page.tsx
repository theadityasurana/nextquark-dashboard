import { SectionHistory } from "@/components/app-control/history-screen"

export default async function SectionHistoryPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  return <SectionHistory sectionKey={decodeURIComponent(section)} />
}
