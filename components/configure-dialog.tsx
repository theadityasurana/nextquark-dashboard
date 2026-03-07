"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { toast } from "sonner"
import { Loader2, Info } from "lucide-react"

interface ConfigureDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ConfigureDialog({ open, onOpenChange }: ConfigureDialogProps) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<any>({
    max_concurrent_agents: 5,
    max_retries: 3,
    retry_delay_seconds: 300,
    page_load_timeout_seconds: 30,
    form_submit_timeout_seconds: 60,
    portal_response_timeout_seconds: 120,
    working_hours_enabled: false,
    working_hours_start: '09:00:00',
    working_hours_end: '18:00:00',
    working_hours_timezone: 'UTC',
    rate_limit_enabled: true,
    rate_limit_delay_seconds: 60,
    rate_limit_per_company: 5,
    auto_pause_enabled: true,
    auto_pause_error_threshold: 0.5,
    browser_user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    browser_viewport_width: 1920,
    browser_viewport_height: 1080,
    browser_headless: true,
    proxy_enabled: false,
    proxy_rotation_enabled: false,
    cover_letter_generation_enabled: true,
    resume_selection_strategy: 'default',
    screening_questions_strategy: 'conservative',
    auto_upload_documents: true,
    auto_send_thank_you: false,
    auto_send_connection_request: false,
  })

  useEffect(() => {
    if (open) {
      fetchConfig()
    }
  }, [open])

  const fetchConfig = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/agents/config')
      const data = await response.json()
      if (data.config) {
        setConfig(data.config)
      }
    } catch (error) {
      console.error('Failed to fetch config:', error)
      toast.error('Failed to load configuration')
    } finally {
      setLoading(false)
    }
  }

  const saveConfig = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/agents/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      })
      
      if (response.ok) {
        toast.success('Configuration saved successfully')
        onOpenChange(false)
      } else {
        toast.error('Failed to save configuration')
      }
    } catch (error) {
      console.error('Failed to save config:', error)
      toast.error('Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  const updateConfig = (key: string, value: any) => {
    setConfig((prev: any) => ({ ...prev, [key]: value }))
  }

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Agent Configuration</DialogTitle>
        </DialogHeader>

        <TooltipProvider>
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="timeouts">Timeouts</TabsTrigger>
            <TabsTrigger value="browser">Browser</TabsTrigger>
            <TabsTrigger value="behavior">Behavior</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4 mt-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Max Concurrent Agents</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    <p className="text-xs">Maximum number of job applications that can be processed at the same time. Set to 5 = 5 applications running simultaneously. Higher = faster but more resources. <span className="font-semibold">Status: ✅ Active</span> (saves to database). Recommendation: Start with 3-5.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                type="number"
                value={config.max_concurrent_agents}
                onChange={(e) => updateConfig('max_concurrent_agents', parseInt(e.target.value))}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Max Retries</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    <p className="text-xs">How many times to retry a failed application before giving up. Set to 3 = retry 3 more times after initial failure. <span className="font-semibold">Status: ✅ Active</span>. Recommendation: 2-3 retries is optimal.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                type="number"
                value={config.max_retries}
                onChange={(e) => updateConfig('max_retries', parseInt(e.target.value))}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Retry Delay (seconds)</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    <p className="text-xs">How long to wait before retrying a failed application. 300 seconds = 5 minutes wait before retry. Prevents rate limiting. <span className="font-semibold">Status: ✅ Active</span>. Recommendation: 300-600 seconds.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                type="number"
                value={config.retry_delay_seconds}
                onChange={(e) => updateConfig('retry_delay_seconds', parseInt(e.target.value))}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label>Working Hours</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    <p className="text-xs">Only process applications during specific hours (e.g., 9 AM - 6 PM). Some companies detect bot activity at odd hours. Applying during business hours looks more human. <span className="font-semibold">Status: ✅ Active</span>. Recommendation: Enable to avoid detection.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Switch
                checked={config.working_hours_enabled}
                onCheckedChange={(checked) => updateConfig('working_hours_enabled', checked)}
              />
            </div>

            {config.working_hours_enabled && (
              <div className="grid grid-cols-2 gap-4 pl-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label>Start Time</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs">Set 09:00 for 9 AM. Match timezone of companies you're applying to.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    type="time"
                    value={config.working_hours_start}
                    onChange={(e) => updateConfig('working_hours_start', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label>End Time</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs">Set 18:00 for 6 PM. Agents will only work during this window.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    type="time"
                    value={config.working_hours_end}
                    onChange={(e) => updateConfig('working_hours_end', e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label>Rate Limiting</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    <p className="text-xs">Add delays between applications to the same company. Prevents getting flagged for submitting too many applications too quickly. <span className="font-semibold">Status: ✅ Active</span>. Recommendation: Always keep ON.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Switch
                checked={config.rate_limit_enabled}
                onCheckedChange={(checked) => updateConfig('rate_limit_enabled', checked)}
              />
            </div>

            {config.rate_limit_enabled && (
              <div className="grid grid-cols-2 gap-4 pl-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label>Delay (seconds)</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs">60 seconds = 1 minute between applications to same company. Recommendation: 60-120 seconds.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    type="number"
                    value={config.rate_limit_delay_seconds}
                    onChange={(e) => updateConfig('rate_limit_delay_seconds', parseInt(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label>Per Company Limit</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs">Max applications to one company per day. Set to 5 = max 5 apps/company/day. Recommendation: 3-5 to avoid spam detection.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    type="number"
                    value={config.rate_limit_per_company}
                    onChange={(e) => updateConfig('rate_limit_per_company', parseInt(e.target.value))}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label>Auto-Pause on Errors</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    <p className="text-xs">Automatically stop all agents if too many applications are failing. If 50% of applications fail, something is wrong (portal down, credentials expired). <span className="font-semibold">Status: ✅ Active</span>. Recommendation: Keep ON with 0.5 threshold.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Switch
                checked={config.auto_pause_enabled}
                onCheckedChange={(checked) => updateConfig('auto_pause_enabled', checked)}
              />
            </div>

            {config.auto_pause_enabled && (
              <div className="space-y-2 pl-4">
                <div className="flex items-center gap-2">
                  <Label>Error Threshold (0-1)</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">Percentage of failures that triggers auto-pause. 0.5 = 50%. If 50% of last 10 applications fail, pause everything. Recommendation: 0.4-0.5 (40-50%).</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="1"
                  value={config.auto_pause_error_threshold}
                  onChange={(e) => updateConfig('auto_pause_error_threshold', parseFloat(e.target.value))}
                />
              </div>
            )}
          </TabsContent>

          <TabsContent value="timeouts" className="space-y-4 mt-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Page Load Timeout (seconds)</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    <p className="text-xs">How long to wait for a job portal page to load before giving up. 30 seconds = if page doesn't load in 30s, mark as failed. Prevents agents from getting stuck waiting forever on slow/broken portals. <span className="font-semibold">Status: ✅ Active</span>. Recommendation: 30-60 seconds (some portals are slow).</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                type="number"
                value={config.page_load_timeout_seconds}
                onChange={(e) => updateConfig('page_load_timeout_seconds', parseInt(e.target.value))}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Form Submit Timeout (seconds)</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    <p className="text-xs">How long to wait after clicking "Submit" before considering it failed. 60 seconds = wait 1 minute for form submission to complete. <span className="font-semibold">Status: ✅ Active</span>. Recommendation: 60-90 seconds.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                type="number"
                value={config.form_submit_timeout_seconds}
                onChange={(e) => updateConfig('form_submit_timeout_seconds', parseInt(e.target.value))}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Portal Response Timeout (seconds)</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    <p className="text-xs">Maximum time to wait for any response from the job portal. 120 seconds = if portal doesn't respond in 2 minutes, timeout. <span className="font-semibold">Status: ✅ Active</span>. Recommendation: 120-180 seconds.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                type="number"
                value={config.portal_response_timeout_seconds}
                onChange={(e) => updateConfig('portal_response_timeout_seconds', parseInt(e.target.value))}
              />
            </div>
          </TabsContent>

          <TabsContent value="browser" className="space-y-4 mt-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>User Agent</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    <p className="text-xs">The browser identity string sent to websites. Makes your bot look like a real Chrome browser on Windows. <span className="font-semibold">Status: ✅ Active</span>. Recommendation: Use latest Chrome user agent, update monthly.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                value={config.browser_user_agent}
                onChange={(e) => updateConfig('browser_user_agent', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>Viewport Width</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">Browser window width. 1920 = Full HD. Some portals render differently on mobile vs desktop.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  type="number"
                  value={config.browser_viewport_width}
                  onChange={(e) => updateConfig('browser_viewport_width', parseInt(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>Viewport Height</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">Browser window height. 1080 = Full HD. <span className="font-semibold">Status: ✅ Active</span>. Recommendation: 1920x1080 or 1366x768.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  type="number"
                  value={config.browser_viewport_height}
                  onChange={(e) => updateConfig('browser_viewport_height', parseInt(e.target.value))}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label>Headless Mode</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    <p className="text-xs">Run browser without visible window (background mode). ON = faster, no UI. OFF = you can see what's happening. <span className="font-semibold">Status: ✅ Active</span>. Recommendation: ON for production, OFF for debugging.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Switch
                checked={config.browser_headless}
                onCheckedChange={(checked) => updateConfig('browser_headless', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label>Proxy Enabled</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    <p className="text-xs">Route traffic through proxy servers to hide your real IP. Avoid IP bans, appear from different locations. <span className="font-semibold">Status: ⚠️ Partially Active</span> (saves to database, needs proxy service integration). Recommendation: Enable if applying to 100+ jobs/day.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Switch
                checked={config.proxy_enabled}
                onCheckedChange={(checked) => updateConfig('proxy_enabled', checked)}
              />
            </div>

            {config.proxy_enabled && (
              <div className="flex items-center justify-between pl-4">
                <div className="flex items-center gap-2">
                  <Label>Proxy Rotation</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">Change proxy IP for each application. Makes each application appear from different location. <span className="font-semibold">Status: ⚠️ Partially Active</span>. Recommendation: Enable if using proxies.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Switch
                  checked={config.proxy_rotation_enabled}
                  onCheckedChange={(checked) => updateConfig('proxy_rotation_enabled', checked)}
                />
              </div>
            )}
          </TabsContent>

          <TabsContent value="behavior" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label>Cover Letter Generation</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    <p className="text-xs">Automatically generate custom cover letters using AI. ON = AI writes cover letter for each job. OFF = use default. <span className="font-semibold">Status: ⚠️ Partially Active</span> (needs AI integration like OpenAI/Claude). Recommendation: ON if you have AI API key.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Switch
                checked={config.cover_letter_generation_enabled}
                onCheckedChange={(checked) => updateConfig('cover_letter_generation_enabled', checked)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Resume Selection Strategy</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    <p className="text-xs">Which resume to use for each application. Default = same resume for all jobs. Tailored = different resume for "Software Engineer" vs "Data Scientist". AI Optimized = AI modifies resume for each job. <span className="font-semibold">Status: ⚠️ Partially Active</span>. Recommendation: Start with "Default".</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Select
                value={config.resume_selection_strategy}
                onValueChange={(value) => updateConfig('resume_selection_strategy', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default Resume</SelectItem>
                  <SelectItem value="tailored">Tailored by Job Type</SelectItem>
                  <SelectItem value="optimized">AI Optimized</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Screening Questions Strategy</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    <p className="text-xs">How to answer "Are you authorized to work?" type questions. Conservative = only answer if 100% sure (fewer applications, higher quality). Moderate = answer most questions with reasonable guesses. Aggressive = answer all questions optimistically (more applications, may lie). <span className="font-semibold">Status: ⚠️ Partially Active</span>. Recommendation: Start with "Conservative".</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Select
                value={config.screening_questions_strategy}
                onValueChange={(value) => updateConfig('screening_questions_strategy', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="conservative">Conservative</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="aggressive">Aggressive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label>Auto-Upload Documents</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    <p className="text-xs">Automatically upload resume, cover letter, portfolio. ON = uploads files automatically. OFF = skip file uploads. <span className="font-semibold">Status: ✅ Active</span>. Recommendation: Keep ON.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Switch
                checked={config.auto_upload_documents}
                onCheckedChange={(checked) => updateConfig('auto_upload_documents', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label>Auto-Send Thank You</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    <p className="text-xs">Send thank you email after application submission. ON = sends "Thank you for considering my application" email. <span className="font-semibold">Status: ❌ Not Active</span> (needs email service integration). Recommendation: OFF (can seem spammy).</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Switch
                checked={config.auto_send_thank_you}
                onCheckedChange={(checked) => updateConfig('auto_send_thank_you', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label>Auto-Send Connection Request</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    <p className="text-xs">Send LinkedIn connection request to recruiter. ON = automatically connects with hiring manager on LinkedIn. <span className="font-semibold">Status: ❌ Not Active</span> (needs LinkedIn API integration). Recommendation: OFF (LinkedIn may ban you).</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Switch
                checked={config.auto_send_connection_request}
                onCheckedChange={(checked) => updateConfig('auto_send_connection_request', checked)}
              />
            </div>
          </TabsContent>
        </Tabs>
        </TooltipProvider>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={saveConfig} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Configuration
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
