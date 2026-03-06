import { NextRequest } from 'next/server'

let logsStore: any[] = []

export function GET(request: NextRequest) {
  const applicationId = request.nextUrl.searchParams.get('applicationId')
  
  if (applicationId) {
    return Response.json({ logs: logsStore.filter(log => log.applicationId === applicationId) })
  }
  
  return Response.json({ logs: logsStore })
}

export function POST(request: Request) {
  return request.json().then(log => {
    logsStore.unshift(log)
    if (logsStore.length > 1000) logsStore = logsStore.slice(0, 1000)
    return Response.json({ success: true })
  })
}

export { logsStore }
