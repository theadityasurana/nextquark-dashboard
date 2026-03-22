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
import { Mail, Save, RefreshCw, Send, UserCheck, Megaphone, Trophy, Moon, Info } from "lucide-react"
import { toast } from "sonner"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Info className="h-4 w-4 text-muted-foreground cursor-help shrink-0" />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  )
}
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface BroadcastPreset {
  id: string
  type: 'success_story' | 'tips_advice' | 'new_feature' | 'new_companies'
  label: string
  headline: string
  content: string
}

const BROADCAST_PRESETS: BroadcastPreset[] = [
  // Success Stories (5)
  {
    id: 'ss1', type: 'success_story', label: '🌟 Landed a FAANG Role',
    headline: 'From Swiping to Signing — A NextQuark Success Story!',
    content: '<h3>Meet Rahul 🎉</h3><p>Rahul was casually swiping through jobs on NextQuark one evening. Two weeks later, he had <strong>3 interview calls</strong> and an offer from a top tech company.</p><p>"I never thought job hunting could feel this effortless. NextQuark literally changed the game for me." — Rahul K.</p><p>His secret? A <strong>complete profile</strong> and swiping on at least 10 jobs a day. Simple, but it works.</p>',
  },
  {
    id: 'ss2', type: 'success_story', label: '🌟 Career Switch Success',
    headline: 'She Switched Careers in 3 Weeks Using NextQuark!',
    content: '<h3>Ananya\'s Story 💜</h3><p>Ananya was a marketing manager who wanted to break into product management. She updated her profile on NextQuark, highlighted her transferable skills, and started swiping.</p><p>Within <strong>3 weeks</strong>, she landed a PM role at a fast-growing startup.</p><p>"NextQuark made it so easy to discover roles I didn\'t even know existed. The swipe experience is addictive!" — Ananya S.</p>',
  },
  {
    id: 'ss3', type: 'success_story', label: '🌟 First Job Out of College',
    headline: 'Fresh Grad to Full-Time in 10 Days!',
    content: '<h3>Arjun\'s Journey 🚀</h3><p>Arjun graduated with a CS degree and was overwhelmed by the job market. He signed up on NextQuark, filled out his profile, and started swiping.</p><p><strong>10 days later</strong>, he had his first full-time offer as a software engineer.</p><p>"I applied to 25 jobs in my first week without filling a single form. NextQuark is a lifesaver for fresh grads." — Arjun M.</p>',
  },
  {
    id: 'ss4', type: 'success_story', label: '🌟 Remote Dream Job',
    headline: 'How Priya Found Her Dream Remote Job',
    content: '<h3>Priya\'s Win 🏠</h3><p>Priya wanted a fully remote role that let her work from her hometown. She set her preferences on NextQuark and let the algorithm do its thing.</p><p>Within <strong>2 weeks</strong>, she was interviewing with 4 companies — all remote. She picked her favorite and hasn\'t looked back.</p><p>"The job matching on NextQuark is scary good. It felt like the app read my mind." — Priya R.</p>',
  },
  {
    id: 'ss5', type: 'success_story', label: '🌟 Salary Jump Story',
    headline: 'He Got a 40% Salary Hike Through NextQuark!',
    content: '<h3>Vikram\'s Leap 💰</h3><p>Vikram was underpaid and knew it. He updated his NextQuark profile with his latest skills and started exploring. The result? A new role with a <strong>40% salary increase</strong>.</p><p>"I was nervous about switching, but NextQuark showed me what I was worth. Best decision I ever made." — Vikram D.</p>',
  },

  // Tips & Advice (5)
  {
    id: 'ta1', type: 'tips_advice', label: '💡 5 Profile Tips Recruiters Love',
    headline: '5 Things Recruiters Look For in Your Profile',
    content: '<h3>Make Your Profile Irresistible 🎯</h3><ol><li><strong>Professional Headline</strong> — Don\'t just say "Software Engineer". Say "Full-Stack Engineer | React & Node.js | 4 Years Experience"</li><li><strong>Complete Work Experience</strong> — Include impact metrics. "Increased API performance by 40%" beats "Worked on APIs"</li><li><strong>Skills Section</strong> — Add at least 8-10 relevant skills. Our matching algorithm uses these heavily</li><li><strong>Updated Resume</strong> — Upload your latest resume. Many companies pull directly from it</li><li><strong>Bio/Summary</strong> — 2-3 sentences about who you are and what you\'re looking for. Keep it human!</li></ol>',
  },
  {
    id: 'ta2', type: 'tips_advice', label: '💡 How to Swipe Smarter',
    headline: 'Swipe Smarter, Not Harder — Pro Tips Inside',
    content: '<h3>Get More Interviews With Less Effort ⚡</h3><ul><li><strong>Swipe daily</strong> — Even 5 minutes a day keeps your profile active and visible to recruiters</li><li><strong>Don\'t be too picky early on</strong> — Swipe right on anything that\'s 70%+ a match. You can always decline later</li><li><strong>Update your preferences</strong> — If you\'re not seeing great matches, tweak your desired roles and locations</li><li><strong>Check your email</strong> — Recruiters respond fast. Don\'t miss your window!</li></ul><p>Users who swipe on 10+ jobs daily get <strong>3x more interview calls</strong>. The math is simple! 📊</p>',
  },
  {
    id: 'ta3', type: 'tips_advice', label: '💡 Nail Your Tech Interview',
    headline: 'Your Tech Interview Cheat Sheet 📋',
    content: '<h3>Crush Your Next Interview 💪</h3><ul><li><strong>Research the company</strong> — Know their product, recent news, and tech stack. It shows you care</li><li><strong>Practice the STAR method</strong> — Situation, Task, Action, Result. Works for behavioral questions every time</li><li><strong>Ask smart questions</strong> — "What does success look like in the first 90 days?" always impresses</li><li><strong>Follow up</strong> — Send a thank-you email within 24 hours. Most candidates don\'t, so you\'ll stand out</li><li><strong>Don\'t stress rejections</strong> — Even the best get rejected. It\'s a numbers game, and you\'re already ahead by being on NextQuark</li></ul>',
  },
  {
    id: 'ta4', type: 'tips_advice', label: '💡 Resume Red Flags to Avoid',
    headline: '7 Resume Mistakes That Get You Instantly Rejected',
    content: '<h3>Stop Making These Mistakes ❌</h3><ol><li><strong>Typos and grammar errors</strong> — Run it through Grammarly. Seriously</li><li><strong>Generic objective statement</strong> — "Seeking a challenging role..." tells recruiters nothing</li><li><strong>No metrics</strong> — "Managed a team" vs "Led a team of 8, delivering 3 projects ahead of schedule" — big difference</li><li><strong>Too long</strong> — Keep it to 1 page if you have &lt;5 years experience, 2 pages max otherwise</li><li><strong>Outdated skills</strong> — Remove jQuery if you\'re applying for React roles</li><li><strong>Missing LinkedIn</strong> — 87% of recruiters check LinkedIn. Make sure it matches your resume</li><li><strong>Unprofessional email</strong> — cooldude99@gmail.com won\'t cut it. Use firstname.lastname@</li></ol>',
  },
  {
    id: 'ta5', type: 'tips_advice', label: '💡 Salary Negotiation 101',
    headline: 'How to Negotiate Your Salary Like a Pro',
    content: '<h3>You\'re Leaving Money on the Table 💸</h3><ul><li><strong>Never share your current salary first</strong> — Say "I\'m looking for X based on market rates and my experience"</li><li><strong>Research market rates</strong> — Use Glassdoor, Levels.fyi, and LinkedIn Salary to know your worth</li><li><strong>Negotiate the total package</strong> — Base salary, equity, signing bonus, remote flexibility — everything is negotiable</li><li><strong>Get it in writing</strong> — Verbal offers mean nothing. Always wait for the official offer letter</li><li><strong>Don\'t accept immediately</strong> — "I\'m really excited about this. Can I have 48 hours to review?" is perfectly professional</li></ul><p>On average, people who negotiate get <strong>10-20% more</strong> than the initial offer. Don\'t skip this step!</p>',
  },

  // New Features (5)
  {
    id: 'nf1', type: 'new_feature', label: '🚀 AI-Powered Job Matching',
    headline: 'New: AI-Powered Job Matching is Here!',
    content: '<h3>Smarter Matches, Better Results 🤖</h3><p>We just upgraded our job matching algorithm with AI! Here\'s what\'s new:</p><ul><li><strong>Skill-based matching</strong> — We now analyze your skills against job requirements for better matches</li><li><strong>Preference learning</strong> — The more you swipe, the smarter your feed gets</li><li><strong>Hidden gems</strong> — Discover roles you might have missed but are perfect for your profile</li></ul><p>Just keep swiping as usual — the AI works behind the scenes to surface the best jobs for you!</p>',
  },
  {
    id: 'nf2', type: 'new_feature', label: '🚀 One-Click Apply',
    headline: 'New: Apply to Jobs in One Click!',
    content: '<h3>Zero Forms. Zero Hassle. ⚡</h3><p>We heard you — filling out application forms is painful. So we built <strong>One-Click Apply</strong>!</p><ul><li>Swipe right on a job → We auto-fill and submit your application</li><li>Your profile data is used to complete every field</li><li>Track all your applications in real-time</li></ul><p>Make sure your profile is 100% complete to get the most out of this feature. The more complete your profile, the better your applications look!</p>',
  },
  {
    id: 'nf3', type: 'new_feature', label: '🚀 Application Tracker',
    headline: 'New: Track All Your Applications in One Place!',
    content: '<h3>Never Lose Track Again 📊</h3><p>Introducing the <strong>Application Tracker</strong> — your personal dashboard for every job you\'ve applied to.</p><ul><li>See real-time status updates for each application</li><li>Know exactly which stage you\'re at — Applied, Reviewing, Interview, Offer</li><li>Get notified the moment something changes</li></ul><p>No more spreadsheets, no more guessing. Everything in one place!</p>',
  },
  {
    id: 'nf4', type: 'new_feature', label: '🚀 Smart Notifications',
    headline: 'New: Smart Notifications Are Live!',
    content: '<h3>Stay in the Loop, Not in the Noise 🔔</h3><p>We\'ve revamped our notification system to be smarter:</p><ul><li><strong>Hot job alerts</strong> — Get notified when a high-match job is posted</li><li><strong>Application updates</strong> — Know instantly when a recruiter views your profile</li><li><strong>Weekly digest</strong> — A summary of new jobs matching your preferences</li></ul><p>You can customize your notification preferences anytime in Settings.</p>',
  },
  {
    id: 'nf5', type: 'new_feature', label: '🚀 Dark Mode',
    headline: 'New: Dark Mode is Finally Here! 🌙',
    content: '<h3>Easy on the Eyes, Easy on the Battery 🌑</h3><p>By popular demand, <strong>Dark Mode</strong> has arrived!</p><ul><li>Toggle between light and dark themes in Settings</li><li>Follows your system preference by default</li><li>Looks gorgeous on OLED screens</li></ul><p>Late-night job swiping just got a whole lot better. Try it out!</p>',
  },

  // New Companies (5)
  {
    id: 'nc1', type: 'new_companies', label: '🏢 FAANG Companies Joined',
    headline: 'Google, Meta, and Amazon Just Joined NextQuark!',
    content: '<h3>The Big Leagues Are Here 🏆</h3><p>We\'re thrilled to announce that some of the biggest names in tech are now on NextQuark:</p><ul><li><strong>Google</strong> — 50+ open roles across engineering, product, and design</li><li><strong>Meta</strong> — Hiring for AR/VR, infrastructure, and machine learning</li><li><strong>Amazon</strong> — Roles in AWS, retail tech, and operations</li></ul><p>These roles are getting a LOT of swipes, so don\'t wait. The early bird gets the interview! 🐦</p>',
  },
  {
    id: 'nc2', type: 'new_companies', label: '🏢 Hot Startups Added',
    headline: '12 Fast-Growing Startups Just Joined!',
    content: '<h3>Startup Life Awaits 🚀</h3><p>If you love fast-paced environments and big impact, check out these new additions:</p><ul><li><strong>Series A-C startups</strong> in fintech, healthtech, and AI</li><li>Competitive salaries + equity packages</li><li>Remote-first and hybrid options available</li><li>Small teams where your work actually matters</li></ul><p>Startups on NextQuark are actively hiring and move fast. Some close roles within a week!</p>',
  },
  {
    id: 'nc3', type: 'new_companies', label: '🏢 Remote-First Companies',
    headline: '8 Fully Remote Companies Now Hiring!',
    content: '<h3>Work From Anywhere 🌍</h3><p>Great news for remote work lovers! These companies just joined NextQuark and they\'re all <strong>100% remote</strong>:</p><ul><li>No office requirement — work from home, a café, or a beach</li><li>Roles spanning engineering, design, marketing, and ops</li><li>Competitive salaries not tied to your location</li><li>Async-friendly cultures with flexible hours</li></ul><p>Set your work mode preference to "Remote" and start swiping!</p>',
  },
  {
    id: 'nc4', type: 'new_companies', label: '🏢 Fortune 500 Hiring',
    headline: 'Fortune 500 Companies Are Now on NextQuark!',
    content: '<h3>Enterprise Meets Innovation 🏛️</h3><p>Some of the world\'s largest companies are now hiring through NextQuark:</p><ul><li><strong>JPMorgan Chase</strong> — Fintech and engineering roles</li><li><strong>Johnson & Johnson</strong> — Tech and data science positions</li><li><strong>Walmart</strong> — E-commerce and supply chain tech</li></ul><p>Fortune 500 = great benefits, job stability, and massive scale. If that\'s your vibe, these are for you!</p>',
  },
  {
    id: 'nc5', type: 'new_companies', label: '🏢 Indian Tech Giants',
    headline: 'Flipkart, Razorpay & More Are Hiring on NextQuark!',
    content: '<h3>India\'s Best Tech Companies 🇮🇳</h3><p>Exciting additions to our platform this week:</p><ul><li><strong>Flipkart</strong> — Engineering and product roles across Bangalore</li><li><strong>Razorpay</strong> — Backend, payments, and infrastructure teams</li><li><strong>CRED</strong> — Design, engineering, and data roles</li><li><strong>Zerodha</strong> — Fintech engineering positions</li></ul><p>These companies are known for great culture, competitive pay, and solving hard problems. Check them out!</p>',
  },
]

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

