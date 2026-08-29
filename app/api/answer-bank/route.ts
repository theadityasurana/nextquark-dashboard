import { createClient } from "@/lib/supabase/server"
import { normalizeQuestion, questionIntent, isSensitiveQuestion } from "@/lib/application-answers"

export const dynamic = "force-dynamic"

/**
 * The answer bank for one candidate.
 *
 * Unlike the MCP surface, this is the operator dashboard, so sensitive answers
 * are returned in full — an operator reviewing what we told employers on a
 * candidate's behalf needs to see the actual values. The `is_sensitive` flag
 * still travels with each row so the UI can mark them.
 */
export async function GET(request: Request) {
  try {
    const userId = new URL(request.url).searchParams.get("userId")
    if (!userId) return Response.json({ error: "Missing userId" }, { status: 400 })

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("application_answers")
      .select("*")
      .eq("user_id", userId)
      .order("times_used", { ascending: false })

    if (error) {
      return Response.json({ answers: [], available: false, reason: error.message })
    }
    return Response.json({ answers: data ?? [], available: true })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

/**
 * Add or correct an answer. Upserts on (user_id, normalized_question), so
 * answering the same question again replaces rather than duplicates.
 *
 * Answers written here are tagged `operator` — distinct from `derived`
 * (computed from the profile) and `captured` (given by the candidate at review),
 * so it stays auditable who actually said what.
 */
export async function POST(request: Request) {
  try {
    const { userId, question, answer } = await request.json()
    if (!userId || !question?.trim() || !answer?.trim()) {
      return Response.json({ error: "userId, question and answer are required" }, { status: 400 })
    }

    const supabase = await createClient()
    const { error } = await supabase.from("application_answers").upsert(
      {
        user_id: userId,
        question: question.trim(),
        normalized_question: normalizeQuestion(question),
        intent: questionIntent(question),
        answer: answer.trim(),
        source: "operator",
        is_sensitive: isSensitiveQuestion(question),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,normalized_question" }
    )
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ success: true })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

/** Remove an answer. The next run falls back to derived or the LLM. */
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url)
    const userId = url.searchParams.get("userId")
    const question = url.searchParams.get("question")
    if (!userId || !question) {
      return Response.json({ error: "userId and question are required" }, { status: 400 })
    }

    const supabase = await createClient()
    const { error } = await supabase
      .from("application_answers")
      .delete()
      .eq("user_id", userId)
      .eq("normalized_question", normalizeQuestion(question))
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ success: true })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
