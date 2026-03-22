"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useToast } from "@/components/ui/use-toast"

export function SettingsScreen() {
  const [browserUseApiKey, setBrowserUseApiKey] = useState("")
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [showBuKey, setShowBuKey] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const response = await fetch("/api/settings")
      const data = await response.json()
      if (data.browserUseApiKey) setBrowserUseApiKey(data.browserUseApiKey)
    } catch (error) {
      console.error("Failed to fetch settings:", error)
    } finally {
      setFetching(false)
    }
  }

  const handleSave = async () => {
    if (!browserUseApiKey.trim()) {
      toast({ title: "Error", description: "Browser Use API key cannot be empty", variant: "destructive" })
      return
    }

    setLoading(true)
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ browserUseApiKey }),
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
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-gray-500 mt-2">Manage your application configuration</p>
      </div>

      {/* Browser Use API Key */}
      <Card>
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
