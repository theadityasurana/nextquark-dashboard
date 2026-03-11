"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Mail, Save, RefreshCw, Send } from "lucide-react"
import { toast } from "sonner"

interface EmailTemplate {
  id: string
  name: string
  trigger_type: string
  subject: string
  html_body: string
  is_active: boolean
}

interface EmailLog {
  id: string
  recipient_email: string
  subject: string
  trigger_type: string
  status: string
  error_message?: string
  sent_at: string
}

export function EmailsScreen() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [logs, setLogs] = useState<EmailLog[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null)
  const [loading, setLoading] = useState(false)
  const [testEmail, setTestEmail] = useState('')

  useEffect(() => {
    fetchTemplates()
    fetchLogs()
  }, [])

  const fetchTemplates = async () => {
    const res = await fetch('/api/email/templates')
    const data = await res.json()
    setTemplates(Array.isArray(data) ? data : [])
    if (data.length > 0) setSelectedTemplate(data[0])
  }

  const fetchLogs = async () => {
    const res = await fetch('/api/email/logs')
    const data = await res.json()
    setLogs(Array.isArray(data) ? data : [])
  }

  const saveTemplate = async () => {
    if (!selectedTemplate) return
    setLoading(true)
    try {
      const res = await fetch('/api/email/templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedTemplate),
      })
      if (res.ok) {
        toast.success('Template saved successfully')
        fetchTemplates()
      }
    } catch (error) {
      toast.error('Failed to save template')
    }
    setLoading(false)
  }

  const sendTestEmail = async () => {
    if (!testEmail) {
      toast.error('Please enter an email address')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testEmail }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Test email sent successfully')
      } else {
        toast.error(data.error || 'Failed to send test email')
      }
    } catch (error) {
      toast.error('Failed to send test email')
    }
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Email Manager</h1>
        <p className="text-muted-foreground">Manage email templates and monitor sent emails</p>
      </div>

      <Tabs defaultValue="templates" className="space-y-4">
        <TabsList>
          <TabsTrigger value="templates">Email Templates</TabsTrigger>
          <TabsTrigger value="logs">Email Logs</TabsTrigger>
          <TabsTrigger value="settings">SMTP Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[300px_1fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Templates</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {templates.map((template) => (
                  <Button
                    key={template.id}
                    variant={selectedTemplate?.id === template.id ? "secondary" : "ghost"}
                    className="w-full justify-start"
                    onClick={() => setSelectedTemplate(template)}
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    {template.name}
                  </Button>
                ))}
              </CardContent>
            </Card>

            {selectedTemplate && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{selectedTemplate.name}</CardTitle>
                      <CardDescription>Trigger: {selectedTemplate.trigger_type}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="active">Active</Label>
                      <Switch
                        id="active"
                        checked={selectedTemplate.is_active}
                        onCheckedChange={(checked) =>
                          setSelectedTemplate({ ...selectedTemplate, is_active: checked })
                        }
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Subject</Label>
                    <Input
                      value={selectedTemplate.subject}
                      onChange={(e) =>
                        setSelectedTemplate({ ...selectedTemplate, subject: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>HTML Body</Label>
                    <Textarea
                      value={selectedTemplate.html_body}
                      onChange={(e) =>
                        setSelectedTemplate({ ...selectedTemplate, html_body: e.target.value })
                      }
                      rows={15}
                      className="font-mono text-xs"
                    />
                    <p className="text-xs text-muted-foreground">
                      Available variables: {"{"}{"{"} first_name {"}"}{"}"}, {"{"}{"{"} app_url {"}"}{"}"}, {"{"}{"{"} job_title {"}"}{"}"}, {"{"}{"{"} company_name {"}"}{"}"}, {"{"}{"{"} location {"}"}{"}"}
                    </p>
                  </div>
                  <Button onClick={saveTemplate} disabled={loading}>
                    <Save className="mr-2 h-4 w-4" />
                    Save Template
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Email Logs</CardTitle>
                  <CardDescription>Recent email activity</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={fetchLogs}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sent At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono text-xs">{log.recipient_email}</TableCell>
                      <TableCell>{log.subject}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.trigger_type}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={log.status === 'sent' ? 'default' : 'destructive'}>
                          {log.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(log.sent_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>SMTP Configuration</CardTitle>
              <CardDescription>Gmail SMTP settings are configured via environment variables</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-muted p-4 space-y-2">
                <p className="text-sm font-medium">Required Environment Variables:</p>
                <code className="block text-xs bg-background p-2 rounded">
                  GMAIL_USER=your-email@gmail.com<br />
                  GMAIL_APP_PASSWORD=your-app-password
                </code>
                <p className="text-xs text-muted-foreground mt-2">
                  Generate an App Password from your Google Account settings: <br />
                  Account → Security → 2-Step Verification → App passwords
                </p>
              </div>
              
              <div className="rounded-lg border p-4 space-y-3">
                <p className="text-sm font-medium">Test Email Configuration</p>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="Enter email to test"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                  />
                  <Button onClick={sendTestEmail} disabled={loading}>
                    <Send className="mr-2 h-4 w-4" />
                    Send Test
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
