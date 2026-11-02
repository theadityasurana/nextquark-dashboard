"use client"

import { LifeBuoy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { CANT_CHANGE } from "@/lib/remote-config/fields"

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold mb-1.5">{title}</p>
      <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">{items.map(i => <li key={i}>{i}</li>)}</ul>
    </div>
  )
}

export function HelpPanel() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="h-8"><LifeBuoy className="h-3.5 w-3.5 mr-1.5" />What can&apos;t change here?</Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>What App Control can&apos;t change</SheetTitle>
          <SheetDescription>Ask a developer for these instead.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 px-4 pb-6">
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
            <p className="font-semibold">Prices can&apos;t be changed here.</p>
            <p className="text-muted-foreground mt-0.5">They come from App Store Connect and Google Play Console. A new plan needs new store products and an app update.</p>
          </div>
          <List title="Needs an over-the-air update (minutes, no store review)" items={CANT_CHANGE.ota} />
          <List title="Needs a store build" items={CANT_CHANGE.store} />
          <List title="Lives somewhere else" items={CANT_CHANGE.elsewhere} />
          <div>
            <p className="text-xs font-semibold mb-1.5">When changes reach users</p>
            <table className="w-full text-xs">
              <tbody className="divide-y divide-border/50">
                <tr><td className="py-1.5 pr-2 font-medium align-top">App</td><td className="py-1.5 text-muted-foreground">At launch, and on returning to the app if its copy is over 5 minutes old. No restart needed.</td></tr>
                <tr><td className="py-1.5 pr-2 font-medium align-top">Splash duration</td><td className="py-1.5 text-muted-foreground">On the next launch.</td></tr>
                <tr><td className="py-1.5 pr-2 font-medium align-top">Limits</td><td className="py-1.5 text-muted-foreground">Immediately, on the next swipe, follow claim or referral. Not retroactive for existing balances.</td></tr>
                <tr><td className="py-1.5 pr-2 font-medium align-top">get-feed</td><td className="py-1.5 text-muted-foreground">Within 60 seconds.</td></tr>
              </tbody>
            </table>
          </div>
          <div>
            <p className="text-xs font-semibold mb-1.5">Which app versions obey it</p>
            <p className="text-xs text-muted-foreground">Builds that include remote config (the next store build or an OTA update). Older builds obey only <code className="font-mono">limits</code> and <code className="font-mono">job_card.header.show_location</code>, and ignore everything else until they update.</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
