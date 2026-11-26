"use client"

import { useState } from "react"
import useSWR from "swr"
import { Panel, PanelHeader, Section } from "@/components/ui/dashboard"
import { CountryFlag } from "@/components/country-flag"
import { DotGlobe, DotLegend, WindowPicker, GLOBE_WINDOWS, toDots } from "@/components/dot-globe"

const fetcher = (u: string) => fetch(u).then(r => (r.ok ? r.json() : Promise.reject(new Error("load"))))
const n = (v: number) => v.toLocaleString()
const ago = (iso: string) => { const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 2880 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago` }

type Live = {
  window: string
  activeUsers: number
  userDots: { lat: number; lng: number; n: number }[]
  visits: number
  visitDots: { lat: number; lng: number; n: number }[]
  latest: { lat: number; lng: number; country: string | null; city: string | null; host: string; at: string }[]
  byCountry: { code: string; name: string; n: number }[]
  visitPoints: { lat: number; lng: number; gps: boolean }[]
  userPoints: { lat: number; lng: number }[]
}
type Geo = {
  totalUsers: number; located: number; countriesCount: number; worldCountries: number
  countries: { code: string; name: string; users: number }[]
  cities: { city: string; code: string | null; users: number }[]
  totalVisits: number; visitCountriesCount: number
  sources: { source: string; visits: number; countries: number; topPlaces: { city: string | null; country: string | null; visits: number }[] }[]
  domains: { host: string; visits: number }[]
  campaigns: { campaign: string; visits: number }[]
}

function Bar({ value, max, tone = "bg-chart-1" }: { value: number; max: number; tone?: string }) {
  return <div className="h-1 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${tone}`} style={{ width: `${max ? (value / max) * 100 : 0}%` }} /></div>
}

function RankList({ rows, empty }: { rows: { key: string; code: string | null; label: string; sub?: string; value: number }[]; empty: string }) {
  const max = Math.max(1, ...rows.map(r => r.value))
  if (!rows.length) return <p className="py-6 text-center text-xs text-muted-foreground">{empty}</p>
  return (
    <div className="max-h-80 overflow-y-auto px-5 py-3">
      {rows.map(r => (
        <div key={r.key} className="flex flex-col gap-1.5 py-2">
          <div className="flex items-center justify-between gap-2 text-[13px]">
            <span className="flex min-w-0 items-center gap-2"><CountryFlag code={r.code} size={16} /><span className="truncate">{r.label}</span>{r.sub && <span className="font-mono text-[10px] text-muted-foreground">{r.sub}</span>}</span>
            <span className="num font-medium">{n(r.value)}</span>
          </div>
          <Bar value={r.value} max={max} />
        </div>
      ))}
    </div>
  )
}

export function LiveNowSection() {
  const [win, setWin] = useState("30m")
  const long = GLOBE_WINDOWS.find(w => w.value === win)?.long ?? ""
  const { data, isValidating } = useSWR<Live>(`/api/marketing/live?window=${win}`, fetcher, { refreshInterval: ["30m", "1h"].includes(win) ? 20_000 : 120_000, keepPreviousData: true })
  const points = toDots(data)
  return (
    <Section
      title="Live right now"
      description={`People using Iris and visiting your landing pages · ${long}. Drag the globe to spin it.`}
      actions={<WindowPicker value={win} onChange={setWin} />}
    >
      <div className={`grid grid-cols-1 gap-4 transition-opacity lg:grid-cols-5 ${isValidating && data?.window !== win ? "opacity-60" : ""}`}>
        <Panel className="flex flex-col gap-3 overflow-hidden p-3 lg:col-span-3">
          <div className="px-2 pt-1"><DotLegend /></div>
          <DotGlobe points={points} height={500} />
        </Panel>
        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className="grid grid-cols-2 gap-3">
            <Panel className="p-4">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-success"><span className="h-2 w-2 animate-pulse rounded-full bg-success" />Active users</div>
              <div className="mt-1 text-3xl font-semibold tabular-nums">{data ? n(data.activeUsers) : "–"}</div>
              <div className="text-xs text-muted-foreground">in the app · {long}</div>
            </Panel>
            <Panel className="p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Landing visits</div>
              <div className="mt-1 text-3xl font-semibold tabular-nums">{data ? n(data.visits) : "–"}</div>
              <div className="text-xs text-muted-foreground">on your sites · {long}</div>
            </Panel>
          </div>
          <Panel className="overflow-hidden">
            <PanelHeader title="Active users by country" description={long} />
            <RankList empty="No one active in this window" rows={(data?.byCountry ?? []).map(c => ({ key: c.code, code: c.code, label: c.name, sub: c.code, value: c.n }))} />
          </Panel>
          <Panel className="overflow-hidden">
            <PanelHeader title="Latest landing visits" />
            <div className="max-h-56 overflow-y-auto divide-y divide-border">
              {(data?.latest ?? []).map((v, i) => (
                <div key={i} className="flex items-center gap-2 px-5 py-2 text-[13px]">
                  <CountryFlag code={v.country} size={16} />
                  <span className="truncate">{[v.city, v.country].filter(Boolean).join(", ") || "Unknown"}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{v.host} · {ago(v.at)}</span>
                </div>
              ))}
              {data && !data.latest.length && <p className="py-6 text-center text-xs text-muted-foreground">No visits in this window</p>}
            </div>
          </Panel>
        </div>
      </div>
    </Section>
  )
}

