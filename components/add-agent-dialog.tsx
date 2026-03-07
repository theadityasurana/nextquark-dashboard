"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { toast } from "sonner"
import { Loader2, Plus, Info } from "lucide-react"

interface AddAgentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAgentAdded?: () => void
}

export function AddAgentDialog({ open, onOpenChange, onAgentAdded }: AddAgentDialogProps) {
  const [loading, setLoading] = useState(false)
  const [agentConfig, setAgentConfig] = useState({
    count: 1,
    server_region: 'us-west-2',
    cpu_limit: 2,
    memory_limit: 4,
    browser_version: 'chrome-121',
    assignment_type: 'auto',
    assigned_user_id: '',
    assigned_company: '',
    auto_scaling_enabled: false,
    auto_scaling_queue_threshold: 50,
    auto_scaling_max_agents: 10,
    warm_pool_enabled: false,
    warm_pool_size: 2,
  })

  const updateConfig = (key: string, value: any) => {
    setAgentConfig(prev => ({ ...prev, [key]: value }))
  }

  const createAgent = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/agents/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agentConfig)
      })
      
      if (response.ok) {
        toast.success(`${agentConfig.count} agent(s) created successfully`)
        onOpenChange(false)
        onAgentAdded?.()
      } else {
        toast.error('Failed to create agent')
      }
    } catch (error) {
      console.error('Failed to create agent:', error)
      toast.error('Failed to create agent')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Agent</DialogTitle>
          <p className="text-sm text-muted-foreground mt-2"><span className="font-semibold">⚠️ Current Implementation: SIMULATION MODE</span> - Creates agent metadata (configuration) and returns success message. Does NOT actually spin up infrastructure. <span className="font-semibold">❌ Not Fully Functional</span> - Saves configuration but doesn't provision real infrastructure. In production, this should: 1) Provision Docker container or VM, 2) Install browser automation software, 3) Configure with selected settings, 4) Register agent in system, 5) Start processing queue.</p>
        </DialogHeader>

        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="assignment">Assignment</TabsTrigger>
            <TabsTrigger value="scaling">Auto-Scaling</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4 mt-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Number of Agents</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Create multiple agents at once (1-10). Set to 5 = creates 5 agents simultaneously. <span className="font-semibold">✅ Active</span> - Accepts input, loops creation. Use case: Quickly scale up when queue is large.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                type="number"
                min="1"
                max="10"
                value={agentConfig.count}
                onChange={(e) => updateConfig('count', parseInt(e.target.value))}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Server Region</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Geographic location where agent runs. US West = West coast jobs, US East = East coast jobs, EU West = European jobs, Asia Pacific = Indian/Asian jobs. Why it matters: Lower latency to job portals, appear local to companies, compliance (EU data laws). <span className="font-semibold">✅ Active</span> - Saves to metadata.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Select
                value={agentConfig.server_region}
                onValueChange={(value) => updateConfig('server_region', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="us-west-2">US West (Oregon)</SelectItem>
                  <SelectItem value="us-east-1">US East (Virginia)</SelectItem>
                  <SelectItem value="eu-west-1">EU West (Ireland)</SelectItem>
                  <SelectItem value="ap-south-1">Asia Pacific (Mumbai)</SelectItem>
                  <SelectItem value="ap-southeast-1">Asia Pacific (Singapore)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>CPU Limit (cores)</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>How much processing power each agent gets. 1 core = basic (slow), 2 cores = standard (recommended), 4+ cores = heavy workload. <span className="font-semibold">✅ Active</span></p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Select
                  value={agentConfig.cpu_limit.toString()}
                  onValueChange={(value) => updateConfig('cpu_limit', parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 Core</SelectItem>
                    <SelectItem value="2">2 Cores</SelectItem>
                    <SelectItem value="4">4 Cores</SelectItem>
                    <SelectItem value="8">8 Cores</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>Memory Limit (GB)</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>RAM allocated to each agent. 2 GB = minimum, 4 GB = recommended, 8+ GB = if running multiple browsers. <span className="font-semibold">✅ Active</span></p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Select
                  value={agentConfig.memory_limit.toString()}
                  onValueChange={(value) => updateConfig('memory_limit', parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">2 GB</SelectItem>
                    <SelectItem value="4">4 GB</SelectItem>
                    <SelectItem value="8">8 GB</SelectItem>
                    <SelectItem value="16">16 GB</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Browser Version</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Which browser to use. <span className="font-semibold">✅ Active</span> - Saves to metadata. Recommendation: Latest Chrome (most compatible).</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Select
                value={agentConfig.browser_version}
                onValueChange={(value) => updateConfig('browser_version', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="chrome-121">Chrome 121 (Latest)</SelectItem>
                  <SelectItem value="chrome-120">Chrome 120</SelectItem>
                  <SelectItem value="firefox-122">Firefox 122</SelectItem>
                  <SelectItem value="edge-121">Edge 121</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          <TabsContent value="assignment" className="space-y-4 mt-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Assignment Type</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">
                      <p>How to assign applications to this agent. <span className="font-semibold">Auto (Load Balanced) ✅ RECOMMENDED</span>: Agent picks any application from queue (first-come, first-served). Default, most efficient. <span className="font-semibold">Specific User</span>: Agent only processes applications for one user (filters queue by user_id). Use case: Dedicated agent per user (premium feature). <span className="font-semibold">Specific Company</span>: Agent only applies to one company (filters queue by company_name). Use case: High-volume applications to one company. <span className="font-semibold">Specific Portal Type</span>: Agent specializes in one portal type (filters by Workday, Greenhouse, etc.). Use case: Portal-specific optimizations. All options <span className="font-semibold">✅ Active</span>.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Select
                value={agentConfig.assignment_type}
                onValueChange={(value) => updateConfig('assignment_type', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (Load Balanced)</SelectItem>
                  <SelectItem value="user">Specific User</SelectItem>
                  <SelectItem value="company">Specific Company</SelectItem>
                  <SelectItem value="portal">Specific Portal Type</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {agentConfig.assignment_type === 'user' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>User ID</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Agent will only process applications for this user. Example: User "john@example.com" gets dedicated agent. <span className="font-semibold">✅ Active</span> - Saves user_id.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input
                  placeholder="Enter user ID"
                  value={agentConfig.assigned_user_id}
                  onChange={(e) => updateConfig('assigned_user_id', e.target.value)}
                />
              </div>
            )}

            {agentConfig.assignment_type === 'company' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>Company Name</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Agent will only process applications for this company. Example: Dedicated agent for "Google" applications. <span className="font-semibold">✅ Active</span> - Saves company name.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input
                  placeholder="Enter company name"
                  value={agentConfig.assigned_company}
                  onChange={(e) => updateConfig('assigned_company', e.target.value)}
                />
              </div>
            )}

            {agentConfig.assignment_type === 'portal' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>Portal Type</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Agent will only process applications for this portal type. Example: One agent for Workday, another for Greenhouse. <span className="font-semibold">✅ Active</span> - Saves portal type.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Select
                  value={agentConfig.assigned_company}
                  onValueChange={(value) => updateConfig('assigned_company', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select portal type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="workday">Workday</SelectItem>
                    <SelectItem value="greenhouse">Greenhouse</SelectItem>
                    <SelectItem value="lever">Lever</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </TabsContent>

          <TabsContent value="scaling" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Enable Auto-Scaling</Label>
                <p className="text-xs text-muted-foreground">Automatically add/remove agents based on queue depth</p>
              </div>
              <Switch
                checked={agentConfig.auto_scaling_enabled}
                onCheckedChange={(checked) => updateConfig('auto_scaling_enabled', checked)}
              />
            </div>

            {agentConfig.auto_scaling_enabled && (
              <div className="space-y-4 pl-4">
                <div className="space-y-2">
                  <Label>Queue Threshold</Label>
                  <Input
                    type="number"
                    value={agentConfig.auto_scaling_queue_threshold}
                    onChange={(e) => updateConfig('auto_scaling_queue_threshold', parseInt(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">Add new agent when queue exceeds this number</p>
                </div>

                <div className="space-y-2">
                  <Label>Max Agents</Label>
                  <Input
                    type="number"
                    value={agentConfig.auto_scaling_max_agents}
                    onChange={(e) => updateConfig('auto_scaling_max_agents', parseInt(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">Maximum number of agents to scale to</p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Enable Warm Pool</Label>
                <p className="text-xs text-muted-foreground">Keep idle agents ready for instant processing</p>
              </div>
              <Switch
                checked={agentConfig.warm_pool_enabled}
                onCheckedChange={(checked) => updateConfig('warm_pool_enabled', checked)}
              />
            </div>

            {agentConfig.warm_pool_enabled && (
              <div className="space-y-2 pl-4">
                <Label>Warm Pool Size</Label>
                <Input
                  type="number"
                  value={agentConfig.warm_pool_size}
                  onChange={(e) => updateConfig('warm_pool_size', parseInt(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">Number of agents to keep in warm pool</p>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={createAgent} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Plus className="mr-2 h-4 w-4" />
            Create Agent{agentConfig.count > 1 ? 's' : ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
