import { createClient } from "@supabase/supabase-js"
import fs from "fs"
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n")
  .filter(l=>l.includes("=")&&!l.trim().startsWith("#"))
  .map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const { data, error } = await sb.from("settings").select("*").single()
if (error) { console.log("settings error:", error.message); process.exit(0) }
const show = (k) => { const v = data?.[k]; return !v ? "(empty)" : `${String(v).slice(0,14)}…${String(v).slice(-6)}  len=${String(v).length}` }
for (const k of ["kernelApiKey","geminiApiKey","openAiApiKey","openRouterApiKey","captchaSolverApiKey"]) console.log(`DB  ${k.padEnd(22)} ${show(k)}`)
console.log()
for (const [k,e] of [["geminiApiKey","GEMINI_API_KEY"],["openAiApiKey","OPENAI_API_KEY"],["openRouterApiKey","OPENROUTER_API_KEY"]]) {
  const dbv = data?.[k] || "", ev = env[e] || ""
  console.log(`${e.padEnd(20)} env=${ev? ev.slice(0,14)+"…"+ev.slice(-6):"(none)"}  |  db=${dbv? dbv.slice(0,14)+"…"+dbv.slice(-6):"(none)"}  |  ${dbv&&ev&&dbv!==ev ? "*** DIFFERENT — env is shadowing the DB ***" : dbv===ev?"same":"only one set"}`)
}
