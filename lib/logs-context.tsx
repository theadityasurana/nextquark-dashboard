"use client"

import { createContext, useContext, useState, ReactNode } from "react"

export interface LogEntry {
  id: string
  timestamp: string
  level: "info" | "warn" | "error"
  agentId: string
  message: string
  applicationId?: string
}

interface LogsContextType {
  logs: LogEntry[]
  addLog: (log: LogEntry) => void
  clearLogs: () => void
}

const LogsContext = createContext<LogsContextType | undefined>(undefined)

export function LogsProvider({ children }: { children: ReactNode }) {
  const [logs, setLogs] = useState<LogEntry[]>([])

  const addLog = (log: LogEntry) => {
    setLogs((prev) => [log, ...prev])
  }

  const clearLogs = () => {
    setLogs([])
  }

  return (
    <LogsContext.Provider value={{ logs, addLog, clearLogs }}>
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
