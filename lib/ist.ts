export const IST = "Asia/Kolkata"

export function dateInIst(iso: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof iso === "string" ? new Date(iso) : iso)
}

export function hourInIst(iso: string | Date): number {
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(typeof iso === "string" ? new Date(iso) : iso)
  return Number.parseInt(h, 10)
}

export function startOfTodayIst(now = new Date()): Date {
  return new Date(`${dateInIst(now)}T00:00:00+05:30`)
}

export function formatIst(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: IST,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
}
