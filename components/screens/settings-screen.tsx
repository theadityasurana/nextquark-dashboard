"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"

type AutomationProvider = "skyvern" | "browser_use"

export function SettingsScreen() {
  const [apiKey, setApiKey] = useState("")
  const [browserUseApiKey, setBrowserUseApiKey] = useState("")
  const [provider, setProvider] = useState<AutomationProvider>("skyvern")
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [showKey, setShowKey] = useState(false)
  const [showBuKey, setShowBuKey] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const response = await fetch("/api/settings")
      const data = await response.json()
      if (data.skyvernApiKey) setApiKey(data.skyvernApiKey)
      if (data.browserUseApiKey) setBrowserUseApiKey(data.browserUseApiKey)
      if (data.automationProvider) setProvider(data.automationProvider)

      if (!data.skyvernApiKey) {
        const envResponse = await fetch("/api/settings/env-key")
        const envData = await envResponse.json()
        if (envData.key) setApiKey(envData.key)
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error)
    } finally {
      setFetching(false)
    }
  }

  const handleSave = async () => {
    if (provider === "skyvern" && !apiKey.trim()) {
      toast({ title: "Error", description: "Skyvern API key cannot be empty", variant: "destructive" })
      return
    }
    if (provider === "browser_use" && !browserUseApiKey.trim()) {
      toast({ title: "Error", description: "OpenAI API key is required for Browser Use", variant: "destructive" })
      return
    }

    setLoading(true)
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skyvernApiKey: apiKey,
          browserUseApiKey,
          automationProvider: provider,
        }),
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

  const handleProviderToggle = (checked: boolean) => {
    setProvider(checked ? "browser_use" : "skyvern")
  }

  if (fetching) {
    return <div className="p-8">Loading settings...</div>
  }

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-gray-500 mt-2">Manage your application configuration</p>
      </div>

      {/* Automation Provider Toggle */}
      <Card>
        <CardHeader>
          <CardTitle>Automation Provider</CardTitle>
          <CardDescription>
            Choose which automation engine to use for job applications.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <div className="text-sm font-medium">
                {provider === "skyvern" ? "Skyvern" : "Browser Use"}
              </div>
              <div className="text-xs text-muted-foreground">
                {provider === "skyvern"
                  ? "Cloud-based browser automation via Skyvern API"
                  : "Cloud browser automation via Browser Use API"}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs font-medium ${provider === "skyvern" ? "text-foreground" : "text-muted-foreground"}`}>
                Skyvern
              </span>
              <Switch
                checked={provider === "browser_use"}
                onCheckedChange={handleProviderToggle}
              />
              <span className={`text-xs font-medium ${provider === "browser_use" ? "text-foreground" : "text-muted-foreground"}`}>
                Browser Use
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Skyvern API Key */}
      <Card className={provider !== "skyvern" ? "opacity-50" : ""}>
        <CardHeader>
          <CardTitle>Skyvern API Key</CardTitle>
          <CardDescription>
            Enter your Skyvern API key for cloud-based job application automation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertDescription>
              Keep your API key secure. It will be encrypted and stored securely.
            </AlertDescription>
          </Alert>
          <div className="space-y-2">
            <label className="text-sm font-medium">API Key</label>
            <div className="flex gap-2">
              <Input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your Skyvern API key"
                className="flex-1"
              />
              <Button variant="outline" onClick={() => setShowKey(!showKey)} className="px-3">
                {showKey ? "Hide" : "Show"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Browser Use API Key */}
      <Card className={provider !== "browser_use" ? "opacity-50" : ""}>
        <CardHeader>
          <CardTitle>Browser Use API Key</CardTitle>
          <CardDescription>
            Get your API key from{" "}
            <a href="https://cloud.browser-use.com/new-api-key" target="_blank" rel="noopener noreferrer" className="underline">cloud.browser-use.com</a>.
            This is a hosted cloud service — no self-hosting required.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertDescription>
              Keep your API key secure. It will be stored in your database.
            </AlertDescription>
          </Alert>
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

      <Button onClick={handleSave} disabled={loading} className="w-full">
        {loading ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  )
}
