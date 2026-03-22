import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  return NextResponse.json(
    { error: "Scraper is not available. Browser-based scraping is not yet implemented.", jobs: [] },
    { status: 501 }
  )
}
