export async function GET() {
  const envKey = process.env.SKYVERN_API_KEY || ""
  return Response.json({ key: envKey })
}
