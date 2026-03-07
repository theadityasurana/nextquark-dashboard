"use client"

import { createContext, useContext, useCallback, type ReactNode } from "react"
import useSWR, { mutate as globalMutate } from "swr"
import type { Company, Job, Application } from "@/lib/mock-data"
import { mockApplications } from "@/lib/mock-data"

function mapCompany(c: Record<string, unknown>): Company {
  const logoUrl = c.logo_url as string | undefined
  return {
    id: c.id as string,
    name: c.name as string,
    logoInitial: (c.logo_initial as string) || (c.name as string)?.charAt(0) || "C",
    logoUrl: logoUrl && logoUrl.trim() ? logoUrl : undefined,
    website: c.website as string || "",
    careersUrl: c.careers_url as string || "",
    linkedinUrl: c.linkedin_url as string | undefined,
    description: c.description as string | undefined,
    industry: c.industry as string || "Technology",
    size: c.size as string || "Unknown",
    location: c.location as string | string[] || "Remote",
    portalType: c.portal_type as string || "Custom",
    portalStatus: c.portal_status as string || "active",
    totalJobs: (c.total_jobs as number) || 0,
    appsToday: (c.apps_today as number) || 0,
    successRate: Number(c.success_rate) || 0,
    avgTime: c.avg_time as string || "-",
    addedAt: c.added_at as string || new Date().toISOString().split("T")[0],
    benefits: (c.benefits as string[]) || [],
  }
}

function mapJob(j: Record<string, unknown>): Job {
  return {
    id: j.id as string,
    companyId: j.company_id as string,
    companyName: j.company_name as string,
    companyInitial: (j.company_initial as string) || "",
    title: j.title as string,
    location: j.location as string || "Remote",
    type: j.type as string || "Full-time",
    salaryRange: j.salary_range as string || "Not specified",
    experience: j.experience as string || "Not specified",
    portalUrl: j.portal_url as string || "",
    jobUrl: j.job_url as string || "",
    companyWebsite: j.company_website as string | undefined,
    companyLinkedin: j.company_linkedin as string | undefined,
    status: j.status as string || "queued",
    totalApps: (j.total_apps as number) || 0,
    rightSwipes: (j.right_swipes as number) || 0,
    successRate: Number(j.success_rate) || 0,
    avgTime: j.avg_time as string || "-",
    postedAt: j.posted_at as string || new Date().toISOString().split("T")[0],
    createdAt: j.created_at as string,
    description: j.description as string || "",
    requirements: (j.requirements as string[]) || [],
    skills: (j.skills as string[]) || [],
    benefits: (j.benefits as string[]) || [],
    detailedRequirements: (j.detailed_requirements as string) || "",
    educationLevel: (j.education_level as string) || undefined,
    workAuthorization: (j.work_authorization as string) || undefined,
  }
}

function mapApplication(a: Record<string, unknown>): Application {
  return {
    id: a.id as string,
    userId: a.user_id as string,
    userName: a.user?.name as string || "",
    userEmail: a.user?.email as string || "",
    userPhone: a.user?.phone as string || "",
    userLocation: a.user?.location as string || "",
    companyId: a.company_id as string,
    companyName: a.company?.name as string || "",
    jobTitle: a.job?.title as string || "",
    jobId: a.job_id as string,
    status: a.status as ApplicationStatus,
    agentId: a.agent_id as string | null,
    progressStep: (a.progress_step as number) || 0,
    totalSteps: (a.total_steps as number) || 5,
    stepDescription: a.step_description as string || "",
    startedAt: a.started_at as string || "",
    duration: a.duration as string || "-",
    createdAt: a.created_at as string,
    screenshot: a.screenshot as string | undefined,
  }
}

const fetcher = async (url: string) => {
  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.log("[v0] fetcher error for", url, "status:", res.status)
      return []
    }
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch (err) {
    console.log("[v0] fetcher exception for", url, err)
    return []
  }
}

