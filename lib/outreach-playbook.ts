/**
 * Reply playbook for Sales & Outreach: what a user might reply to the first
 * founder message, and what to send next, step by step toward premium.
 *
 * Prices and per-application costs come from lib/plans.ts so the messages stay
 * true when prices change. Assumes one plan credit = one application.
 */

import { PLAN_BY_ID, FREE_SWIPES_PER_CYCLE } from "@/lib/plans"

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`
const perAppMonthly = (id: "starter" | "pro" | "ultra") => PLAN_BY_ID[id].IN.monthly / PLAN_BY_ID[id].credits
const perAppQuarterly = (id: "starter" | "pro" | "ultra") => PLAN_BY_ID[id].IN.quarterly / (PLAN_BY_ID[id].credits * 3)
const fmtPerApp = (n: number) => (Number.isInteger(Math.round(n * 10) / 10) ? `₹${Math.round(n)}` : `₹${n.toFixed(1)}`)

export const PRICES = (() => {
  const s = PLAN_BY_ID.starter, p = PLAN_BY_ID.pro, u = PLAN_BY_ID.ultra
  const lowest = Math.min(...(["starter", "pro", "ultra"] as const).flatMap((id) => [perAppMonthly(id), perAppQuarterly(id)]))
  return {
    starter: { monthly: inr(s.IN.monthly), quarterly: inr(s.IN.quarterly), apps: s.credits, perApp: fmtPerApp(perAppMonthly("starter")) },
    pro: { monthly: inr(p.IN.monthly), quarterly: inr(p.IN.quarterly), apps: p.credits, perApp: fmtPerApp(perAppMonthly("pro")), perAppQ: fmtPerApp(perAppQuarterly("pro")) },
    ultra: { monthly: inr(u.IN.monthly), quarterly: inr(u.IN.quarterly), apps: u.credits, perApp: fmtPerApp(perAppMonthly("ultra")), perAppQ: fmtPerApp(perAppQuarterly("ultra")) },
    lowestPerApp: fmtPerApp(lowest),
    freeSwipes: FREE_SWIPES_PER_CYCLE,
    quarterlySavingPct: Math.round((1 - p.IN.quarterly / (p.IN.monthly * 3)) * 100),
  }
})()

export interface PlaybookStep {
  id: string
  /** What they say, in their words. */
  trigger: string
  examples: string[]
  /** What to send. [Name] is replaced with the name typed on the page. */
  message: string
  /** Which step to go to next, depending on their answer. */
  next?: { label: string; to: string }[]
  tip?: string
}

export interface PlaybookStage {
  title: string
  subtitle: string
  steps: PlaybookStep[]
}

const P = PRICES

export const PLAYBOOK: PlaybookStage[] = [
  {
    title: "1 · They reply to your first message",
    subtitle: "Match their answer to why they're on Iris. Empathise first, then show what Iris does for exactly their situation.",
    steps: [
      {
        id: "laid-off",
        trigger: "Recently laid off / urgently looking",
        examples: ["I got laid off last month", "Need a job asap", "Actively looking, it's tough out there"],
        message: `Really sorry to hear that [Name], it's a rough market right now. Honestly, the people who land fastest are the ones who apply to a lot of roles quickly, and that's exactly what Iris is built for. You swipe, our AI fills and submits the full application for you. There are hundreds of fresh jobs on Iris every day, and you can apply to loads of them for as low as ${P.lowestPerApp} per application. Want me to tell you which plan makes sense for you?`,
        next: [{ label: "Yes / tell me", to: "recommend-plan" }, { label: "How much?", to: "price" }, { label: "Does it actually work?", to: "does-it-work" }],
        tip: "Highest-intent segment. Move to a plan recommendation in the same conversation.",
      },
      {
        id: "fresher",
        trigger: "Fresher / student / looking for first role or internship",
        examples: ["I'm a fresher", "Final year student", "Looking for internships"],
        message: `Love that [Name]! For freshers it's mostly a numbers game, you need to be in front of as many recruiters as possible, and filling the same form 50 times kills your time. On Iris you just swipe right and our AI applies for you, cover letter and all. There are hundreds of jobs and internships and you can apply to loads of them for as low as ${P.lowestPerApp} each. Starter gives you ${P.starter.apps} applications a month for ${P.starter.monthly}, less than a pizza a week 😄 Want me to set you up?`,
        next: [{ label: "Interested", to: "how-to-upgrade" }, { label: "Too expensive", to: "too-expensive" }, { label: "Let me think", to: "think-about-it" }],
      },
      {
        id: "switching",
        trigger: "Employed, switching jobs",
        examples: ["Looking for a switch", "Want a better package", "Working currently, exploring better roles"],
        message: `Makes sense [Name]. The hardest part of switching while working is finding time to apply, and that's the whole point of Iris. You swipe on roles in 2 minutes during a break, and our AI fills and submits every application in the background. Hundreds of new jobs land every day, and you can apply for as low as ${P.lowestPerApp} per application. Most people switching go for Pro: ${P.pro.apps} applications a month, so you can go after every good role without spending your evenings on forms.`,
        next: [{ label: "Interested", to: "how-to-upgrade" }, { label: "How much?", to: "price" }, { label: "Let me think", to: "think-about-it" }],
      },
      {
        id: "between-jobs",
        trigger: "Contract ended / between jobs / notice period",
        examples: ["My contract ended, looking for a new one", "Freelancer between projects", "Serving notice period"],
        message: `That's a stressful spot [Name], and honestly the best move right now is speed: being early on lots of fresh roles. That's what Iris does, you swipe and our AI fills and submits each application for you, full-time roles and contracts. Can you tell me the roles you're targeting? I'll check we have enough of them flowing in for you, and then tell you the plan that fits.`,
        next: [{ label: "Shares roles", to: "recommend-plan" }, { label: "Waiting for results first", to: "wait-for-results" }, { label: "Not enough jobs", to: "not-enough-jobs" }],
        tip: "Not the same as switching: they aren't working, so don't say 'while working'. Urgency is high.",
      },
      {
        id: "exploring",
        trigger: "Just exploring",
        examples: ["Just checking it out", "Not really looking right now", "Saw it on Instagram"],
        message: `Totally fair [Name], thanks for giving it a try! Quick tip: the free plan gives you ${P.freeSwipes} swipes, so use them on roles you'd genuinely take, our AI submits the full application for you. If you ever start looking seriously, you can apply to hundreds of jobs for as low as ${P.lowestPerApp} per application. Anything you'd want Iris to do that it doesn't yet?`,
        next: [{ label: "Gives feedback", to: "positive-feedback" }, { label: "Starts looking later", to: "recommend-plan" }],
        tip: "Low pressure. Goal here is goodwill and a feature idea; follow up in 1 to 2 weeks.",
      },
      {
        id: "already-placed",
        trigger: "Already got a job / not looking anymore",
        examples: ["I got placed", "Already joined a company", "Not looking now"],
        message: `Congrats [Name], that's amazing 🎉 Really happy for you. One small ask: if you have friends who are job hunting right now, would you send them my way? And whenever you're ready for your next move, Iris will be here.`,
        tip: "No pitch. Referrals are the win here.",
      },
      {
        id: "positive-feedback",
        trigger: "Likes the app",
        examples: ["App is great!", "Super smooth", "Loved the swiping"],
        message: `That genuinely made my day, thanks [Name] 🙏 One thing most people don't realise: the free swipes run out fast, and the real magic is applying at volume, since every extra application is another shot at an interview. On premium you can apply to hundreds of jobs for as low as ${P.lowestPerApp} per application. What kind of roles are you going after? I'll tell you which plan fits.`,
        next: [{ label: "Shares roles", to: "recommend-plan" }, { label: "How much?", to: "price" }],
      },
      {
        id: "not-enough-jobs",
        trigger: "Likes it, but not finding enough (relevant) jobs",
        examples: ["Pretty good but not finding many jobs", "Not many jobs for my role", "Jobs aren't relevant to me", "Need jobs in my city / remote / abroad"],
        message: `Really appreciate that [Name], and thanks for being honest, that's super useful. We add new companies every week, so help me make Iris great for you: send me your target role, preferred cities (or remote), and 5 to 10 companies you'd love to work at. I'll personally get them added, and I'll ping you once they're live.`,
        next: [{ label: "Sends the list", to: "after-adding-companies" }],
        tip: "Add their companies on the Companies page, then follow up. Don't pitch until the jobs are there.",
      },
      {
        id: "after-adding-companies",
        trigger: "Follow-up once you've added what they asked for",
        examples: ["(you added their companies)"],
        message: `Hey [Name], done! I've added the companies you mentioned, so you'll see their open roles on Iris now. Have a swipe and tell me if it looks better. If you want to go after all of them properly, premium lets you apply to hundreds of jobs for as low as ${P.lowestPerApp} per application.`,
        next: [{ label: "Interested", to: "recommend-plan" }, { label: "Wants results first", to: "wait-for-results" }],
      },
      {
        id: "issue",
        trigger: "Had a problem / negative feedback",
        examples: ["Application failed", "Couldn't upload resume", "It didn't work for me"],
        message: `Thanks for telling me straight [Name], that's exactly what I needed to hear. Can you share a screenshot or the job it happened on? I'll personally look into it today and get back to you.`,
        next: [{ label: "After you fix it", to: "after-fix" }],
        tip: "Fix it first. Do not pitch until the problem is resolved.",
      },
      {
        id: "after-fix",
        trigger: "Follow-up once their issue is fixed",
        examples: ["(you fixed the bug)"],
        message: `Hey [Name], quick update: we fixed the issue you ran into, thanks again for flagging it. Give it another go and tell me how it feels. If you're applying seriously, premium lets you apply to hundreds of jobs for as low as ${P.lowestPerApp} each, and I'll keep a personal eye on your applications.`,
        next: [{ label: "Interested", to: "recommend-plan" }],
      },
      {
        id: "submitted",
        trigger: "Did my applications actually go through?",
        examples: ["Did it really apply?", "How do I know it was submitted?"],
        message: `Great question [Name]. Every application is actually submitted on the company's own careers page, the same as if you did it yourself. You'll usually get the company's confirmation email, and you can track every application's status in the app. Want me to check a specific one for you?`,
        next: [{ label: "Reassured", to: "recommend-plan" }],
      },
    ],
  },
  {
    title: "2 · Recommend a plan",
    subtitle: "Once they're engaged. Anchor on cost per application, not the monthly price.",
    steps: [
      {
        id: "recommend-plan",
        trigger: "They want to know which plan",
        examples: ["Which plan should I take?", "Tell me more", "Yes"],
        message: `Here's how I'd think about it [Name]:\n\n• Starter, ${P.starter.monthly}/month: ${P.starter.apps} applications (≈${P.starter.perApp} each). Good if you're picky.\n• Pro, ${P.pro.monthly}/month: ${P.pro.apps} applications (≈${P.pro.perApp} each). Best for most people actively looking.\n• Ultra, ${P.ultra.monthly}/month: ${P.ultra.apps} applications (≈${P.ultra.perApp} each). For going all in.\n\nOn quarterly billing it drops to ${P.pro.perAppQ} per application. For you I'd go with Pro, enough volume to actually get interviews.`,
        next: [{ label: "Ok, how do I buy?", to: "how-to-upgrade" }, { label: "Too expensive", to: "too-expensive" }],
      },
      {
        id: "price",
        trigger: "How much does it cost?",
        examples: ["What's the price?", "How much is premium?"],
        message: `Sure [Name]! Plans start at ${P.starter.monthly}/month for ${P.starter.apps} applications, and on quarterly billing it goes as low as ${P.lowestPerApp} per application. Think about it: one application done by hand takes 15 to 20 minutes. For ${P.lowestPerApp}, our AI does it for you. Hundreds of jobs, all from your phone. Want my recommendation for your situation?`,
        next: [{ label: "Yes", to: "recommend-plan" }, { label: "Too expensive", to: "too-expensive" }],
      },
    ],
  },
  {
    title: "3 · Handle objections",
    subtitle: "Be honest. Never promise a job or an interview.",
    steps: [
      {
        id: "too-expensive",
        trigger: "Too expensive / can't afford it",
        examples: ["Too costly", "I'm a student, can't pay that", "Not in my budget right now"],
        message: `Totally get it [Name]. Look at it this way: it works out to as low as ${P.lowestPerApp} per application, less than a cup of chai, and each one saves you 15 to 20 minutes of form filling. Starter is ${P.starter.monthly} for a full month of ${P.starter.apps} applications. One interview from all that pays it back many times over. Want to start with Starter for a month and see?`,
        next: [{ label: "Ok", to: "how-to-upgrade" }, { label: "Still no", to: "think-about-it" }],
        tip: "Only offer a discount if you have actually set one up.",
      },
      {
        id: "does-it-work",
        trigger: "Does it actually work? Will I get interviews?",
        examples: ["Will I get calls?", "Does this really work?", "Is it legit?"],
        message: `Honest answer [Name]: nobody can promise interviews, and I won't. What Iris does is make sure you're in the running for far more roles than you could ever apply to by hand. Every application is a real submission on the company's careers page. More good applications means more chances, that's the whole game. You've already seen it work on your free swipes.`,
        next: [{ label: "Convinced", to: "recommend-plan" }, { label: "Wants to think", to: "think-about-it" }],
      },
      {
        id: "think-about-it",
        trigger: "Let me think about it / maybe later",
        examples: ["Will think and let you know", "Maybe next month", "Later"],
        message: `Of course [Name], no pressure at all. Just one thing to keep in mind: good roles close fast, often within a week of posting. Whenever you're ready, I'm one message away and happy to help you pick a plan.`,
        next: [{ label: "No reply in 3 days", to: "nudge" }],
      },
      {
        id: "wait-for-results",
        trigger: "Waiting to see if I get responses before paying",
        examples: ["If I get responses I'll explore, else it's a waste of time", "Let me see if any of these work out first", "Applied, waiting for a response"],
        message: `That's completely fair [Name], I'd think the same. One honest thing though: most people hear back from only a small share of their applications, and replies usually take 1 to 3 weeks, so a handful of applications is too small a sample to judge by. What gets people interviews is volume plus speed. How about this: I'll check in with you next week. If you've heard back, great. If not, try Starter for a month at ${P.starter.monthly} and give it a real shot. Deal?`,
        next: [{ label: "A week later", to: "results-check-in" }, { label: "Agrees now", to: "how-to-upgrade" }],
        tip: "Don't argue. Agree, reframe sample size, and book the check-in. Set yourself a reminder.",
      },
      {
        id: "no-responses-yet",
        trigger: "Applied but no responses yet",
        examples: ["Haven't heard back from anyone", "No calls yet", "Nothing so far"],
        message: `I hear you [Name], the silence is the worst part of job hunting. It's normal though: companies often take 1 to 3 weeks, and most applications don't get a reply, for anyone. The way through is more good applications, faster, so you're early on every fresh role. Want me to look at your profile and target roles and suggest how to get more out of Iris?`,
        next: [{ label: "Yes", to: "recommend-plan" }, { label: "Not enough jobs", to: "not-enough-jobs" }],
      },
      {
        id: "do-it-myself",
        trigger: "I'd rather apply myself / LinkedIn Easy Apply is free",
        examples: ["I can apply on my own", "Easy Apply is free", "Not sure about AI applying for me"],
        message: `Totally get that [Name]. The difference is that most good companies don't use Easy Apply, they make you fill long forms on their own careers site (Greenhouse, Lever, Workday and so on), and each one takes 15 to 20 minutes. Iris fills those full forms for you from your resume and profile, so keeping your profile detailed is how you control quality. You still choose every job with a swipe.`,
        next: [{ label: "Convinced", to: "recommend-plan" }, { label: "Still unsure", to: "think-about-it" }],
      },
      {
        id: "free-trial",
        trigger: "Can I try more for free first?",
        examples: ["Any free trial?", "Can I get a few more free applications?", "Discount?"],
        message: `Good question [Name]! The free plan already gives you ${P.freeSwipes} swipes so you can see the AI apply for real. Use them on roles you'd genuinely take. If you like what you see, Starter is ${P.starter.monthly} for ${P.starter.apps} applications, and on quarterly it goes as low as ${P.lowestPerApp} per application.`,
        next: [{ label: "Ok", to: "how-to-upgrade" }, { label: "Too expensive", to: "too-expensive" }],
        tip: "Only offer extra free applications or a discount if you've actually set one up.",
      },
    ],
  },
  {
    title: "4 · Close, nudge, and after they pay",
    subtitle: "Make buying effortless, then turn them into a fan.",
    steps: [
      {
        id: "how-to-upgrade",
        trigger: "They're ready to buy",
        examples: ["Ok let's do it", "How do I upgrade?", "Where do I pay?"],
        message: `Awesome [Name]! Open the Iris app and tap the upgrade option on the plans screen, it takes under a minute. Once you're in, tell me the roles you're targeting and I'll make sure you're set up to go after them. Welcome aboard 🚀`,
        next: [{ label: "After they pay", to: "after-purchase" }],
      },
      {
        id: "results-check-in",
        trigger: "A week after they said 'waiting for results'",
        examples: ["(one week later)"],
        message: `Hey [Name], checking in like I promised! Did you hear back from any of the companies you applied to?`,
        next: [{ label: "Got a call / interview", to: "got-response" }, { label: "Nothing yet", to: "no-responses-yet" }],
      },
      {
        id: "got-response",
        trigger: "They got a response or interview",
        examples: ["Got an interview call!", "One company replied", "Have a screening next week"],
        message: `That's awesome [Name], congrats! 🎉 That's from just a few applications. Imagine being in the running at ten times as many companies: more calls, more options, and a better offer to negotiate with. Pro gives you ${P.pro.apps} applications a month, and on quarterly it's ${P.pro.perAppQ} per application. Want me to set you up so you keep the momentum going?`,
        next: [{ label: "Yes", to: "how-to-upgrade" }, { label: "Too expensive", to: "too-expensive" }],
      },
      {
        id: "nudge",
        trigger: "No reply after 2 to 3 days",
        examples: ["(silence)"],
        message: `Hey [Name], just checking in! I saw a bunch of new roles come in that match what you're looking for. If you want, I can help you get started so you don't miss them.`,
        tip: "Send at most one nudge. If no reply, stop.",
      },
      {
        id: "after-purchase",
        trigger: "Right after they upgrade",
        examples: ["(they paid)"],
        message: `Thank you so much for trusting Iris, [Name] 🙏 Quick tips: swipe on roles you'd genuinely take, keep your resume updated in the app, and check your email for company confirmations. If anything feels off, message me directly. And if you know a friend who's job hunting, send them my way, it means a lot.`,
      },
    ],
  },
]

export function fillName(message: string, name: string): string {
  const n = name.trim()
  return n ? message.replaceAll("[Name]", n) : message
}
