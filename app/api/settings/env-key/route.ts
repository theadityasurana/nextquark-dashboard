export async function GET() {
  const envKey = process.env.BROWSER_USE_API_KEY || ""
  return Response.json({ key: envKey })
}
