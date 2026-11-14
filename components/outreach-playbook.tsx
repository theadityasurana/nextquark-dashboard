"use client"

import { useState } from "react"
import { ArrowRight, Check, Copy, Lightbulb } from "lucide-react"
import { Input } from "@/components/ui/input"
import { fillName, PLAYBOOK, PRICES } from "@/lib/outreach-playbook"

function CopyMessage({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 1200)
        } catch {}
      }}
      className="inline-flex items-center gap-1 rounded border border-border px-2 h-7 text-xs text-muted-foreground hover:text-foreground hover:border-border transition-colors"
    >
      {done ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? "Copied" : "Copy"}
    </button>
  )
}

export function ReplyPlaybook({ initialName = "" }: { initialName?: string }) {
  const [name, setName] = useState(initialName)
  const [highlight, setHighlight] = useState<string | null>(null)

  const jump = (id: string) => {
    setHighlight(id)
    document.getElementById(`step-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
    setTimeout(() => setHighlight((h) => (h === id ? null : h)), 2000)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium">Find what they replied, copy the follow-up, then follow the arrow to the next step.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Goal is premium, but it stays helpful and honest. Prices come from the live plan catalog: Starter {PRICES.starter.monthly},
            Pro {PRICES.pro.monthly}, Ultra {PRICES.ultra.monthly}/month, as low as {PRICES.lowestPerApp} per application on quarterly.
          </p>
        </div>
        <div className="sm:w-56">
          <label className="text-xs text-muted-foreground">Their name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Riya" className="h-8 text-sm mt-1" />
        </div>
      </div>

      {PLAYBOOK.map((stage) => (
        <section key={stage.title} className="flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-semibold">{stage.title}</h2>
            <p className="text-xs text-muted-foreground">{stage.subtitle}</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {stage.steps.map((step) => {
              const text = fillName(step.message, name)
              return (
                <div
                  key={step.id}
                  id={`step-${step.id}`}
                  className={`rounded-lg border p-4 flex flex-col gap-3 transition-colors ${highlight === step.id ? "border-primary ring-2 ring-primary/30" : "border-border bg-card"}`}
                >
                  <div>
                    <p className="text-xs text-muted-foreground">If they say</p>
                    <p className="text-sm font-medium mt-0.5">{step.trigger}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {step.examples.map((ex) => (
                        <span key={ex} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">“{ex}”</span>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-md bg-emerald-500/[0.06] border border-emerald-500/20 p-3">
                    <p className="text-xs text-emerald-700 dark:text-emerald-400 mb-1">You send</p>
                    <p className="text-sm leading-relaxed whitespace-pre-line">{text}</p>
                  </div>
                  {step.tip && (
                    <p className="text-xs text-muted-foreground flex gap-1.5">
                      <Lightbulb className="h-3.5 w-3.5 shrink-0 text-amber-500 mt-px" /> {step.tip}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-auto">
                    <CopyMessage text={text} />
                    {step.next?.map((n) => (
                      <button
                        key={n.to}
                        type="button"
                        onClick={() => jump(n.to)}
                        className="inline-flex items-center gap-1 rounded-full border border-border px-2 h-7 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                      >
                        {n.label} <ArrowRight className="h-3 w-3" />
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
