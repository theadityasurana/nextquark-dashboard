"use client"

// Mock previews of Iris screens (doc §8.5). They approximate the app's layout
// so text and ordering edits can be checked before saving; they aren't
// pixel-exact (visual design isn't controlled by remote config).

import { Send, UserPlus, Gift, Copy, Instagram, Twitter, Linkedin, MessageCircle, Share2, Globe, Clock, Check, MapPin, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { effective, fillSample, type ConfigRow, type Json, type Path, type SampleContext } from "@/lib/remote-config/core"

type Rows = Record<string, ConfigRow | undefined>

function reader(rows: Rows, key: string) {
  const r = rows[key]
  return (path: Path): Json | undefined => (r ? effective(r.value, r.default_value, path) : undefined)
}
const str = (v: Json | undefined, d = "") => (typeof v === "string" ? v : d)
const strs = (v: Json | undefined) => (Array.isArray(v) ? (v.filter(x => typeof x === "string") as string[]) : [])

function Phone({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="w-full max-w-[340px] rounded-[28px] border border-border/70 bg-[#0b0b10] p-2 shadow-xl">
        <div className="rounded-[22px] bg-[#111118] text-white overflow-hidden">{children}</div>
      </div>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label} · mock preview</span>
    </div>
  )
}

const PLATFORM_ICON: Record<string, typeof Instagram> = { instagram: Instagram, twitter: Twitter, linkedin: Linkedin }

