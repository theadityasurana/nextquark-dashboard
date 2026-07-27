import { NextResponse } from "next/server"
import { EXPERIENCE_LEVELS, normalizeExperienceLevel } from "@/lib/job-parser"

const OLLAMA_URL = "http://localhost:11434/api/generate"
const MODEL = "llama3.2:3b"
const BATCH_SIZE = 5
const OLLAMA_TIMEOUT_MS = 30_000

const VALID_LEVELS = new Set(EXPERIENCE_LEVELS)

const SYSTEM_PROMPT = `You are a job classification expert. Given a job title and a short description, classify the experience level.

You MUST respond with EXACTLY one of these labels and nothing else:
Internship
Entry Level
Middle Level
Senior Level
Lead
Principal
Director
VP
C-Level`

async function classifyWithOllama(title: string, description: string): Promise<string | null> {
  const prompt = `Job Title: ${title}
Description: ${description.slice(0, 600)}

Respond with ONLY the experience level label.`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS)

  try {
    const res = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, prompt, system: SYSTEM_PROMPT, stream: false }),
      signal: controller.signal,
    })

    if (!res.ok) return null

    const data = await res.json()
    const raw = (data.response || "").trim()

    // Try exact match first
    if (VALID_LEVELS.has(raw)) return raw

    // Try normalizing — handles minor variations like "senior" or "entry-level"
    const normalized = normalizeExperienceLevel(raw)
    return normalized
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

export async function POST() {
  try {
    // 1. Fetch all jobs via the existing /api/jobs route
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    const fetchRes = await fetch(`${baseUrl}/api/jobs?all=true`)
    if (!fetchRes.ok) {
      return NextResponse.json({ error: "Failed to fetch jobs" }, { status: 500 })
    }

    const { data: jobs } = await fetchRes.json()
    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ message: "No jobs found", totalProcessed: 0 })
    }

    let matches = 0
    let updated = 0
    let ollamaErrors = 0
    const changes: { id: string; title: string; previousLevel: string; ollamaLevel: string }[] = []

    // 2. Process in batches of BATCH_SIZE
    for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
      const batch = jobs.slice(i, i + BATCH_SIZE)

      await Promise.all(
        batch.map(async (job: { id: string; title: string; experience: string; description?: string; detailed_requirements?: string }) => {
          const content = job.detailed_requirements || job.description || ""
          const ollamaLevel = await classifyWithOllama(job.title, content)

          if (!ollamaLevel) {
            ollamaErrors++
            return
          }

          if (ollamaLevel === job.experience) {
            matches++
            return
          }

          // Mismatch — update via PATCH /api/jobs
          const patchRes = await fetch(`${baseUrl}/api/jobs`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: job.id, experience: ollamaLevel }),
          })

          if (patchRes.ok) {
            updated++
            changes.push({
              id: job.id,
              title: job.title,
              previousLevel: job.experience,
              ollamaLevel,
            })
          } else {
            ollamaErrors++
          }
        })
      )
    }

    return NextResponse.json({
      totalProcessed: jobs.length,
      matches,
      updated,
      ollamaErrors,
      changes,
    })
  } catch (error) {
    console.error("Ollama reclassify error:", error)
    return NextResponse.json({ error: "Reclassification failed" }, { status: 500 })
  }
}
