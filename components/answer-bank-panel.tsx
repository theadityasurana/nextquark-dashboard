"use client"

/**
 * The answer bank for one candidate, plus what this run couldn't cover.
 *
 * The gaps are the point. Every unanswered question is one the LLM had to
 * improvise (or, if sensitive, one that was left blank) — answering it here once
 * removes it from every future application for this candidate.
 */

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Lock, MessageSquarePlus, Sparkles, Trash2, TriangleAlert } from "lucide-react"

interface StoredAnswer {
  question: string
  answer: string
  intent: string | null
  source: "derived" | "captured" | "operator"
  is_sensitive: boolean
  times_used: number
}

const SOURCE_LABEL: Record<StoredAnswer["source"], { label: string; hint: string }> = {
  derived: { label: "derived", hint: "Computed from the candidate's profile" },
  captured: { label: "captured", hint: "Answered by a human at review" },
  operator: { label: "operator", hint: "Entered here in the dashboard" },
}

export function AnswerBankPanel({
  userId,
  unanswered,
  needsHuman,
  coveragePercent,
  llmAnsweredCount,
}: {
  userId: string
  unanswered?: string[] | null
  needsHuman?: string[] | null
  coveragePercent?: number | null
  llmAnsweredCount?: number | null
}) {
  const [answers, setAnswers] = useState<StoredAnswer[] | null>(null)
  const [available, setAvailable] = useState(true)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)

  const load = async () => {
    try {
      const res = await fetch(`/api/answer-bank?userId=${encodeURIComponent(userId)}`)
      const data = await res.json()
      setAnswers(data.answers ?? [])
      setAvailable(data.available !== false)
    } catch {
      setAnswers([])
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const save = async (question: string) => {
    const answer = drafts[question]?.trim()
    if (!answer) return
    setSaving(question)
    try {
      await fetch("/api/answer-bank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, question, answer }),
      })
      setDrafts((d) => {
        const next = { ...d }
        delete next[question]
        return next
      })
      await load()
    } finally {
      setSaving(null)
    }
  }

  const remove = async (question: string) => {
    await fetch(
      `/api/answer-bank?userId=${encodeURIComponent(userId)}&question=${encodeURIComponent(question)}`,
      { method: "DELETE" }
    )
    await load()
  }

  if (answers === null) return null

  if (!available) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center">
        <p className="text-xs text-muted-foreground">
          Answer bank unavailable — apply{" "}
          <code className="font-mono">scripts/056_add_answer_bank.sql</code> to enable it.
        </p>
      </div>
    )
  }

  const gaps = unanswered ?? []
  const sensitiveGaps = new Set(needsHuman ?? [])

  return (
    <div className="flex flex-col gap-5">
      {/* This run's answer economics. */}
      {(coveragePercent != null || llmAnsweredCount != null) && (
        <div className="flex flex-wrap items-center gap-2">
          {coveragePercent != null && (
            <Badge variant="outline" className="text-[10px]">
              {coveragePercent}% answered from bank
            </Badge>
          )}
          {llmAnsweredCount != null && llmAnsweredCount > 0 && (
            <Badge variant="outline" className="text-[10px] text-orange-500 border-orange-500/30 gap-1">
              <Sparkles className="h-2.5 w-2.5" />
              {llmAnsweredCount} improvised by the model
            </Badge>
          )}
          {sensitiveGaps.size > 0 && (
            <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30 gap-1">
              <Lock className="h-2.5 w-2.5" />
              {sensitiveGaps.size} left blank (sensitive)
            </Badge>
          )}
        </div>
      )}

      {/* Gaps — answering one here removes it from every future application. */}
      {gaps.length > 0 && (
        <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
          <div className="mb-2 flex items-center gap-2">
            <MessageSquarePlus className="h-3.5 w-3.5 shrink-0 text-orange-600" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-600">
              Unanswered on this run
            </span>
          </div>
          <p className="mb-3 text-[11px] text-muted-foreground">
            Answer once here and it&apos;s reused on every future application for this candidate.
          </p>
          <div className="flex flex-col gap-3">
            {gaps.map((q) => (
              <div key={q} className="flex flex-col gap-1.5">
                <div className="flex items-start gap-1.5">
                  {sensitiveGaps.has(q) && (
                    <Lock className="mt-0.5 h-3 w-3 shrink-0 text-destructive" aria-label="sensitive" />
                  )}
                  <p className="text-[11px] font-medium leading-relaxed">{q}</p>
                </div>
                {sensitiveGaps.has(q) && (
                  <p className="text-[10px] text-destructive">
                    Sensitive — never auto-answered. This was left blank on the form.
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Answer…"
                    className="h-7 flex-1 text-xs"
                    value={drafts[q] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [q]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void save(q)
                    }}
                  />
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={!drafts[q]?.trim() || saving === q}
                    onClick={() => void save(q)}
                  >
                    {saving === q ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* The bank itself. */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Stored answers
          </span>
          <Badge variant="outline" className="text-[10px]">
            {answers.length}
          </Badge>
        </div>

        {answers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <p className="text-xs text-muted-foreground">
              No stored answers yet. They accumulate as applications are run.
            </p>
          </div>
        ) : (
          answers.map((a) => (
            <div key={a.question} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-1.5">
                    {a.is_sensitive && (
                      <Lock className="mt-0.5 h-3 w-3 shrink-0 text-destructive" aria-label="sensitive" />
                    )}
                    <p className="text-[11px] font-medium leading-relaxed break-words">{a.question}</p>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground break-words">
                    {a.answer}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-destructive"
                  onClick={() => void remove(a.question)}
                  aria-label="Delete answer"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge
                  variant="outline"
                  className="text-[9px] text-muted-foreground"
                  title={SOURCE_LABEL[a.source]?.hint}
                >
                  {SOURCE_LABEL[a.source]?.label ?? a.source}
                </Badge>
                {a.intent && (
                  <Badge variant="outline" className="text-[9px] text-muted-foreground">
                    {a.intent}
                  </Badge>
                )}
                {a.times_used > 0 && (
                  <span className="text-[9px] text-muted-foreground tabular-nums">
                    used {a.times_used}×
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {sensitiveGaps.size > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-border p-3">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Sensitive questions — citizenship, criminal history, security clearance, health, salary
            history — are never answered from a fuzzy match or by the model. They must be answered by
            the candidate or an operator, and until then the form field is left blank.
          </p>
        </div>
      )}
    </div>
  )
}