export function FreeSwipesPreview({ rows, ctx }: { rows: Rows; ctx: SampleContext }) {
  const c = reader(rows, "copy.free_swipes")
  const f = reader(rows, "features")
  const s = reader(rows, "social")
  const t = (k: string) => fillSample(str(c([k])), ctx, "copy.free_swipes", [k])
  const steps = strs(c(["steps"])).slice(0, 8)
  const stepIcons = [Send, UserPlus, Gift]
  const targets = strs(f(["share_targets"]))
  const followOn = f(["social_follow_enabled"]) !== false
  const moreOn = f(["show_more_share_options"]) !== false || targets.length === 0
  const items = Array.isArray(s(["follow_items"])) ? (s(["follow_items"]) as { platform?: string; label?: string }[]) : []
  const shareLabel: Record<string, string> = { story: t("share_story"), x: t("share_x"), whatsapp: t("share_whatsapp") }
  const shareIcon: Record<string, typeof Instagram> = { story: Instagram, x: Twitter, whatsapp: MessageCircle }

  return (
    <Phone label="Free Swipes sheet">
      <div className="px-5 pt-3 pb-5 flex flex-col gap-4">
        <div className="mx-auto h-1 w-10 rounded-full bg-white/20" />
        <div className="text-center">
          <h3 className="text-lg font-bold">{t("title")}</h3>
          <p className="text-xs text-white/60 mt-1">{t("subtitle")}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center">
          <p className="text-[10px] tracking-widest text-white/50">{t("code_label")}</p>
          <p className="text-xl font-mono font-bold tracking-[0.2em] my-1">ADIT4K2Q</p>
          <span className="inline-flex items-center gap-1 rounded-full bg-white text-black px-3 py-1 text-xs font-semibold"><Copy className="h-3 w-3" />{t("copy_button")}</span>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-white/60">
            <div><p className="text-base font-bold text-white">3</p>{t("stat_friends")}</div>
            <div><p className="text-base font-bold text-white">{ctx.referral_reward * 3}</p>{t("stat_swipes")}</div>
          </div>
        </div>
        {targets.length > 0 && (
          <div className={cn("grid gap-2", targets.length === 1 ? "grid-cols-1" : targets.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
            {targets.map(k => {
              const Icon = shareIcon[k] ?? Share2
              return <div key={k} className="flex flex-col items-center gap-1 rounded-xl bg-white/5 py-2 text-[10px]"><Icon className="h-4 w-4" />{shareLabel[k] ?? k}</div>
            })}
          </div>
        )}
        {moreOn && <p className="text-center text-[11px] text-white/60 underline underline-offset-2">{t("more_share")}</p>}
        <div>
          <p className="text-sm font-semibold mb-2">{t("how_title")}</p>
          <ol className="flex flex-col gap-2">
            {steps.map((st, i) => {
              const Icon = stepIcons[Math.min(i, 2)]
              return (
                <li key={i} className="flex items-center gap-2.5 text-xs">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-violet-300"><Icon className="h-3.5 w-3.5" /></span>
                  {fillSample(st, ctx, "copy.free_swipes", ["steps", String(i)])}
                </li>
              )
            })}
          </ol>
        </div>
        {followOn && (
          <div>
            <p className="text-sm font-semibold">{t("follow_title")}</p>
            <p className="text-[11px] text-white/60 mb-2">{t("follow_subtitle")}</p>
            <div className="flex flex-col gap-1.5">
              {items.filter(it => it.platform && PLATFORM_ICON[it.platform]).map((it, i) => {
                const Icon = PLATFORM_ICON[it.platform!]
                return (
                  <div key={i} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs">
                    <Icon className="h-4 w-4" /> <span className="flex-1 truncate">{it.label}</span>
                    {i === 0
                      ? <span className="flex items-center gap-1 text-[10px] text-emerald-400"><Check className="h-3 w-3" />{t("follow_claimed")}</span>
                      : <span className="rounded-full bg-emerald-500/20 text-emerald-300 px-2 py-0.5 text-[10px]">{t("follow_badge")}</span>}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </Phone>
  )
}

export function OutOfSwipesPreview({ rows, ctx }: { rows: Rows; ctx: SampleContext }) {
  const c = reader(rows, "copy.out_of_swipes")
  const f = reader(rows, "features")
  const t = (k: string) => fillSample(str(c([k])), ctx, "copy.out_of_swipes", [k])
  const badge = t("premium_badge")
  const followOn = f(["social_follow_enabled"]) !== false
  return (
    <Phone label="Out-of-swipes sheet">
      <div className="px-5 pt-3 pb-5 flex flex-col gap-3.5">
        <div className="mx-auto h-1 w-10 rounded-full bg-white/20" />
        <div className="text-center">
          <h3 className="text-lg font-bold">{t("title")}</h3>
          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-[11px] text-white/80"><Clock className="h-3 w-3" />{t("reset_countdown")}</span>
          <p className="text-[10px] text-white/40 mt-1">(unknown reset time: {t("reset_soon")})</p>
          <p className="text-xs text-white/60 mt-2">{t("body")}</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-zinc-900 to-black border border-white/10 p-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-amber-300" />{t("premium_title")}</p>
            {badge && <span className="rounded-full bg-amber-300 text-black text-[9px] font-bold px-2 py-0.5">{badge}</span>}
          </div>
          <ul className="mt-2 flex flex-col gap-1 text-xs text-white/80">
            {strs(c(["premium_benefits"])).map((b, i) => <li key={i} className="flex gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />{fillSample(b, ctx, "copy.out_of_swipes", ["premium_benefits", String(i)])}</li>)}
          </ul>
          <div className="mt-3 rounded-full bg-white text-black text-center text-xs font-semibold py-2">{t("premium_cta")}</div>
        </div>
        <p className="text-[10px] tracking-widest text-white/50 uppercase">{t("free_title")}</p>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2"><UserPlus className="h-4 w-4" /><div><p className="text-xs font-medium">{t("invite_title")}</p><p className="text-[10px] text-white/60">{t("invite_body")}</p></div></div>
          {followOn && <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2"><Instagram className="h-4 w-4" /><div><p className="text-xs font-medium">{t("follow_title")}</p><p className="text-[10px] text-white/60">{t("follow_body")}</p></div></div>}
        </div>
        <p className="text-center text-xs text-white/50">{t("later")}</p>
      </div>
    </Phone>
  )
}

const SAMPLE_CHIPS: Record<string, string> = {
  industry: "Fintech", company_type: "Startup", employment_type: "Full-time", location_type: "Hybrid",
  experience: "2–4 yrs", posted: "2d ago", salary: "₹18–24 LPA", level: "Mid", requirements: "Figma",
  education: "Bachelor's", work_authorization: "No visa needed",
}
const CHIP_COLORS = ["bg-sky-500/15 text-sky-300", "bg-violet-500/15 text-violet-300", "bg-emerald-500/15 text-emerald-300", "bg-amber-500/15 text-amber-300", "bg-pink-500/15 text-pink-300"]
const SAMPLE_SECTIONS: Record<string, string[]> = {
  requirements: ["3+ years of product design", "Strong Figma and prototyping", "Shipped consumer mobile apps", "Comfortable with user research", "Portfolio of end-to-end work"],
  fit_writeup: ["Your fintech app work and Figma depth match what this team needs."],
  skills: ["Figma", "Prototyping", "Design systems", "User research"],
  benefits: ["Health insurance", "Flexible hours", "Learning budget"],
}

export function JobCardPreview({ rows }: { rows: Rows }) {
  const j = reader(rows, "job_card")
  const chipOrder = strs(j(["chips", "order"]))
  const chipHidden = new Set(strs(j(["chips", "hidden"])))
  const secOrder = strs(j(["sections", "order"]))
  const secHidden = new Set(strs(j(["sections", "hidden"])))
  const limit = typeof j(["sections", "requirements_limit"]) === "number" ? Math.max(0, j(["sections", "requirements_limit"]) as number) : 4
  const title = (k: string) => str(j(["sections", "titles", k]), k)
  const chips = chipOrder.filter(c => !chipHidden.has(c) && SAMPLE_CHIPS[c])
  const sections = secOrder.filter(s => !secHidden.has(s) && SAMPLE_SECTIONS[s])
  const showAbout = sections.length === 0 && !secHidden.has("about")

  return (
    <Phone label="Job card">
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 shrink-0 rounded-xl bg-gradient-to-br from-violet-500 to-sky-500 flex items-center justify-center font-bold">A</div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-tight">Product Designer</p>
            <p className="text-xs text-white/60 flex items-center gap-1">Acme {j(["header", "show_linkedin"]) !== false && <Linkedin className="h-3 w-3 text-sky-400" />}</p>
            {j(["header", "show_location"]) === true && <p className="text-[11px] text-white/50 flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3" />Bengaluru, India</p>}
          </div>
          {j(["header", "show_match_badge"]) !== false && <span className="rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold px-2 py-0.5" title="Hidden on the swipe deck; shown on other screens">92% match</span>}
        </div>
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c, i) => <span key={c} className={cn("rounded-full px-2 py-0.5 text-[10px]", CHIP_COLORS[i % CHIP_COLORS.length])}>{SAMPLE_CHIPS[c]}</span>)}
          </div>
        )}
        {sections.map(s => {
          const lines = s === "requirements" ? SAMPLE_SECTIONS[s].slice(0, limit) : SAMPLE_SECTIONS[s]
          return (
            <div key={s}>
              <p className="text-xs font-semibold mb-1">{title(s)}{s === "fit_writeup" && <span className="ml-1 font-normal text-white/40">(only on some screens)</span>}</p>
              {s === "skills" ? (
                <div className="flex flex-wrap gap-1">{lines.map(l => <span key={l} className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px]">{l}</span>)}</div>
              ) : s === "fit_writeup" ? (
                <p className="text-[11px] text-white/70">{lines[0]}</p>
              ) : (
                <ul className="text-[11px] text-white/70 list-disc pl-4 space-y-0.5">{lines.map(l => <li key={l}>{l}</li>)}</ul>
              )}
            </div>
          )
        })}
        {showAbout && <div><p className="text-xs font-semibold mb-1">{title("about")}</p><p className="text-[11px] text-white/70">Fallback shown when a job has no requirements, skills or benefits.</p></div>}
        <div className="flex items-center gap-2 pt-1">
          <div className="flex-1 rounded-full bg-white/5 text-center text-[11px] text-white/50 py-1.5">{str(j(["hint_text"]))}</div>
          {j(["show_link_button"]) !== false && <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-500"><Globe className="h-4 w-4" /></span>}
          {j(["show_share_button"]) !== false && <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10"><Share2 className="h-4 w-4" /></span>}
        </div>
      </div>
    </Phone>
  )
}

const MESSAGES: { key: string; label: string }[] = [
  { key: "x", label: "Post on X" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "story", label: "Instagram Story sticker" },
  { key: "image_caption", label: "Image caption" },
  { key: "invite_message", label: "Invite message" },
  { key: "job_share", label: "Job share" },
]

export function SharePreview({ rows, ctx }: { rows: Rows; ctx: SampleContext }) {
  const c = reader(rows, "copy.share")
  const base = str(c(["invite_link_base"]), ctx.invite_link_base)
  const local = { ...ctx, invite_link_base: base }
  return (
    <div className="flex flex-col gap-2.5">
      {MESSAGES.map(m => (
        <div key={m.key} className="rounded-2xl rounded-bl-sm bg-emerald-950/40 border border-emerald-500/20 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-emerald-300/80 mb-1">{m.label}</p>
          <p className="text-xs whitespace-pre-wrap break-words">{fillSample(str(c([m.key])), local, "copy.share", [m.key])}</p>
        </div>
      ))}
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground text-center">Messages as sent · sample code ADIT4K2Q</span>
    </div>
  )
}
