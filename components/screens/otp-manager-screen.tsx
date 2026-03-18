"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"

interface InboundEmail {
  id: string
  user_id: string
  proxy_address: string
  from_email: string
  body_text: string
}

export function OtpManagerScreen() {
  const [emails, setEmails] = useState<InboundEmail[]>([])
  const [loading, setLoading] = useState(false)

  const fetchEmails = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/otp-manager")
      const data = await res.json()
      setEmails(Array.isArray(data) ? data : [])
    } catch {
      setEmails([])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchEmails()
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">OTP Manager</h1>
        <p className="text-muted-foreground">View inbound emails and OTP codes</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Inbound Emails</CardTitle>
              <CardDescription>{emails.length} records</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchEmails} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>User ID</TableHead>
                <TableHead>Proxy Address</TableHead>
                <TableHead>From Email</TableHead>
                <TableHead>Body Text</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {emails.map((email) => (
                <TableRow key={email.id}>
                  <TableCell className="font-mono text-xs">{email.id}</TableCell>
                  <TableCell className="font-mono text-xs">{email.user_id}</TableCell>
                  <TableCell className="font-mono text-xs">{email.proxy_address}</TableCell>
                  <TableCell className="font-mono text-xs">{email.from_email}</TableCell>
                  <TableCell className="max-w-xs whitespace-pre-wrap break-words text-xs">{email.body_text}</TableCell>
                </TableRow>
              ))}
              {emails.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No inbound emails found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