const useGeo = (range: string) => useSWR<Geo>(`/api/marketing/geo?range=${range === "all" ? "all" : "30d"}`, fetcher)

export function AudienceSection({ range }: { range: string }) {
  const { data } = useGeo(range)
  const label = range === "all" ? "all time" : "signed up in the last 30 days"
  return (
      <Section title="Where your users are" description={`Countries and cities of users who ${range === "all" ? "have signed up" : "signed up in the last 30 days"}, from their profile (location, else phone code)`}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel className="flex flex-col justify-center gap-2 p-6">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Global reach</div>
            <div className="text-4xl font-semibold tabular-nums">{data ? data.countriesCount : "–"}<span className="text-2xl text-muted-foreground"> / {data?.worldCountries ?? 195}</span></div>
            <div className="text-sm text-muted-foreground">countries have Iris users ({label})</div>
            {data && <div className="mt-2"><Bar value={data.countriesCount} max={data.worldCountries} tone="bg-violet-500" /></div>}
            {data && <div className="mt-3 text-xs text-muted-foreground">{n(data.located)} of {n(data.totalUsers)} users have a known country · landing visitors came from {data.visitCountriesCount} countries</div>}
          </Panel>
          <Panel className="overflow-hidden">
            <PanelHeader title="Top countries" description={`Users · ${label}`} />
            <RankList empty="No users yet" rows={(data?.countries ?? []).map(c => ({ key: c.code, code: c.code, label: c.name, sub: c.code, value: c.users }))} />
          </Panel>
          <Panel className="overflow-hidden">
            <PanelHeader title="Top cities" description={`Users · ${label}`} />
            <RankList empty="No users yet" rows={(data?.cities ?? []).map(c => ({ key: `${c.code}|${c.city}`, code: c.code, label: c.city, value: c.users }))} />
          </Panel>
        </div>
      </Section>
  )
}

export function TrafficSection({ range }: { range: string }) {
  const { data } = useGeo(range)
  const srcMax = Math.max(1, ...(data?.sources ?? []).map(s => s.visits))
  const domMax = Math.max(1, ...(data?.domains ?? []).map(s => s.visits))
  const campMax = Math.max(1, ...(data?.campaigns ?? []).map(s => s.visits))
  return (
      <Section title="Traffic sources" description={`Where landing-page visitors came from (${range === "all" ? "all time" : "last 30 days"}): referrer, or the app they opened the link in`}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel className="overflow-hidden lg:col-span-2">
            <PanelHeader title="By source" description={data ? `${n(data.totalVisits)} visits` : undefined} />
            <div className="divide-y divide-border">
              {(data?.sources ?? []).map(s => (
                <div key={s.source} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="font-medium">{s.source}</span>
                    <span className="num"><b>{n(s.visits)}</b> <span className="text-xs text-muted-foreground">· {data?.totalVisits ? Math.round((s.visits / data.totalVisits) * 100) : 0}% · {s.countries} {s.countries === 1 ? "country" : "countries"}</span></span>
                  </div>
                  <div className="mt-1.5"><Bar value={s.visits} max={srcMax} /></div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {s.topPlaces.map((p, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5"><CountryFlag code={p.country} size={14} />{[p.city, p.country].filter(Boolean).join(", ") || "Unknown"} <b className="text-foreground">{n(p.visits)}</b></span>
                    ))}
                  </div>
                </div>
              ))}
              {!data && <p className="py-6 text-center text-xs text-muted-foreground">Loading…</p>}
            </div>
          </Panel>
          <div className="flex flex-col gap-4">
            <Panel className="overflow-hidden">
              <PanelHeader title="Your domains" description="Which address people landed on" />
              <div className="px-5 py-3">
                {(data?.domains ?? []).map(d => (
                  <div key={d.host} className="flex flex-col gap-1.5 py-2">
                    <div className="flex items-center justify-between text-[13px]"><span className="truncate font-mono text-xs">{d.host}</span><span className="num font-medium">{n(d.visits)}</span></div>
                    <Bar value={d.visits} max={domMax} tone="bg-chart-2" />
                  </div>
                ))}
              </div>
            </Panel>
            <Panel className="overflow-hidden">
              <PanelHeader title="Campaigns & codes" description="?c= links, QR and influencer codes" />
              <div className="px-5 py-3">
                {(data?.campaigns ?? []).length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">None yet</p>}
                {(data?.campaigns ?? []).map(c => (
                  <div key={c.campaign} className="flex flex-col gap-1.5 py-2">
                    <div className="flex items-center justify-between text-[13px]"><span className="truncate font-mono text-xs">{c.campaign}</span><span className="num font-medium">{n(c.visits)}</span></div>
                    <Bar value={c.visits} max={campMax} tone="bg-chart-3" />
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      </Section>
  )
}
