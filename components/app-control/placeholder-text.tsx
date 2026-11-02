"use client"

import { Fragment } from "react"
import { cn } from "@/lib/utils"
import { fillSample, placeholdersFor, xLength, type Path, type SampleContext } from "@/lib/remote-config/core"

/** Text with {placeholders} highlighted: known ones in primary, unusable ones in red. */
export function HighlightedText({ text, section, path, className }: { text: string; section: string; path: Path; className?: string }) {
  const allowed = new Set<string>(placeholdersFor(section, path))
  const parts = text.split(/(\{[^{}\s]+\})/g)
  return (
    <span className={cn("whitespace-pre-wrap break-words", className)}>
      {parts.map((p, i) => {
        const m = p.match(/^\{([^{}\s]+)\}$/)
        if (!m) return <Fragment key={i}>{p}</Fragment>
        const ok = allowed.has(m[1])
        return (
          <span
            key={i}
            className={cn(
              "rounded px-1 font-mono text-[0.85em]",
              ok ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive line-through decoration-destructive/50",
            )}
            title={ok ? "Filled in by the app" : "Not filled in here: shows up literally"}
          >
            {p}
          </span>
        )
      })}
    </span>
  )
}

/** Renders *bold* the way WhatsApp does, for the WhatsApp message preview. */
function WhatsAppBold({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*)/g)
  return <>{parts.map((p, i) => (/^\*[^*\n]+\*$/.test(p) ? <strong key={i}>{p.slice(1, -1)}</strong> : <Fragment key={i}>{p}</Fragment>))}</>
}

export function FilledPreview({ text, section, path, ctx, charCount }: { text: string; section: string; path: Path; ctx: SampleContext; charCount?: "x" }) {
  const filled = fillSample(text, ctx, section, path)
  const isWhatsApp = section === "copy.share" && path[0] === "whatsapp"
  const xLen = charCount === "x" ? xLength(filled) : null
  return (
    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Preview with sample values</span>
        {xLen !== null ? (
          <span className={cn("text-[10px] font-mono", xLen > 250 ? "text-warning font-semibold" : "text-muted-foreground")}>
            {xLen}/250 on X{xLen > 250 ? ": too long" : ""}
          </span>
        ) : (
          <span className="text-[10px] font-mono text-muted-foreground">{Array.from(filled).length} chars</span>
        )}
      </div>
      <p className="text-sm whitespace-pre-wrap break-words">{isWhatsApp ? <WhatsAppBold text={filled} /> : filled}</p>
    </div>
  )
}
