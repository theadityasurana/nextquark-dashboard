"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RefreshCw } from "lucide-react"

interface InboundEmail {
  id: string
  user_id: string
  proxy_address: string
  from_email: string
  body_text: string
  body_html: string | null
  extracted_otp: string | null
  live_application_queue_id: string | null
}

function stripHtmlToText(html: string | null): string {
  if (!html) return ""
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/(p|div|tr|h[1-6]|li|blockquote)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(td|th)>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim()
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
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">OTP Manager</h1>
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
          {/* Mobile card view */}
          <div className="flex flex-col gap-3 md:hidden">
            {emails.map((email) => (
              <div key={email.id} className="rounded-lg border border-border p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground truncate">{email.id}</span>
                  {email.extracted_otp ? (
                    <Badge variant="default" className="font-mono text-sm shrink-0">{email.extracted_otp}</Badge>
                  ) : (
                    <span className="text-muted-foreground shrink-0">No OTP</span>
                  )}
                </div>
                <div><span className="text-muted-foreground">From: </span><span className="font-mono break-all">{email.from_email}</span></div>
                <div><span className="text-muted-foreground">Proxy: </span><span className="font-mono break-all">{email.proxy_address}</span></div>
                {email.live_application_queue_id && (
                  <div><span className="text-muted-foreground">Queue ID: </span><span className="font-mono break-all">{email.live_application_queue_id}</span></div>
                )}
                {email.body_text && (
                  <div className="text-muted-foreground whitespace-pre-wrap break-words">{email.body_text}</div>
                )}
              </div>
            ))}
            {emails.length === 0 && !loading && (
              <p className="text-center text-muted-foreground py-8 text-sm">No inbound emails found</p>
            )}
          </div>
          {/* Desktop table view */}
          <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Live App Queue ID</TableHead>
                <TableHead>User ID</TableHead>
                <TableHead>Proxy Address</TableHead>
                <TableHead>From Email</TableHead>
                <TableHead>Body Text</TableHead>
                <TableHead>Body HTML</TableHead>
                <TableHead>Extracted OTP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {emails.map((email) => (
                <TableRow key={email.id}>
                  <TableCell className="font-mono text-xs">{email.id}</TableCell>
                  <TableCell className="font-mono text-xs">{email.live_application_queue_id ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{email.user_id}</TableCell>
                  <TableCell className="font-mono text-xs">{email.proxy_address}</TableCell>
                  <TableCell className="font-mono text-xs">{email.from_email}</TableCell>
                  <TableCell className="max-w-xs whitespace-pre-wrap break-words text-xs">{email.body_text}</TableCell>
                  <TableCell className="max-w-xs whitespace-pre-wrap break-words text-xs">{stripHtmlToText(email.body_html)}</TableCell>
                  <TableCell>
                    {email.extracted_otp ? (
                      <Badge variant="default" className="font-mono text-sm">{email.extracted_otp}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {emails.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No inbound emails found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
