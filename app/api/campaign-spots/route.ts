import { createAdminClient } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"

export type CampaignSpot = {
  campaign: string
  label: string | null
  latitude: number
  longitude: number
  notes: string | null
  active: boolean
  updated_at?: string
}

function slugify(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export async function GET() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("campaign_spots")
    .select("campaign, label, latitude, longitude, notes, active, updated_at")
    .order("campaign")

  if (error) return NextResponse.json({ spots: [], error: error.message })
  return NextResponse.json({ spots: data ?? [], error: null })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const campaign = slugify(String(body.campaign ?? ""))
  const latitude = Number(body.latitude)
  const longitude = Number(body.longitude)
  if (!campaign) return NextResponse.json({ error: "campaign is required" }, { status: 400 })
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return NextResponse.json({ error: "latitude and longitude must be numbers" }, { status: 400 })
  }

  const row = {
    campaign,
    label: body.label ? String(body.label).trim() : campaign,
    latitude,
    longitude,
    notes: body.notes ? String(body.notes).trim() : null,
    active: body.active !== false,
    updated_at: new Date().toISOString(),
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("campaign_spots")
    .upsert(row, { onConflict: "campaign" })
    .select("campaign, label, latitude, longitude, notes, active, updated_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ spot: data })
}

export async function DELETE(request: Request) {
  const campaign = slugify(new URL(request.url).searchParams.get("campaign") || "")
  if (!campaign) return NextResponse.json({ error: "campaign is required" }, { status: 400 })

  const supabase = createAdminClient()
  const { error } = await supabase.from("campaign_spots").delete().eq("campaign", campaign)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
