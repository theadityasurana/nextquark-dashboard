import { NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'

function generateToken() {
  const raw = process.env.APP_STORE_PRIVATE_KEY || ''
  const privateKey = raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw
  const now = Math.floor(Date.now() / 1000)
  return jwt.sign(
    { iss: process.env.APP_STORE_ISSUER_ID, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' },
    privateKey,
    { algorithm: 'ES256', header: { alg: 'ES256', kid: process.env.APP_STORE_KEY_ID, typ: 'JWT' } } as any
  )
}

async function asc(path: string, token: string) {
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`ASC ${path} → ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function GET() {
  try {
    const token = generateToken()

    const appsRes = await asc(
      `apps?filter[bundleId]=${process.env.APP_STORE_APP_ID}&fields[apps]=name,bundleId,primaryLocale`,
      token
    )
    const app = appsRes.data?.[0]
    if (!app) return NextResponse.json({ error: 'App not found' }, { status: 404 })

    const appId   = app.id
    const appName = app.attributes?.name

    const [versionsRes, reviewsRes] = await Promise.all([
      asc(`apps/${appId}/appStoreVersions?fields[appStoreVersions]=versionString,releaseType,createdDate&limit=50`, token).catch(() => null),
      asc(`apps/${appId}/customerReviews?limit=200&fields[customerReviews]=rating,title,body,createdDate,territory&sort=-createdDate`, token).catch(() => null),
    ])

    const versions = (versionsRes?.data ?? []).map((v: any) => ({
      version:     v.attributes?.versionString,
      releaseType: v.attributes?.releaseType,
      date:        v.attributes?.createdDate,
    }))

    const reviews = (reviewsRes?.data ?? []).map((r: any) => ({
      rating:    r.attributes?.rating,
      title:     r.attributes?.title,
      body:      r.attributes?.body,
      date:      r.attributes?.createdDate,
      territory: r.attributes?.territory,
    }))

    const totalRatings = reviewsRes?.meta?.paging?.total ?? 0
    const ratings      = reviews.map((r: any) => r.rating).filter(Boolean)
    const avgRating    = ratings.length > 0
      ? (ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length).toFixed(1)
      : null

    // Rating breakdown 1–5
    const ratingBreakdown = [5, 4, 3, 2, 1].map(star => ({
      star,
      count: ratings.filter((r: number) => r === star).length,
    }))

    // Territory breakdown
    const territoryMap = new Map<string, number>()
    reviews.forEach((r: any) => {
      if (r.territory) territoryMap.set(r.territory, (territoryMap.get(r.territory) || 0) + 1)
    })
    const byTerritory = Array.from(territoryMap.entries())
      .map(([territory, count]) => ({ territory, count }))
      .sort((a, b) => b.count - a.count)

    return NextResponse.json({
      appId,
      appName,
      bundleId:        app.attributes?.bundleId,
      currentVersion:  versions[0]?.version ?? null,
      totalVersions:   versions.length,
      avgRating,
      totalRatings,
      ratingBreakdown,
      byTerritory,
      versions,
      reviews,
    })
  } catch (err: any) {
    console.error('App Store Connect error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