interface IncompleteUser {
  id: string
  email: string
  first_name: string
  completion: number
  missing_fields: string[]
}

interface InactiveUser {
  id: string
  email: string
  first_name: string
  last_sign_in: string
  days_inactive: number
}

interface MilestoneUser {
  user_id: string
  email: string
  first_name: string
  app_count: number
}

export function EmailsScreen() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [logs, setLogs] = useState<EmailLog[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null)
  const [loading, setLoading] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [incompleteUsers, setIncompleteUsers] = useState<IncompleteUser[]>([])
  const [profileReminderLoading, setProfileReminderLoading] = useState(false)
  const [inactiveUsers, setInactiveUsers] = useState<InactiveUser[]>([])
  const [inactivityDays, setInactivityDays] = useState(7)
  const [inactivityLoading, setInactivityLoading] = useState(false)
  const [milestoneUsers, setMilestoneUsers] = useState<MilestoneUser[]>([])
  const [milestoneThreshold, setMilestoneThreshold] = useState(10)
  const [milestoneLoading, setMilestoneLoading] = useState(false)
  const [broadcastType, setBroadcastType] = useState<string>('success_story')
  const [broadcastHeadline, setBroadcastHeadline] = useState('')
  const [broadcastContent, setBroadcastContent] = useState('')
  const [broadcastLoading, setBroadcastLoading] = useState(false)

  const filteredPresets = BROADCAST_PRESETS.filter((p) => p.type === broadcastType)

  const applyPreset = (presetId: string) => {
    const preset = BROADCAST_PRESETS.find((p) => p.id === presetId)
    if (preset) {
      setBroadcastHeadline(preset.headline)
      setBroadcastContent(preset.content)
    }
  }

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

  const fetchIncompleteProfiles = async () => {
    setProfileReminderLoading(true)
    try {
      const res = await fetch('/api/email/complete-profile')
      const data = await res.json()
      setIncompleteUsers(data.users || [])
    } catch {
      toast.error('Failed to fetch incomplete profiles')
    }
    setProfileReminderLoading(false)
  }

  const sendProfileReminders = async () => {
    setProfileReminderLoading(true)
    try {
      const res = await fetch('/api/email/complete-profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const data = await res.json()
      if (data.success) {
        toast.success(`Sent ${data.sent} reminder(s), ${data.failed} failed`)
        fetchLogs()
      } else {
        toast.error(data.error || 'Failed to send reminders')
      }
    } catch {
      toast.error('Failed to send reminders')
    }
    setProfileReminderLoading(false)
  }

  const fetchInactiveUsers = async () => {
    setInactivityLoading(true)
    try {
      const res = await fetch(`/api/email/inactivity?days=${inactivityDays}`)
      const data = await res.json()
      setInactiveUsers(data.users || [])
    } catch { toast.error('Failed to fetch inactive users') }
    setInactivityLoading(false)
  }

  const sendInactivityNudges = async () => {
    setInactivityLoading(true)
    try {
      const res = await fetch('/api/email/inactivity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ days: inactivityDays }) })
      const data = await res.json()
      if (data.success) { toast.success(`Sent ${data.sent} nudge(s), ${data.failed} failed`); fetchLogs() }
      else toast.error(data.error || 'Failed to send nudges')
    } catch { toast.error('Failed to send nudges') }
    setInactivityLoading(false)
  }

  const fetchMilestoneUsers = async () => {
    setMilestoneLoading(true)
    try {
      const res = await fetch(`/api/email/milestone?threshold=${milestoneThreshold}`)
      const data = await res.json()
      setMilestoneUsers(data.users || [])
    } catch { toast.error('Failed to fetch milestone users') }
    setMilestoneLoading(false)
  }

  const sendMilestoneCelebrations = async () => {
    setMilestoneLoading(true)
    try {
      const res = await fetch('/api/email/milestone', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ threshold: milestoneThreshold }) })
      const data = await res.json()
      if (data.success) { toast.success(`Sent ${data.sent} celebration(s), ${data.failed} failed`); fetchLogs() }
      else toast.error(data.error || 'Failed to send celebrations')
    } catch { toast.error('Failed to send celebrations') }
    setMilestoneLoading(false)
  }

  const sendBroadcast = async () => {
    if (!broadcastContent) { toast.error('Please enter content'); return }
    setBroadcastLoading(true)
    try {
      const res = await fetch('/api/email/broadcast', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: broadcastType, headline: broadcastHeadline, content: broadcastContent }) })
      const data = await res.json()
      if (data.success) { toast.success(`Broadcast sent to ${data.sent} user(s), ${data.failed} failed`); fetchLogs() }
      else toast.error(data.error || 'Failed to send broadcast')
    } catch { toast.error('Failed to send broadcast') }
    setBroadcastLoading(false)
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
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="profile-reminders">Profile Reminders</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="settings">SMTP</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[300px_1fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">Templates <InfoTip text="These are the HTML email templates stored in your database. Welcome and Application Submitted emails are sent automatically via Supabase DB triggers. All other templates are used by campaigns you trigger manually from this dashboard." /></CardTitle>
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

        <TabsContent value="campaigns" className="space-y-4">
          {/* Selective Campaigns */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Inactivity Nudge */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base"><Moon className="h-4 w-4" /> Inactivity Nudge <InfoTip text="Manual trigger only. Click Preview to see users who haven't signed in for X days, then Send to email them. Tip: Run this weekly to re-engage dormant users." /></CardTitle>
                    <CardDescription>Users who haven't logged in recently</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2 items-center">
                  <Label className="whitespace-nowrap">Inactive for</Label>
                  <Input type="number" value={inactivityDays} onChange={(e) => setInactivityDays(Number(e.target.value))} className="w-20" min={1} />
                  <Label>days</Label>
                </div>
                {inactiveUsers.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded border p-2 space-y-1">
                    {inactiveUsers.map((u) => (
                      <div key={u.id} className="flex justify-between text-xs">
                        <span className="font-mono">{u.email}</span>
                        <Badge variant="outline">{u.days_inactive}d</Badge>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={fetchInactiveUsers} disabled={inactivityLoading}>
                    <RefreshCw className="mr-1 h-3 w-3" /> Preview
                  </Button>
                  <Button size="sm" onClick={sendInactivityNudges} disabled={inactivityLoading || inactiveUsers.length === 0}>
                    <Send className="mr-1 h-3 w-3" /> Send ({inactiveUsers.length})
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Milestone Celebration */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base"><Trophy className="h-4 w-4" /> Milestone Celebration <InfoTip text="Manual trigger only. Preview shows users who applied to X+ jobs this month. Send to congratulate them. Tip: Run at the end of each month to celebrate active users." /></CardTitle>
                    <CardDescription>Users who hit application milestones this month</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2 items-center">
                  <Label className="whitespace-nowrap">Min applications</Label>
                  <Input type="number" value={milestoneThreshold} onChange={(e) => setMilestoneThreshold(Number(e.target.value))} className="w-20" min={1} />
                </div>
                {milestoneUsers.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded border p-2 space-y-1">
                    {milestoneUsers.map((u) => (
                      <div key={u.user_id} className="flex justify-between text-xs">
                        <span className="font-mono">{u.email}</span>
                        <Badge variant="outline">{u.app_count} apps</Badge>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={fetchMilestoneUsers} disabled={milestoneLoading}>
                    <RefreshCw className="mr-1 h-3 w-3" /> Preview
                  </Button>
                  <Button size="sm" onClick={sendMilestoneCelebrations} disabled={milestoneLoading || milestoneUsers.length === 0}>
                    <Send className="mr-1 h-3 w-3" /> Send ({milestoneUsers.length})
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Broadcast Campaign */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5" /> Broadcast to All Users <InfoTip text="Manual trigger only. Sends to ALL users (auth email + profile email). Pick a pre-written template or write your own. Tip: Use success stories and tips weekly to keep users engaged. Save new feature and company announcements for when you actually have news." /></CardTitle>
              <CardDescription>Send announcements, tips, success stories, or company updates to everyone</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Email Type</Label>
                  <Select value={broadcastType} onValueChange={(v) => { setBroadcastType(v); setBroadcastHeadline(''); setBroadcastContent('') }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="success_story">🌟 Success Story</SelectItem>
                      <SelectItem value="tips_advice">💡 Tips & Advice</SelectItem>
                      <SelectItem value="new_feature">🚀 New Feature</SelectItem>
                      <SelectItem value="new_companies">🏢 New Companies</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Pick a Template</Label>
                  <Select onValueChange={applyPreset}>
                    <SelectTrigger><SelectValue placeholder="Choose a pre-written template..." /></SelectTrigger>
                    <SelectContent>
                      {filteredPresets.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Headline (used in subject)</Label>
                <Input value={broadcastHeadline} onChange={(e) => setBroadcastHeadline(e.target.value)} placeholder="e.g. Priya just landed a role at Google!" />
              </div>
              <div className="space-y-2">
                <Label>Content (HTML supported — edit freely after picking a template)</Label>
                <Textarea value={broadcastContent} onChange={(e) => setBroadcastContent(e.target.value)} rows={8} placeholder="Write your email content here... HTML tags are supported." className="font-mono text-xs" />
              </div>
              <Button onClick={sendBroadcast} disabled={broadcastLoading || !broadcastContent}>
                <Megaphone className="mr-2 h-4 w-4" />
                Send Broadcast to All Users
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profile-reminders">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">Incomplete Profiles <InfoTip text="Manual trigger only. Preview shows users with less than 80% profile completion and what fields are missing. Send to nudge them to complete their profile. Tip: Run this a few days after a wave of new signups." /></CardTitle>
                  <CardDescription>Users with less than 80% profile completion</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={fetchIncompleteProfiles} disabled={profileReminderLoading}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Preview
                  </Button>
                  <Button size="sm" onClick={sendProfileReminders} disabled={profileReminderLoading || incompleteUsers.length === 0}>
                    <Send className="mr-2 h-4 w-4" />
                    Send Reminders ({incompleteUsers.length})
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {incompleteUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Click "Preview" to load users with incomplete profiles</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Completion</TableHead>
                      <TableHead>Missing Fields</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {incompleteUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-mono text-xs">{user.email}</TableCell>
                        <TableCell>{user.first_name || '—'}</TableCell>
                        <TableCell>
                          <Badge variant={user.completion < 40 ? 'destructive' : 'outline'}>
                            {user.completion}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {user.missing_fields.join(', ')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">Email Logs <InfoTip text="Shows all sent and failed emails across all trigger types — both automatic (welcome, application submitted) and manual (campaigns, reminders, broadcasts)." /></CardTitle>
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
              <CardTitle className="flex items-center gap-2">SMTP Configuration <InfoTip text="Your Gmail SMTP credentials are set via environment variables. The test email button sends a sample email to verify everything is working." /></CardTitle>
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
