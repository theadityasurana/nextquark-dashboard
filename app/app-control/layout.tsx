import { AppControlToaster } from "@/components/app-control/toaster"

export default function AppControlLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <AppControlToaster />
    </>
  )
}
