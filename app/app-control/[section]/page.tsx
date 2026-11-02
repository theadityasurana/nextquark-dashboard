import { SectionEditor } from "@/components/app-control/section-editor-screen"

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  return <SectionEditor sectionKey={decodeURIComponent(section)} />
}
