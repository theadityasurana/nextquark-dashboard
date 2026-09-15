"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"

interface Props {
  configKey: string
  title: string
  descOn: string
  descOff: string
  initialValue: boolean
  initialUpdatedAt: string | null
}

export function AppConfigToggle({ configKey, title, descOn, descOff, initialValue, initialUpdatedAt }: Props) {
  const [enabled, setEnabled] = useState(initialValue)
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const toggle = async (val: boolean) => {
    setEnabled(val)
    setSaving(true)
    try {
      const res = await fetch('/api/app-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: configKey, value: val ? 'true' : 'false' }),
      })
      if (!res.ok) throw new Error()
      setUpdatedAt(new Date().toISOString())
      toast({ title: `${title}: ${val ? 'ON' : 'OFF'}` })
    } catch {
      setEnabled(!val)
      toast({ title: 'Failed to update', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${enabled ? 'text-primary' : 'text-muted-foreground'}`}>
              {enabled ? 'ON' : 'OFF'}
            </span>
            <Switch checked={enabled} onCheckedChange={toggle} disabled={saving} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">{enabled ? descOn : descOff}</p>
        {updatedAt && (
          <p className="text-xs text-muted-foreground">
            Last updated: {new Date(updatedAt).toLocaleString()}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
