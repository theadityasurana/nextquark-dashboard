"use client"

import { createContext, useContext, useState, ReactNode, useEffect } from "react"

export interface AgentDetails {
  firstName: string
  lastName: string
  jobTitle: string
  companyName: string
}

export interface LogEntry {
  id: string
  timestamp: string
  level: "info" | "warn" | "error"
  agentId: string
  message: string
  applicationId?: string
  agentDetails?: AgentDetails
}

interface LogsContextType {
  logs: LogEntry[]
  agentDetailsMap: Record<string, AgentDetails>
  addLog: (log: LogEntry) => void
  clearLogs: () => void
}

const LogsContext = createContext<LogsContextType | undefined>(undefined)

export function LogsProvider({ children }: { children: ReactNode }) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [agentDetailsMap, setAgentDetailsMap] = useState<Record<string, AgentDetails>>({})

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const response = await fetch('/api/logs')
        const data = await response.json()
        if (data.logs) {
          const formattedLogs = data.logs.map((log: any) => ({
            id: log.id,
            timestamp: new Date(log.timestamp).toLocaleTimeString(),
            level: log.level,
            agentId: log.agent_id,
            message: log.message,
            applicationId: log.application_id
          }))
          setLogs(formattedLogs)
          setAgentDetailsMap(data.agentDetails || {})
        }
      } catch (error) {
        console.error('Failed to fetch logs:', error)
      }
    }
    
    fetchLogs()
  }, [])

  const addLog = (log: LogEntry) => {
    setLogs((prev) => [log, ...prev])
    // Sync to API
    fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(log)
    }).catch(console.error)
  }

  const clearLogs = () => {
    setLogs([])
  }

  return (
    <LogsContext.Provider value={{ logs, agentDetailsMap, addLog, clearLogs }}>
      {children}
    </LogsContext.Provider>
  )
}

export function useLogs() {
  const context = useContext(LogsContext)
  if (!context) {
    throw new Error("useLogs must be used within LogsProvider")
  }
  return context
}
