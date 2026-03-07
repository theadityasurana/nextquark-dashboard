"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, TrendingUp, Clock, AlertCircle, Activity, Info } from "lucide-react"
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface PerformanceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8']

export function PerformanceDialog({ open, onOpenChange }: PerformanceDialogProps) {
  const [loading, setLoading] = useState(false)
  const [timeRange, setTimeRange] = useState('7')
  const [metrics, setMetrics] = useState<any>({
    successRateTrends: [],
    processingTimeByPortal: [],
    errorAnalysis: [],
    throughput: [],
    portalPerformance: [],
    companyPerformance: [],
    timeOfDayAnalysis: [],
    agentUtilization: {},
    totalApplications: 0,
    successfulApplications: 0,
    failedApplications: 0,
  })

  useEffect(() => {
    if (open) {
      fetchMetrics()
    }
  }, [open, timeRange])

  const fetchMetrics = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/agents/performance?range=${timeRange}`)
      const data = await response.json()
      setMetrics(data)
    } catch (error) {
      console.error('Failed to fetch metrics:', error)
    } finally {
      setLoading(false)
    }
  }

  const successRate = metrics.totalApplications > 0
    ? ((metrics.successfulApplications / metrics.totalApplications) * 100).toFixed(1)
    : '0.0'

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Performance Analytics</DialogTitle>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 Days</SelectItem>
                <SelectItem value="30">Last 30 Days</SelectItem>
                <SelectItem value="90">Last 90 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </DialogHeader>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Applications</CardTitle>
                <TooltipProvider>
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Total number of applications in selected time range. See overall volume. <span className="font-semibold">✅ Active</span></p>
                    </TooltipContent>
                  </UITooltip>
                </TooltipProvider>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalApplications}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Success Rate</CardTitle>
                <TooltipProvider>
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Percentage of applications that completed successfully. Formula: (Successful / Total) × 100. Track quality. Below 80% = something is wrong. <span className="font-semibold">✅ Active</span></p>
                    </TooltipContent>
                  </UITooltip>
                </TooltipProvider>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">{successRate}%</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Successful</CardTitle>
                <TooltipProvider>
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Count of applications with status = 'completed'. Track progress. <span className="font-semibold">✅ Active</span></p>
                    </TooltipContent>
                  </UITooltip>
                </TooltipProvider>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-chart-2">{metrics.successfulApplications}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Failed</CardTitle>
                <TooltipProvider>
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Count of applications with status = 'failed'. Monitor errors. Spike = investigate. <span className="font-semibold">✅ Active</span></p>
                    </TooltipContent>
                  </UITooltip>
                </TooltipProvider>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{metrics.failedApplications}</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="trends" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="trends">Trends</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="errors">Errors</TabsTrigger>
            <TabsTrigger value="utilization">Utilization</TabsTrigger>
          </TabsList>

          <TabsContent value="trends" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  <CardTitle className="text-base">Success Rate Trends</CardTitle>
                  <TooltipProvider>
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Daily success rate over time (7/30/90 days). Upward trend = improving. Downward trend = portals changing, need updates. Flat line = stable. <span className="font-semibold">✅ Active</span></p>
                      </TooltipContent>
                    </UITooltip>
                  </TooltipProvider>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={metrics.successRateTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="successRate" stroke="#10b981" name="Success Rate %" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  <CardTitle className="text-base">Applications Per Hour</CardTitle>
                  <TooltipProvider>
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>How many applications submitted each hour (0-23). See peak hours. Identify if working hours setting is working. Optimize scheduling. <span className="font-semibold">✅ Active</span></p>
                      </TooltipContent>
                    </UITooltip>
                  </TooltipProvider>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={metrics.throughput}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="count" fill="#3b82f6" name="Applications" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="performance" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <CardTitle className="text-base">Processing Time by Portal</CardTitle>
                  <TooltipProvider>
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Average minutes to complete application per portal type (Workday, Greenhouse, Lever, Custom). Identify slow portals. Allocate more resources to slow portals. Workday typically slowest (5-10 min). <span className="font-semibold">✅ Active</span></p>
                      </TooltipContent>
                    </UITooltip>
                  </TooltipProvider>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={metrics.processingTimeByPortal}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="portal" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="avgTime" fill="#8b5cf6" name="Avg Time (min)" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">Portal Performance</CardTitle>
                    <TooltipProvider>
                      <UITooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Success rate for each portal type. Low success rate = portal detection failing. Focus debugging on low-performing portals. <span className="font-semibold">✅ Active</span></p>
                        </TooltipContent>
                      </UITooltip>
                    </TooltipProvider>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {metrics.portalPerformance.map((portal: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <span>{portal.portal}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{portal.total} apps</span>
                          <span className="font-semibold text-success">{portal.successRate.toFixed(1)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">Top Companies</CardTitle>
                    <TooltipProvider>
                      <UITooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Top 5 companies by application volume + success rate. See which companies you're targeting most. Check if specific companies have low success rates. <span className="font-semibold">✅ Active</span></p>
                        </TooltipContent>
                      </UITooltip>
                    </TooltipProvider>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {metrics.companyPerformance.slice(0, 5).map((company: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <span className="truncate max-w-[150px]">{company.company}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{company.total} apps</span>
                          <span className="font-semibold text-success">{company.successRate.toFixed(1)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">Best Time to Apply</CardTitle>
                  <TooltipProvider>
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Success rate by hour of day. Find optimal application times. Adjust working hours to peak times. Example: 10 AM - 2 PM might have highest success. <span className="font-semibold">✅ Active</span></p>
                      </TooltipContent>
                    </UITooltip>
                  </TooltipProvider>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={metrics.timeOfDayAnalysis}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="successRate" stroke="#10b981" name="Success Rate %" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="errors" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    <CardTitle className="text-base">Error Distribution</CardTitle>
                    <TooltipProvider>
                      <UITooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm">
                          <p>Breakdown of error types: Timeout (portal too slow), Form Error (couldn't fill form fields), Portal Down (website unavailable), Auth Failed (login/credentials issue), Other (unknown errors). Identify most common failure reason. Fix root cause. <span className="font-semibold">⚠️ Partially Active</span> (shows placeholder data, needs error tracking implementation).</p>
                        </TooltipContent>
                      </UITooltip>
                    </TooltipProvider>
                  </div>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={metrics.errorAnalysis}
                        dataKey="percentage"
                        nameKey="reason"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label
                      >
                        {metrics.errorAnalysis.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">Error Breakdown</CardTitle>
                    <TooltipProvider>
                      <UITooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Same data as pie chart, different view. See exact counts and percentages. <span className="font-semibold">⚠️ Partially Active</span></p>
                        </TooltipContent>
                      </UITooltip>
                    </TooltipProvider>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {metrics.errorAnalysis.map((error: any, idx: number) => (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span>{error.reason}</span>
                          <span className="font-semibold">{error.count}</span>
                        </div>
                        <div className="w-full bg-secondary rounded-full h-2">
                          <div
                            className="bg-destructive h-2 rounded-full"
                            style={{ width: `${error.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="utilization" className="space-y-4 mt-4">
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Active Agents</CardTitle>
                    <TooltipProvider>
                      <UITooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Number of applications currently processing. Monitor real-time activity. <span className="font-semibold">✅ Active</span></p>
                        </TooltipContent>
                      </UITooltip>
                    </TooltipProvider>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-success">{metrics.agentUtilization.active || 0}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Idle Agents</CardTitle>
                    <TooltipProvider>
                      <UITooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Number of applications waiting in queue. High number = need more agents. Low number = agents keeping up. <span className="font-semibold">✅ Active</span></p>
                        </TooltipContent>
                      </UITooltip>
                    </TooltipProvider>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-warning">{metrics.agentUtilization.idle || 0}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Utilization</CardTitle>
                    <TooltipProvider>
                      <UITooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>(Active / Total) × 100. 80-100% = agents fully utilized (good). &lt;50% = agents idle (may need fewer agents). <span className="font-semibold">✅ Active</span></p>
                        </TooltipContent>
                      </UITooltip>
                    </TooltipProvider>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{(metrics.agentUtilization.utilization || 0).toFixed(1)}%</div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">Queue Health</CardTitle>
                  <TooltipProvider>
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Monitor queue depth and processing speed. <span className="font-semibold">✅ Active</span></p>
                      </TooltipContent>
                    </UITooltip>
                  </TooltipProvider>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total in Queue</span>
                    <span className="text-lg font-semibold">{metrics.agentUtilization.idle || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Currently Processing</span>
                    <span className="text-lg font-semibold">{metrics.agentUtilization.active || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Avg Processing Time</span>
                    <span className="text-lg font-semibold">
                      {metrics.processingTimeByPortal.length > 0
                        ? Math.floor(
                            metrics.processingTimeByPortal.reduce((sum: number, p: any) => sum + p.avgTime, 0) /
                              metrics.processingTimeByPortal.length
                          )
                        : 0}m
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
