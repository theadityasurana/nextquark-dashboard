"use client"

import { ArrowRight } from "lucide-react"
import { diff, formatJson, type Json } from "@/lib/remote-config/core"

/** Field-by-field old → new list. */
export function DiffView({ before, after, empty = "No changes." }: { before: Json | undefined; after: Json | undefined; empty?: string }) {
  const entries = diff(before, after)
  if (entries.length === 0) return <p className="text-xs text-muted-foreground">{empty}</p>
  return (
    <ul className="flex flex-col divide-y divide-border/50 rounded-md border border-border bg-muted/20 text-xs">
      {entries.map(e => (
        <li key={e.path.join(".")} className="px-3 py-2">
          <code className="font-mono text-[11px] text-muted-foreground">{e.path.join(".") || "(whole value)"}</code>
          <div className="mt-1 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-2">
            <span className="min-w-0 flex-1 rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-destructive/90 line-through decoration-destructive/40 whitespace-pre-wrap break-all">{formatJson(e.before)}</span>
            <ArrowRight className="hidden sm:block h-3.5 w-3.5 mt-1 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 rounded bg-success/10 px-1.5 py-0.5 font-mono text-success whitespace-pre-wrap break-all">{formatJson(e.after)}</span>
          </div>
        </li>
      ))}
    </ul>
  )
}
