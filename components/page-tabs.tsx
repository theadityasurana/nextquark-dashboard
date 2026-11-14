"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"

export type PageTab = { value: string; label: string; icon?: React.ElementType; render: () => React.ReactNode }

/**
 * Several former pages under one route, switched by ?tab= so each section keeps
 * a shareable URL and old links can redirect straight to the right tab.
 */
export function PageTabs({ tabs }: { tabs: PageTab[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const current = tabs.find((t) => t.value === params.get("tab")) ?? tabs[0]

  return (
    <div className="flex flex-col gap-8">
      <div className="-mb-2 border-b border-border">
        <div className="-mb-px flex gap-1 overflow-x-auto scrollbar-hide">
          {tabs.map((t) => (
            <button
              key={t.value}
              onClick={() => router.replace(t.value === tabs[0].value ? pathname : `${pathname}?tab=${t.value}`, { scroll: false })}
              className={cn(
                "flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                current.value === t.value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.icon && <t.icon className="h-4 w-4" />}
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div key={current.value}>{current.render()}</div>
    </div>
  )
}