interface DataContextType {
  companies: Company[]
  jobs: Job[]
  applications: Application[]
  setCompanies: (companies: Company[]) => void
  setJobs: (jobs: Job[]) => void
  setApplications: (apps: Application[]) => void
  addCompany: (company: Record<string, unknown>) => Promise<Company | null>
  addJob: (job: Record<string, unknown>) => Promise<Job | null>
  updateJob: (id: string, updates: Record<string, unknown>) => Promise<Job | null>
  refreshCompanies: () => void
  refreshJobs: () => void
  isLoading: boolean
}

const DataContext = createContext<DataContextType | undefined>(undefined)

export function DataProvider({ children }: { children: ReactNode }) {
  const { data: rawCompanies, isLoading: loadingCompanies } = useSWR("/api/companies", fetcher, {
    fallbackData: [],
    revalidateOnFocus: false,
  })
  const { data: rawJobs, isLoading: loadingJobs } = useSWR("/api/jobs", fetcher, {
    fallbackData: [],
    revalidateOnFocus: false,
  })
  const { data: rawApplications, isLoading: loadingApplications } = useSWR("/api/applications/queue", async (url) => {
    const res = await fetch(url)
    if (!res.ok) return []
    const json = await res.json()
    return json.data || []
  }, {
    fallbackData: [],
    revalidateOnFocus: false,
  })

  const companies: Company[] = Array.isArray(rawCompanies) ? rawCompanies.map(mapCompany) : []
  const jobs: Job[] = Array.isArray(rawJobs) ? rawJobs.map(mapJob) : []
  const applications: Application[] = Array.isArray(rawApplications) ? rawApplications.map(mapApplication) : []

  const setCompanies = useCallback(() => {
    globalMutate("/api/companies")
  }, [])

  const setJobs = useCallback(() => {
    globalMutate("/api/jobs")
  }, [])

  const setApplications = useCallback(() => {}, [])

  const addCompany = useCallback(async (companyData: Record<string, unknown>): Promise<Company | null> => {
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(companyData),
      })
      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || "Failed to create company")
      }
      const raw = await res.json()
      const mapped = mapCompany(raw)
      globalMutate("/api/companies")
      return mapped
    } catch (err) {
      console.error("Error adding company:", err)
      return null
    }
  }, [])

  const addJob = useCallback(async (jobData: Record<string, unknown>): Promise<Job | null> => {
    try {
      console.log("[v0] addJob called with:", JSON.stringify(jobData, null, 2))
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jobData),
      })
      if (!res.ok) {
        const errData = await res.json()
        console.log("[v0] addJob API error:", errData.error)
        throw new Error(errData.error || "Failed to create job")
      }
      const raw = await res.json()
      const mapped = mapJob(raw)
      globalMutate("/api/jobs")
      globalMutate("/api/companies")
      return mapped
    } catch (err) {
      console.error("Error adding job:", err)
      return null
    }
  }, [])

  const updateJob = useCallback(async (id: string, updates: Record<string, unknown>): Promise<Job | null> => {
    try {
      const res = await fetch("/api/jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      })
      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || "Failed to update job")
      }
      const raw = await res.json()
      const mapped = mapJob(raw)
      globalMutate("/api/jobs")
      return mapped
    } catch (err) {
      console.error("Error updating job:", err)
      return null
    }
  }, [])

  const refreshCompanies = useCallback(() => {
    globalMutate("/api/companies")
  }, [])

  const refreshJobs = useCallback(() => {
    globalMutate("/api/jobs")
  }, [])

  return (
    <DataContext.Provider
      value={{
        companies,
        jobs,
        applications,
        setCompanies,
        setJobs,
        setApplications,
        addCompany,
        addJob,
        updateJob,
        refreshCompanies,
        refreshJobs,
        isLoading: loadingCompanies || loadingJobs || loadingApplications,
      }}
    >
      {children}
    </DataContext.Provider>
  )
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error("useData must be used within DataProvider")
  return ctx
}
