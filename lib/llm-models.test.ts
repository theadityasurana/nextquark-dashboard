import { describe, it, expect } from "vitest"
import { emitsOnlyText } from "./llm-models"

// Every payload below is copied verbatim from OpenRouter's live catalogue
// (GET /api/v1/models), not invented — the whole bug was that the real shape
// did not match what the filter assumed.

describe("emitsOnlyText — keeping generators out of the text chain", () => {
  // The one that broke it. Lyria generates MUSIC, is priced at zero, and lists
  // "text" among its outputs — so a price filter let it in and an
  // includes("text") filter kept it in. It reached a live chain used for
  // reading job-application forms and failed on every field, twice.
  it("rejects Lyria, which lists text AND audio as outputs", () => {
    expect(emitsOnlyText({
      id: "google/lyria-3-pro-preview",
      architecture: {
        modality: "text+image->text+audio",
        input_modalities: ["text", "image"],
        output_modalities: ["text", "audio"],
      },
    })).toBe(false)

    expect(emitsOnlyText({
      id: "google/lyria-3-clip-preview",
      architecture: {
        modality: "text+image->text+audio",
        output_modalities: ["text", "audio"],
      },
    })).toBe(false)
  })

  it("keeps a multimodal-INPUT chat model, which is fine", () => {
    // Gemma takes text+image+video in and emits only text. Input modality is
    // irrelevant; what matters is what comes back out.
    expect(emitsOnlyText({
      id: "google/gemma-4-31b-it:free",
      architecture: {
        modality: "text+image+video->text",
        input_modalities: ["image", "text", "video"],
        output_modalities: ["text"],
      },
    })).toBe(true)
  })

  it("falls back to the modality string when output_modalities is absent", () => {
    expect(emitsOnlyText({ architecture: { modality: "text->text" } })).toBe(true)
    expect(emitsOnlyText({ architecture: { modality: "text->audio" } })).toBe(false)
    expect(emitsOnlyText({ architecture: { modality: "text+image->text+image" } })).toBe(false)
  })

  it("keeps unlabelled entries rather than silently shrinking the chain", () => {
    // An entry with no architecture block is far more likely an ordinary chat
    // model than a generator. Dropping these would quietly reduce the fallback
    // chain, which is the failure mode this whole list exists to prevent.
    expect(emitsOnlyText({ id: "some/new-model:free" })).toBe(true)
    expect(emitsOnlyText({ id: "x", architecture: {} })).toBe(true)
    expect(emitsOnlyText(null)).toBe(true)
  })
})
