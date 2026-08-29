"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import { Eye, EyeOff, Save, Zap, Globe } from "lucide-react"

export function SettingsScreen() {
  const [browserUseApiKey, setBrowserUseApiKey] = useState("")
  const [browserbaseApiKey, setBrowserbaseApiKey] = useState("")
  const [browserbaseProjectId, setBrowserbaseProjectId] = useState("")
  const [geminiApiKey, setGeminiApiKey] = useState("")
  const [captchaSolverApiKey, setCaptchaSolverApiKey] = useState("")
  const [showCaptchaKey, setShowCaptchaKey] = useState(false)
  const [kernelApiKey, setKernelApiKey] = useState("")
  const [openAiApiKey, setOpenAiApiKey] = useState("")
  const [automationProvider, setAutomationProvider] = useState("browser_use")
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [showBuKey, setShowBuKey] = useState(false)
  const [showBbKey, setShowBbKey] = useState(false)
  const [showGeminiKey, setShowGeminiKey] = useState(false)
  const [showKernelKey, setShowKernelKey] = useState(false)
  const [showOpenAiKey, setShowOpenAiKey] = useState(false)
  const { toast } = useToast()

  useEffect(() => { fetchSettings() }, [])

  const fetchSettings = async () => {
    try {
      const response = await fetch("/api/settings")
      const data = await response.json()
      if (data.browserUseApiKey) setBrowserUseApiKey(data.browserUseApiKey)
      if (data.browserbaseApiKey) setBrowserbaseApiKey(data.browserbaseApiKey)
      if (data.browserbaseProjectId) setBrowserbaseProjectId(data.browserbaseProjectId)
      if (data.geminiApiKey) setGeminiApiKey(data.geminiApiKey)
      if (data.captchaSolverApiKey) setCaptchaSolverApiKey(data.captchaSolverApiKey)
      if (data.kernelApiKey) setKernelApiKey(data.kernelApiKey)
      if (data.openAiApiKey) setOpenAiApiKey(data.openAiApiKey)
      if (data.automationProvider) setAutomationProvider(data.automationProvider)
    } catch (error) {
      console.error("Failed to fetch settings:", error)
    } finally {
      setFetching(false)
    }
  }

  const handleSave = async () => {
    if (automationProvider === "browser_use" && !browserUseApiKey.trim()) {
      toast({ title: "Error", description: "Browser Use API key is required for the active provider", variant: "destructive" })
      return
    }
    if (automationProvider === "browserbase" && (!browserbaseApiKey.trim() || !browserbaseProjectId.trim() || !geminiApiKey.trim())) {
      toast({ title: "Error", description: "Browserbase API key, Project ID, and Gemini API key are all required", variant: "destructive" })
      return
    }
    if (automationProvider === "kernel" && !kernelApiKey.trim()) {
      toast({ title: "Error", description: "Kernel API key is required for the active provider", variant: "destructive" })
      return
    }

    setLoading(true)
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ browserUseApiKey, browserbaseApiKey, browserbaseProjectId, geminiApiKey, kernelApiKey, openAiApiKey, captchaSolverApiKey, automationProvider }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to save settings")
      toast({ title: "Saved", description: "Settings updated successfully" })
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to save settings", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  if (fetching) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Loading settings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-gradient">Settings</h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">Manage automation provider and API credentials</p>
      </div>

      {/* Provider Toggle */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            Automation Provider
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => setAutomationProvider("browser_use")}
              className={`flex-1 p-4 rounded-lg border transition-all text-left ${
                automationProvider === "browser_use"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-border/80 hover:bg-accent/30"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-semibold">Browser Use</span>
                {automationProvider === "browser_use" && (
                  <Badge className="bg-primary/15 text-primary border-primary/20 text-[10px]">Active</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Prompt-based. One instruction, AI handles everything. Simpler but higher cost per task.</p>
            </button>
            <button
              onClick={() => setAutomationProvider("browserbase")}
              className={`flex-1 p-4 rounded-lg border transition-all text-left ${
                automationProvider === "browserbase"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-border/80 hover:bg-accent/30"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-semibold">Browserbase</span>
                {automationProvider === "browserbase" && (
                  <Badge className="bg-primary/15 text-primary border-primary/20 text-[10px]">Active</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Stagehand + Gemini Flash. More control, lower cost per task, better scalability.</p>
            </button>
            <button
              onClick={() => setAutomationProvider("kernel")}
              className={`flex-1 p-4 rounded-lg border transition-all text-left ${
                automationProvider === "kernel"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-border/80 hover:bg-accent/30"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-semibold">Kernel</span>
                {automationProvider === "kernel" && (
                  <Badge className="bg-primary/15 text-primary border-primary/20 text-[10px]">Active</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Kernel cloud browsers + Stagehand. Stealth mode, CDP-connected, built-in live view.</p>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Browser Use API Key */}
      <Card className={`bg-card border-border transition-opacity ${automationProvider !== "browser_use" ? "opacity-40 pointer-events-none" : ""}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Browser Use API Key
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">
              API Key —{" "}
              <a href="https://cloud.browser-use.com/new-api-key" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                cloud.browser-use.com
              </a>
            </Label>
            <div className="flex gap-2">
              <Input
                type={showBuKey ? "text" : "password"}
                value={browserUseApiKey}
                onChange={(e) => setBrowserUseApiKey(e.target.value)}
                placeholder="bu-••••••••••••••••"
                className="flex-1 bg-accent/30 border-border font-mono text-sm"
              />
              <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => setShowBuKey(!showBuKey)}>
                {showBuKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Kernel Settings */}
      <Card className={`bg-card border-border transition-opacity ${automationProvider !== "kernel" ? "opacity-40 pointer-events-none" : ""}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Kernel
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="rounded-lg border border-border bg-accent/20 px-3 py-2.5 text-xs text-muted-foreground">
            Requires a Kernel API key.{" "}
            <a href="https://kernel.sh" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              kernel.sh
            </a>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Kernel API Key</Label>
            <div className="flex gap-2">
              <Input
                type={showKernelKey ? "text" : "password"}
                value={kernelApiKey}
                onChange={(e) => setKernelApiKey(e.target.value)}
                placeholder="sk_••••••••••••••••"
                className="flex-1 bg-accent/30 border-border font-mono text-sm"
              />
              <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => setShowKernelKey(!showKernelKey)}>
                {showKernelKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">
              OpenAI API Key (fallback model) —{" "}
              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                platform.openai.com
              </a>
            </Label>
            <div className="flex gap-2">
              <Input
                type={showOpenAiKey ? "text" : "password"}
                value={openAiApiKey}
                onChange={(e) => setOpenAiApiKey(e.target.value)}
                placeholder="sk-••••••••••••••••"
                className="flex-1 bg-accent/30 border-border font-mono text-sm"
              />
              <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => setShowOpenAiKey(!showOpenAiKey)}>
                {showOpenAiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Browserbase Settings */}
      <Card className={`bg-card border-border transition-opacity ${automationProvider !== "browserbase" ? "opacity-40 pointer-events-none" : ""}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Browserbase + Stagehand
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-accent/20 px-3 py-2.5 text-xs text-muted-foreground">
            Requires a Browserbase API key, Project ID, and a Google Gemini API key.{" "}
            <a href="https://www.browserbase.com/sign-in" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              browserbase.com
            </a>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Browserbase API Key</Label>
            <div className="flex gap-2">
              <Input
                type={showBbKey ? "text" : "password"}
                value={browserbaseApiKey}
                onChange={(e) => setBrowserbaseApiKey(e.target.value)}
                placeholder="bb-••••••••••••••••"
                className="flex-1 bg-accent/30 border-border font-mono text-sm"
              />
              <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => setShowBbKey(!showBbKey)}>
                {showBbKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Browserbase Project ID</Label>
            <Input
              value={browserbaseProjectId}
              onChange={(e) => setBrowserbaseProjectId(e.target.value)}
              placeholder="prj_••••••••••••••••"
              className="bg-accent/30 border-border font-mono text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">
              Gemini API Key —{" "}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                aistudio.google.com
              </a>
            </Label>
            <div className="flex gap-2">
              <Input
                type={showGeminiKey ? "text" : "password"}
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                placeholder="AIza••••••••••••••••"
                className="flex-1 bg-accent/30 border-border font-mono text-sm"
              />
              <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => setShowGeminiKey(!showGeminiKey)}>
                {showGeminiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">
              CAPTCHA Solver API Key (optional) —{" "}
              <a href="https://capsolver.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                capsolver.com
              </a>
            </Label>
            <div className="flex gap-2">
              <Input
                type={showCaptchaKey ? "text" : "password"}
                value={captchaSolverApiKey}
                onChange={(e) => setCaptchaSolverApiKey(e.target.value)}
                placeholder="CAP-••••••••••••••••"
                className="flex-1 bg-accent/30 border-border font-mono text-sm"
              />
              <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => setShowCaptchaKey(!showCaptchaKey)}>
                {showCaptchaKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Solves invisible challenges (reCAPTCHA v3, Turnstile) that block a submit without showing a widget. Without a key, runs fall back to the browser provider&apos;s solver and then to a person.
            </p>
          </div>
        </CardContent>
      </Card>

      <Button
        onClick={handleSave}
        disabled={loading}
        className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 self-start"
      >
        <Save className="h-4 w-4" />
        {loading ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  )
}
