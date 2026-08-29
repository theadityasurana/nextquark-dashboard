import Kernel from "@onkernel/sdk"
import fs from "fs"
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n")
  .filter(l=>l.includes("=")&&!l.trim().startsWith("#"))
  .map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}))
const k = new Kernel({ apiKey: env.KERNEL_API_KEY })
const raw = await k.browsers.list()
const list = Array.isArray(raw) ? raw : (raw?.data ?? raw?.browsers ?? raw?.items ?? [])
console.log("live sessions:", list.length)
for (const b of list) {
  console.log("  ", b.session_id, b.created_at || "")
  try { await k.browsers.deleteByID(b.session_id); console.log("     deleted") } catch (e) { console.log("     ", String(e).slice(0,80)) }
}
const after = await k.browsers.list()
console.log("remaining:", (Array.isArray(after) ? after : (after?.data ?? after?.browsers ?? after?.items ?? [])).length)
