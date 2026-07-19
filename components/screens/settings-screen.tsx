"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useToast } from "@/components/ui/use-toast"
import { Badge } from "@/components/ui/badge"

export function SettingsScreen() {
  const [browserUseApiKey, setBrowserUseApiKey] = useState("")
  const [browserbaseApiKey, setBrowserbaseApiKey] = useState("")
  const [browserbaseProjectId, setBrowserbaseProjectId] = useState("")
  const [geminiApiKey, setGeminiApiKey] = useState("")
  const [automationProvider, setAutomationProvider] = useState("browser_use")
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [showBuKey, setShowBuKey] = useState(false)
  const [showBbKey, setShowBbKey] = useState(false)
  const [showGeminiKey, setShowGeminiKey] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const response = await fetch("/api/settings")
      const data = await response.json()
      if (data.browserUseApiKey) setBrowserUseApiKey(data.browserUseApiKey)
      if (data.browserbaseApiKey) setBrowserbaseApiKey(data.browserbaseApiKey)
      if (data.browserbaseProjectId) setBrowserbaseProjectId(data.browserbaseProjectId)
      if (data.geminiApiKey) setGeminiApiKey(data.geminiApiKey)
      if (data.automationProvider) setAutomationProvider(data.automationProvider)
    } catch (error) {
      console.error("Failed to fetch settings:", error)
    } finally {
      setFetching(false)
    }
  }

  const handleSave = async () => {
    if (automationProvider === "browser_use" && !browserUseApiKey.trim()) {
      toast({ title: "Error", description: "Browser Use API key cannot be empty when it's the active provider", variant: "destructive" })
      return
    }
    if (automationProvider === "browserbase" && (!browserbaseApiKey.trim() || !browserbaseProjectId.trim() || !geminiApiKey.trim())) {
      toast({ title: "Error", description: "Browserbase API key, Project ID, and Gemini API key are all required", variant: "destructive" })
      return
    }

    setLoading(true)
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ browserUseApiKey, browserbaseApiKey, browserbaseProjectId, geminiApiKey, automationProvider }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to save settings")

      toast({ title: "Success", description: "Settings saved successfully" })
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save settings",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  if (fetching) {
    return <div className="p-8">Loading settings...</div>
  }

  return (
    <div className="space-y-6 p-4 sm:p-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Settings</h1>
        <p className="text-gray-500 mt-2">Manage your application configuration</p>
      </div>

      {/* Automation Provider Toggle */}
      <Card>
        <CardHeader>
          <CardTitle>Automation Provider</CardTitle>
          <CardDescription>
            Choose which browser automation service to use for job applications.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => setAutomationProvider("browser_use")}
              className={`flex-1 p-4 rounded-lg border-2 transition-all ${
                automationProvider === "browser_use"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/30"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm">Browser Use</span>
                {automationProvider === "browser_use" && <Badge variant="default" className="text-[10px]">Active</Badge>}
              </div>
              <p className="text-xs text-muted-foreground text-left">
                Prompt-based. Send one instruction, AI does everything. Simpler but costs more per task.
              </p>
            </button>
            <button
              onClick={() => setAutomationProvider("browserbase")}
              className={`flex-1 p-4 rounded-lg border-2 transition-all ${
                automationProvider === "browserbase"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/30"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm">Browserbase</span>
                {automationProvider === "browserbase" && <Badge variant="default" className="text-[10px]">Active</Badge>}
              </div>
              <p className="text-xs text-muted-foreground text-left">
                Stagehand + Gemini Flash. More control, cheaper per task, better scalability.
              </p>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Browser Use API Key */}
      <Card className={automationProvider !== "browser_use" ? "opacity-50" : ""}>
        <CardHeader>
          <CardTitle>Browser Use API Key</CardTitle>
          <CardDescription>
            Get your API key from{" "}
            <a href="https://cloud.browser-use.com/new-api-key" target="_blank" rel="noopener noreferrer" className="underline">cloud.browser-use.com</a>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">API Key</label>
            <div className="flex gap-2">
              <Input
                type={showBuKey ? "text" : "password"}
                value={browserUseApiKey}
                onChange={(e) => setBrowserUseApiKey(e.target.value)}
                placeholder="Enter your Browser Use API key"
                className="flex-1"
              />
              <Button variant="outline" onClick={() => setShowBuKey(!showBuKey)} className="px-3">
                {showBuKey ? "Hide" : "Show"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Browserbase Settings */}
      <Card className={automationProvider !== "browserbase" ? "opacity-50" : ""}>
        <CardHeader>
          <CardTitle>Browserbase + Stagehand</CardTitle>
          <CardDescription>
            Get your keys from{" "}
            <a href="https://www.browserbase.com/sign-in" target="_blank" rel="noopener noreferrer" className="underline">browserbase.com</a>.
            Uses Gemini Flash for AI actions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertDescription>
              You need a Browserbase API key, Project ID, and a Google Gemini API key.
            </AlertDescription>
          </Alert>
          <div className="space-y-2">
            <label className="text-sm font-medium">Browserbase API Key</label>
            <div className="flex gap-2">
              <Input
                type={showBbKey ? "text" : "password"}
                value={browserbaseApiKey}
                onChange={(e) => setBrowserbaseApiKey(e.target.value)}
                placeholder="Enter your Browserbase API key"
                className="flex-1"
              />
              <Button variant="outline" onClick={() => setShowBbKey(!showBbKey)} className="px-3">
                {showBbKey ? "Hide" : "Show"}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Browserbase Project ID</label>
            <Input
              value={browserbaseProjectId}
              onChange={(e) => setBrowserbaseProjectId(e.target.value)}
              placeholder="Enter your Browserbase Project ID"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Gemini API Key</label>
            <div className="flex gap-2">
              <Input
                type={showGeminiKey ? "text" : "password"}
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                placeholder="Enter your Google Gemini API key"
                className="flex-1"
              />
              <Button variant="outline" onClick={() => setShowGeminiKey(!showGeminiKey)} className="px-3">
                {showGeminiKey ? "Hide" : "Show"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Get from{" "}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="underline">aistudio.google.com/apikey</a>
            </p>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={loading} className="w-full">
        {loading ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  )
}
