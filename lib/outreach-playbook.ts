/**
 * Reply playbook for Sales & Outreach: what a user might reply to the first
 * founder message, and what to send next. Conversation first: listen and help
 * in stages 1 and 2, and only bring up premium in stage 3, once they are warm.
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

/** Stages whose messages must never mention premium, plans, or price. */
export const NO_PITCH_STAGES = 2

export const PLAYBOOK: PlaybookStage[] = [
  {
    title: "1 · Their first reply: just listen",
    subtitle: "No selling yet. Empathise, ask one question back, and offer real help. Short, like a text from a friend.",
    steps: [
      {
        id: "laid-off",
        trigger: "Recently laid off / urgently looking",
        examples: ["I got laid off last month", "Need a job asap", "Actively looking, it's tough out there"],
        message: `Really sorry to hear that [Name], that's tough, and the market isn't making it any easier. What kind of role are you going after, and which cities, or remote? I want to make sure Iris is actually showing you the right jobs.`,
        next: [{ label: "Shares roles", to: "shares-roles" }, { label: "Waiting on applications", to: "wait-for-results" }],
      },
      {
        id: "between-jobs",
        trigger: "Contract ended / between jobs / notice period",
        examples: ["My contract ended, looking for a new one", "Freelancer between projects", "Serving notice period"],
        message: `Ah, that's a stressful spot to be in [Name]. Are you looking for another contract this time, or something full-time? And what roles or stack? Want to make sure you're seeing the right stuff on Iris.`,
        next: [{ label: "Shares roles", to: "shares-roles" }, { label: "Waiting on applications", to: "wait-for-results" }, { label: "Not enough jobs", to: "not-enough-jobs" }],
        tip: "Not the same as switching: they aren't working, so never say 'while working'.",
      },
      {
        id: "fresher",
        trigger: "Fresher / student / looking for first role or internship",
        examples: ["I'm a fresher", "Final year student", "Looking for internships"],
        message: `Nice [Name]! The first job hunt is a lot, I remember it well. What roles are you aiming for, and are you open to internships too? Happy to share a couple of things that work well for freshers.`,
        next: [{ label: "Shares roles", to: "shares-roles" }],
      },
      {
        id: "switching",
        trigger: "Employed, switching jobs",
        examples: ["Looking for a switch", "Want a better package", "Working currently, exploring better roles"],
        message: `Makes sense [Name]. Is it more about the role, the package, or the company? And how's the hunt going so far, getting any calls?`,
        next: [{ label: "Shares roles", to: "shares-roles" }, { label: "No calls yet", to: "no-responses-yet" }],
        tip: "Only for people who are currently employed. Contract ended or between jobs? Use that card instead.",
      },
      {
        id: "exploring",
        trigger: "Just exploring",
        examples: ["Just checking it out", "Not really looking right now", "Saw it on Instagram"],
        message: `Totally fair [Name], thanks for giving it a try! Was there anything that stood out, good or bad? And if you did start looking, what kind of role would you go for?`,
        next: [{ label: "Gives feedback", to: "positive-feedback" }, { label: "Shares roles", to: "shares-roles" }],
        tip: "Lowest intent. Aim for goodwill and a feature idea, not a sale.",
      },
      {
        id: "positive-feedback",
        trigger: "Likes the app",
        examples: ["App is great!", "Super smooth", "Pretty good compared to others"],
        message: `That genuinely made my day, thanks [Name] 🙏 If you were in my shoes, what's the one thing you'd change or add?`,
        next: [{ label: "Shares an idea", to: "feature-idea" }, { label: "Not enough jobs", to: "not-enough-jobs" }],
      },
      {
        id: "not-enough-jobs",
        trigger: "Likes it, but not finding enough (relevant) jobs",
        examples: ["Pretty good but not finding many jobs", "Not many jobs for my role", "Jobs aren't relevant to me", "Need jobs in my city / remote / abroad"],
        message: `Really appreciate that [Name], and thanks for being honest, that's super useful. Help me fix it for you: what's your target role, preferred cities (or remote), and 5 to 10 companies you'd love to work at? I'll personally get them added and ping you once they're live.`,
        next: [{ label: "Sends the list", to: "after-adding-companies" }],
        tip: "Add their companies on the Companies page before you follow up.",
      },
      {
        id: "wait-for-results",
        trigger: "Applied, waiting to hear back (or 'will decide after I get responses')",
        examples: ["Applied and waiting for a response", "If I get responses I'll explore, else it's a waste of time", "Let me see if any of these work out"],
        message: `Totally fair [Name], I'd do exactly the same. Fingers crossed on those! Just so you know, companies often take 1 to 3 weeks to reply, so don't read too much into the silence yet. Mind if I check in with you next week to see how it went?`,
        next: [{ label: "A week later", to: "results-check-in" }],
        tip: "Don't counter. Agree, set expectations, and book the check-in. Set yourself a reminder.",
      },
      {
        id: "issue",
        trigger: "Had a problem / negative feedback",
        examples: ["Application failed", "Couldn't upload resume", "It didn't work for me"],
        message: `Thanks for telling me straight [Name], that's exactly what I needed to hear. Could you share a screenshot or the job it happened on? I'll personally look into it today and get back to you.`,
        next: [{ label: "After you fix it", to: "after-fix" }],
        tip: "Fix it first. Nothing else until the problem is resolved.",
      },
      {
        id: "submitted",
        trigger: "Did my applications actually go through?",
        examples: ["Did it really apply?", "How do I know it was submitted?"],
        message: `Great question [Name]. Every application is submitted on the company's own careers page, the same as if you did it yourself. You'll usually get the company's confirmation email, and you can track each one in the app. Want me to check a specific one for you?`,
        next: [{ label: "Reassured", to: "shares-roles" }],
      },
      {
        id: "already-placed",
        trigger: "Already got a job / not looking anymore",
        examples: ["I got placed", "Already joined a company", "Not looking now"],
        message: `Congrats [Name], that's amazing 🎉 Really happy for you. Small ask: if you have friends who are job hunting right now, would you send them my way? And whenever you're ready for your next move, Iris will be here.`,
        tip: "Referrals are the win here.",
      },
    ],
  },
  {
    title: "2 · Keep the conversation going: be useful",
    subtitle: "Still no selling. Help with roles, companies, and tips. This is where trust gets built; it usually takes 2 or 3 messages.",
    steps: [
      {
        id: "shares-roles",
        trigger: "They tell you what roles / cities they want",
        examples: ["Backend roles in Bangalore", "Product manager, Hyderabad or remote", "Data analyst internships"],
        message: `Got it [Name], that's a good space to be looking in. Two quick tips: keep your Iris profile detailed, since the AI uses it to fill every form, and swipe on fresh postings early, because being in the first batch of applicants helps a lot. Any specific companies you're eyeing? I can get them added.`,
        next: [{ label: "Sends companies", to: "after-adding-companies" }, { label: "Ran out of swipes", to: "bridge" }, { label: "Applied, waiting", to: "wait-for-results" }],
      },
      {
        id: "feature-idea",
        trigger: "They suggest a feature or change",
        examples: ["Add salary filters", "Show which jobs got replies", "Let me edit answers"],
        message: `Love that, noted, and I'll take it to the team this week. Thanks [Name], this is exactly the kind of thing that makes Iris better. By the way, what roles are you going after right now?`,
        next: [{ label: "Shares roles", to: "shares-roles" }],
      },
      {
        id: "after-adding-companies",
        trigger: "Follow-up once you've added what they asked for",
        examples: ["(you added their companies)"],
        message: `Hey [Name], done! I've added the companies you mentioned, so their open roles should show up on Iris now. Have a swipe and tell me how it looks?`,
        next: [{ label: "Likes it", to: "bridge" }, { label: "Still not enough", to: "not-enough-jobs" }],
      },
      {
        id: "after-fix",
        trigger: "Follow-up once their issue is fixed",
        examples: ["(you fixed the bug)"],
        message: `Hey [Name], quick update: we fixed the issue you ran into, thanks again for flagging it. Mind giving it another go and telling me how it feels?`,
        next: [{ label: "Works now", to: "shares-roles" }],
      },
      {
        id: "results-check-in",
        trigger: "A week after they said they're waiting on applications",
        examples: ["(one week later)"],
        message: `Hey [Name], checking in like I promised! Did you hear back from any of the companies you applied to?`,
        next: [{ label: "Got a call / interview", to: "got-response" }, { label: "Nothing yet", to: "no-responses-yet" }],
      },
      {
        id: "got-response",
        trigger: "They got a response or an interview",
        examples: ["Got an interview call!", "One company replied", "Have a screening next week"],
        message: `That's awesome [Name], congrats! 🎉 Which company? If you want, I'm happy to share a few tips for the interview.`,
        next: [{ label: "Shares, chats", to: "bridge" }],
        tip: "Celebrate with them first. Bring up premium a message or two later, when it feels natural.",
      },
      {
        id: "no-responses-yet",
        trigger: "Applied but no responses yet",
        examples: ["Haven't heard back from anyone", "No calls yet", "Nothing so far"],
        message: `I hear you [Name], the silence is honestly the worst part of job hunting. It's normal though: most applications don't get a reply, for anyone, and the ones that do often take a couple of weeks. Want me to look at your profile and target roles and suggest what could help?`,
        next: [{ label: "Yes", to: "bridge" }, { label: "Not enough jobs", to: "not-enough-jobs" }],
      },
    ],
  },
  {
    title: "3 · Bring up premium, only once they're warm",
    subtitle: "Wait for an opening: they've replied 2 or 3 times, used up their free swipes, asked how to apply to more, or asked about price. Ask permission first.",
    steps: [
      {
        id: "bridge",
        trigger: "They're warm, ran out of free swipes, or want to apply to more",
        examples: ["My swipes are over", "How do I apply to more jobs?", "(friendly back and forth for a few messages)"],
        message: `By the way [Name], you've probably noticed the free swipes run out pretty fast 😅 Can I share how people who are actively job hunting get the most out of Iris?`,
        next: [{ label: "Sure", to: "explain-premium" }],
        tip: "Ask permission. If they say no or go quiet, drop it and stay helpful.",
      },
      {
        id: "explain-premium",
        trigger: "They say sure / tell me",
        examples: ["Sure", "Yes tell me", "How?"],
        message: `So [Name], the free plan gives you ${P.freeSwipes} swipes to try it out. People who are serious about the hunt go premium: you can apply to hundreds of jobs, the AI fills every form for you, and it works out to as low as ${P.lowestPerApp} per application. Want me to suggest which plan would suit you?`,
        next: [{ label: "Yes", to: "recommend-plan" }, { label: "How much?", to: "price" }, { label: "Too expensive", to: "too-expensive" }],
      },
      {
        id: "recommend-plan",
        trigger: "They want to know which plan",
        examples: ["Which plan should I take?", "Tell me more", "Yes"],
        message: `Here's how I'd think about it [Name]:\n\n• Starter, ${P.starter.monthly}/month: ${P.starter.apps} applications (≈${P.starter.perApp} each). Good if you're picky.\n• Pro, ${P.pro.monthly}/month: ${P.pro.apps} applications (≈${P.pro.perApp} each). Best for most people actively looking.\n• Ultra, ${P.ultra.monthly}/month: ${P.ultra.apps} applications (≈${P.ultra.perApp} each). For going all in.\n\nOn quarterly billing it drops to ${P.pro.perAppQ} per application. For you I'd go with Pro.`,
        next: [{ label: "Ok, how do I buy?", to: "how-to-upgrade" }, { label: "Too expensive", to: "too-expensive" }],
      },
      {
        id: "price",
        trigger: "How much does it cost?",
        examples: ["What's the price?", "How much is premium?"],
        message: `Sure [Name]! Plans start at ${P.starter.monthly}/month for ${P.starter.apps} applications, and on quarterly billing it goes as low as ${P.lowestPerApp} per application. One application by hand takes 15 to 20 minutes; for ${P.lowestPerApp}, the AI does it for you. Want my recommendation for your situation?`,
        next: [{ label: "Yes", to: "recommend-plan" }, { label: "Too expensive", to: "too-expensive" }],
        tip: "If they ask about price early, answer it straight. Don't dodge a direct question.",
      },
    ],
  },
  {
    title: "4 · Handle objections",
    subtitle: "Be honest. Never promise a job or an interview.",
    steps: [
      {
        id: "too-expensive",
        trigger: "Too expensive / can't afford it",
        examples: ["Too costly", "I'm a student, can't pay that", "Not in my budget right now"],
        message: `Totally get it [Name]. Look at it this way: it works out to as low as ${P.lowestPerApp} per application, less than a cup of chai, and each one saves you 15 to 20 minutes of form filling. Starter is ${P.starter.monthly} for a full month of ${P.starter.apps} applications. Want to try it for a month and see?`,
        next: [{ label: "Ok", to: "how-to-upgrade" }, { label: "Still no", to: "think-about-it" }],
        tip: "Only offer a discount if you have actually set one up.",
      },
      {
        id: "does-it-work",
        trigger: "Does it actually work? Will I get interviews?",
        examples: ["Will I get calls?", "Does this really work?", "Is it legit?"],
        message: `Honest answer [Name]: nobody can promise interviews, and I won't. What Iris does is put you in the running for far more roles than you could ever apply to by hand. Every application is a real submission on the company's careers page. More good applications means more chances, that's the whole game.`,
        next: [{ label: "Convinced", to: "recommend-plan" }, { label: "Wants to think", to: "think-about-it" }],
      },
      {
        id: "do-it-myself",
        trigger: "I'd rather apply myself / LinkedIn Easy Apply is free",
        examples: ["I can apply on my own", "Easy Apply is free", "Not sure about AI applying for me"],
        message: `Totally get that [Name]. Thing is, most good companies don't use Easy Apply, they make you fill long forms on their own careers site (Greenhouse, Lever, Workday and so on), and each takes 15 to 20 minutes. Iris fills those for you from your resume and profile, and you still pick every job with a swipe.`,
        next: [{ label: "Convinced", to: "recommend-plan" }, { label: "Still unsure", to: "think-about-it" }],
      },
      {
        id: "free-trial",
        trigger: "Can I try more for free first?",
        examples: ["Any free trial?", "Can I get a few more free applications?", "Discount?"],
        message: `Good question [Name]! The free plan already gives you ${P.freeSwipes} swipes so you can see the AI apply for real. If you like what you see, Starter is ${P.starter.monthly} for ${P.starter.apps} applications, and on quarterly it goes as low as ${P.lowestPerApp} per application.`,
        next: [{ label: "Ok", to: "how-to-upgrade" }, { label: "Too expensive", to: "too-expensive" }],
        tip: "Only offer extra free applications or a discount if you've actually set one up.",
      },
      {
        id: "think-about-it",
        trigger: "Let me think about it / maybe later",
        examples: ["Will think and let you know", "Maybe next month", "Later"],
        message: `Of course [Name], no pressure at all. Good roles do close fast though, often within a week of posting. Whenever you're ready, I'm one message away.`,
        next: [{ label: "No reply in 3 days", to: "nudge" }],
      },
    ],
  },
  {
    title: "5 · Close, nudge, and after they pay",
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
        id: "nudge",
        trigger: "No reply after 2 to 3 days",
        examples: ["(silence)"],
        message: `Hey [Name], just checking in! A bunch of new roles came in that match what you're looking for. Happy to help whenever you want to pick this back up.`,
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
