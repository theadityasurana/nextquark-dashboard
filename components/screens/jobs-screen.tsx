"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { StatusBadge } from "@/components/status-badge"
import { useData } from "@/lib/data-context"
import type { Job } from "@/lib/mock-data"
import { LOCATIONS, EDUCATION_QUALIFICATIONS, WORK_MODES, WORK_AUTHORIZATION } from "@/lib/locations"
import {
  Search, Plus, Upload, ChevronRight, ExternalLink, Copy, Edit2, Pause, Trash2,
  Link, Globe, Linkedin, Briefcase, MapPin, DollarSign, Clock, GraduationCap,
  X, Check, ListChecks, Sparkles, Gift, FileText, Save, Zap, Loader, ChevronsUpDown
} from "lucide-react"

export function JobsScreen() {
  const { companies, jobs, addJob, updateJob, isLoading } = useData()
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [showAddForm, setShowAddForm] = useState(false)
  const [showBatchForm, setShowBatchForm] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<Record<string, unknown>>({})
  const [batchCompanyId, setBatchCompanyId] = useState("")
  const [batchPortalUrl, setBatchPortalUrl] = useState("")
  const [isScraping, setIsScraping] = useState(false)
  const [scrapedJobs, setScrapedJobs] = useState<any[]>([])
  const [currentJobIndex, setCurrentJobIndex] = useState(0)

  // Temp inputs for array fields during add
  const [newRequirement, setNewRequirement] = useState("")
  const [newSkill, setNewSkill] = useState("")
  const [newBenefit, setNewBenefit] = useState("")
  const [newLocation, setNewLocation] = useState("")
  const [newWorkMode, setNewWorkMode] = useState("")
  const [newWorkAuth, setNewWorkAuth] = useState("")

  // Temp inputs for array fields during edit
  const [editNewRequirement, setEditNewRequirement] = useState("")
  const [editNewSkill, setEditNewSkill] = useState("")
  const [editNewBenefit, setEditNewBenefit] = useState("")

  // Add Job form state
  const [jobForm, setJobForm] = useState({
    portalUrl: "",
    jobUrl: "",
    companyId: "",
    companyWebsite: "",
    companyLinkedin: "",
    title: "",
    location: "",
    type: "",
    experience: "",
    salaryMin: "",
    salaryMax: "",
    description: "",
    requirements: [] as string[],
    skills: [] as string[],
    benefits: [] as string[],
    detailedRequirements: "",
    educationLevel: "",
    workAuthorization: "",
  })
  const [isAutoPopulating, setIsAutoPopulating] = useState(false)

  const filteredJobs = jobs.filter((job) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      job.title.toLowerCase().includes(q) ||
      job.companyName.toLowerCase().includes(q) ||
      job.id.toLowerCase().includes(q)
    )
  })

  const resetJobForm = () => {
    setJobForm({
      portalUrl: "", jobUrl: "", companyId: "", companyWebsite: "", companyLinkedin: "",
      title: "", location: "", type: "", experience: "",
      salaryMin: "", salaryMax: "", description: "",
      requirements: [], skills: [], benefits: [], detailedRequirements: "",
      educationLevel: "", workAuthorization: "",
    })
    setNewRequirement("")
    setNewSkill("")
    setNewBenefit("")
    setNewLocation("")
    setNewWorkMode("")
    setNewWorkAuth("")
    setIsAutoPopulating(false)
  }

  const handleAutoPopulate = async () => {
    if (!jobForm.jobUrl || !jobForm.companyId || isAutoPopulating) return
    setIsAutoPopulating(true)
    try {
      const response = await fetch("/api/scraper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portalUrl: jobForm.jobUrl }),
      })
      const data = await response.json()
      if (data.jobs && data.jobs.length > 0) {
        const scrapedJob = data.jobs[0]
        setJobForm((prev) => ({
          ...prev,
          title: scrapedJob.title || prev.title,
          location: scrapedJob.location || prev.location,
          type: scrapedJob.type || prev.type,
          experience: scrapedJob.experience || prev.experience,
          salaryMin: scrapedJob.salaryMin || prev.salaryMin,
          salaryMax: scrapedJob.salaryMax || prev.salaryMax,
          description: scrapedJob.description || prev.description,
          requirements: scrapedJob.requirements?.length > 0 ? scrapedJob.requirements : prev.requirements,
          skills: scrapedJob.skills?.length > 0 ? scrapedJob.skills : prev.skills,
          benefits: scrapedJob.benefits?.length > 0 ? scrapedJob.benefits : prev.benefits,
          detailedRequirements: scrapedJob.detailedRequirements || prev.detailedRequirements,
        }))
      }
    } catch (error) {
      console.error("Auto-populate error:", error)
    } finally {
      setIsAutoPopulating(false)
    }
  }

  const handleAddJob = async () => {
    if (!jobForm.title || isSaving) return
    setIsSaving(true)

    const company = companies.find((c) => c.id === jobForm.companyId)
    const salaryRange = jobForm.salaryMin && jobForm.salaryMax
      ? `$${Number(jobForm.salaryMin).toLocaleString()} - $${Number(jobForm.salaryMax).toLocaleString()}`
      : jobForm.salaryMin
        ? `$${Number(jobForm.salaryMin).toLocaleString()}+`
        : "Competitive"

    console.log("[v0] handleAddJob - portalUrl:", jobForm.portalUrl, "jobUrl:", jobForm.jobUrl)

    const result = await addJob({
      company_id: jobForm.companyId || null,
      company_name: company?.name || "Custom Company",
      company_initial: company?.logoInitial || "C",
      title: jobForm.title,
      location: jobForm.location || "Remote",
      type: jobForm.type || "Full-time",
      salary_range: salaryRange,
      experience: jobForm.experience || "Not specified",
      portal_url: jobForm.portalUrl || "",
      job_url: jobForm.jobUrl || "",
      company_website: jobForm.companyWebsite || company?.website || null,
      company_linkedin: jobForm.companyLinkedin || company?.linkedinUrl || null,
      description: jobForm.description || "",
      requirements: jobForm.requirements,
      skills: jobForm.skills,
      benefits: jobForm.benefits,
      detailed_requirements: jobForm.detailedRequirements,
      education_level: jobForm.educationLevel,
      work_authorization: jobForm.workAuthorization,
    })

    setIsSaving(false)
    if (result) {
      setShowAddForm(false)
      resetJobForm()
    } else {
      alert("Failed to add job. Make sure you have run both SQL migrations in your Supabase SQL Editor.")
    }
  }

  const startEditing = (job: Job) => {
    setIsEditing(true)
    setEditForm({
      title: job.title,
      location: job.location,
      type: job.type,
      salary_range: job.salaryRange,
      experience: job.experience,
      portal_url: job.portalUrl,
      job_url: job.jobUrl,
      company_website: job.companyWebsite || "",
      company_linkedin: job.companyLinkedin || "",
      description: job.description,
      requirements: [...(job.requirements || [])],
      skills: [...(job.skills || [])],
      benefits: [...(job.benefits || [])],
      detailed_requirements: job.detailedRequirements || "",
      education_level: job.educationLevel || "",
      work_authorization: job.workAuthorization || "",
      status: job.status,
    })
    setEditNewRequirement("")
    setEditNewSkill("")
    setEditNewBenefit("")
  }

  const handleSaveEdit = async () => {
    if (!selectedJob || isSaving) return
    setIsSaving(true)

    const result = await updateJob(selectedJob.id, editForm)

    setIsSaving(false)
    if (result) {
      setSelectedJob(result)
      setIsEditing(false)
    }
  }

  const handleDeleteJob = async () => {
    if (!selectedJob || isSaving) return
    if (!confirm(`Are you sure you want to delete "${selectedJob.title}"?`)) return
    
    setIsSaving(true)
    try {
      const res = await fetch(`/api/jobs?id=${selectedJob.id}`, { method: "DELETE" })
      if (res.ok) {
        setSelectedJob(null)
      }
    } catch (err) {
      console.error("Error deleting job:", err)
    } finally {
      setIsSaving(false)
    }
  }

  const cancelEditing = () => {
    setIsEditing(false)
    setEditForm({})
    setEditNewRequirement("")
    setEditNewSkill("")
    setEditNewBenefit("")
  }

  // Helper to add/remove items from array fields in add form
  const addToArray = (field: "requirements" | "skills" | "benefits", value: string) => {
    if (!value.trim()) return
    setJobForm((prev) => ({ ...prev, [field]: [...prev[field], value.trim()] }))
  }
  const removeFromArray = (field: "requirements" | "skills" | "benefits", index: number) => {
    setJobForm((prev) => ({ ...prev, [field]: prev[field].filter((_, i) => i !== index) }))
  }

  // Helper to add/remove items from array fields in edit form
  const editAddToArray = (field: string, value: string) => {
    if (!value.trim()) return
    setEditForm((prev) => ({ ...prev, [field]: [...(prev[field] as string[] || []), value.trim()] }))
  }
  const editRemoveFromArray = (field: string, index: number) => {
    setEditForm((prev) => ({
      ...prev,
      [field]: (prev[field] as string[]).filter((_, i) => i !== index),
    }))
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage all job listings across all companies</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="bg-secondary text-secondary-foreground">{jobs.length} total</Badge>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={async () => {
            setIsSaving(true)
            try {
              const res = await fetch("/api/sync-jobs", { method: "POST" })
              const data = await res.json()
              alert(`Synced ${data.addedCount || 0} new jobs from ${data.companiesChecked || 0} companies`)
            } catch (err) {
              alert("Failed to sync jobs")
            } finally {
              setIsSaving(false)
            }
          }} disabled={isSaving}>
            <Zap className="h-3 w-3" /> {isSaving ? "Syncing..." : "Sync Latest Jobs"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            onClick={() => setShowBatchForm(true)}
          >
            <Zap className="h-3 w-3" /> Add Job Batch
          </Button>
          <Button
            size="sm"
            className="gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => setShowAddForm(true)}
          >
            <Plus className="h-3 w-3" /> Add Job
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search jobs..." className="pl-9 bg-card border-border" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
      </div>

      {/* Jobs Table */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <div className="hidden md:grid grid-cols-[80px_1fr_2fr_80px_100px_1fr_40px] gap-4 px-4 py-3 border-b border-border text-xs text-muted-foreground uppercase tracking-wider font-medium">
            <span>ID</span>
            <span>Company</span>
            <span>Title</span>
            <span>Apps</span>
            <span>Status</span>
            <span>Portal URL</span>
            <span></span>
          </div>
          <div className="divide-y divide-border">
            {filteredJobs.map((job) => {
              const company = companies.find((c) => c.id === job.companyId)
              return (
              <div
                key={job.id}
                className="grid grid-cols-1 md:grid-cols-[80px_1fr_2fr_80px_100px_1fr_40px] gap-2 md:gap-4 px-4 py-3 hover:bg-accent/50 transition-colors cursor-pointer items-center"
                onClick={() => { setSelectedJob(job); setIsEditing(false) }}
              >
                <span className="text-xs font-mono text-muted-foreground">#{job.id}</span>
                <div className="flex items-center gap-2">
                  {company?.logoUrl ? (
                    <img src={company.logoUrl} alt={job.companyName} className="h-6 w-6 rounded object-cover shrink-0" crossOrigin="anonymous" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                  ) : (
                    <div className="flex h-6 w-6 items-center justify-center rounded bg-accent text-[10px] font-bold text-accent-foreground shrink-0">
                      {job.companyInitial}
                    </div>
                  )}
                  <span className="text-sm font-medium hidden md:block">{job.companyName}</span>
                </div>
                <div>
                  <p className="text-sm font-medium">{job.title}</p>
                  <p className="text-[11px] text-muted-foreground md:hidden">{job.companyName} - {job.location}</p>
                </div>
                <span className="text-sm font-medium hidden md:block">{job.rightSwipes ?? 0}</span>
                <div className="hidden md:block"><StatusBadge status={job.status} /></div>
                <span className="text-xs text-muted-foreground truncate hidden md:block">{job.portalUrl || "-"}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground hidden md:block" />
              </div>
              )
            })}
            {filteredJobs.length === 0 && (
              <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                {isLoading ? "Loading jobs..." : "No jobs found. Add your first job to get started."}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ========== ADD JOB DIALOG ========== */}
      <Dialog open={showAddForm} onOpenChange={(open) => { if (!open) { setShowAddForm(false); resetJobForm() } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Briefcase className="h-5 w-5 text-primary" />
              Add New Job
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-5 mt-2">
            {/* Company Selection - FIRST */}
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium">Company <span className="text-destructive">*</span></Label>
              <Select value={jobForm.companyId} onValueChange={(v) => setJobForm({ ...jobForm, companyId: v })}>
                <SelectTrigger className="bg-accent/30 border-border">
                  <SelectValue placeholder="Select a company" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      <span className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded bg-accent text-[9px] font-bold text-accent-foreground shrink-0">
                          {company.logoInitial}
                        </span>
                        {company.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Job Listing URL - for auto-populate */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="job-url" className="text-sm font-medium">
                Job Listing URL <span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="job-url"
                    placeholder="e.g. https://uber.com/careers/senior-engineer-12345"
                    className="pl-9 bg-accent/30 border-border"
                    value={jobForm.jobUrl}
                    onChange={(e) => setJobForm({ ...jobForm, jobUrl: e.target.value })}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0 gap-1.5"
                  onClick={handleAutoPopulate}
                  disabled={!jobForm.jobUrl || !jobForm.companyId || isAutoPopulating}
                >
                  {isAutoPopulating ? (
                    <>
                      <Loader className="h-3 w-3 animate-spin" />
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3 w-3" /> Auto-fill
                    </>
                  )}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">Paste the job listing URL and click Auto-fill to populate the form</p>
            </div>

            {/* Job Portal URL */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="portal-url" className="text-sm font-medium">
                Application Portal URL
              </Label>
              <div className="relative">
                <Link className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="portal-url"
                  placeholder="e.g. https://careers.uber.com/apply/12345"
                  className="pl-9 bg-accent/30 border-border"
                  value={jobForm.portalUrl}
                  onChange={(e) => setJobForm({ ...jobForm, portalUrl: e.target.value })}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">The direct link to the application portal page</p>
            </div>

            <div className="h-px bg-border" />

            {/* Job Title */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="job-title" className="text-sm font-medium">
                Job Title / Role <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="job-title"
                  placeholder="e.g. Senior Software Engineer"
                  className="pl-9 bg-accent/30 border-border"
                  value={jobForm.title}
                  onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })}
                />
              </div>
            </div>

            {/* Type & Experience */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium">Job Type</Label>
                <Select value={jobForm.type} onValueChange={(v) => setJobForm({ ...jobForm, type: v })}>
                  <SelectTrigger className="bg-accent/30 border-border">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="Full-time">Full-time</SelectItem>
                    <SelectItem value="Part-time">Part-time</SelectItem>
                    <SelectItem value="Contract">Contract</SelectItem>
                    <SelectItem value="Internship">Internship</SelectItem>
                    <SelectItem value="Freelance">Freelance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium">Experience Level</Label>
                <Select value={jobForm.experience} onValueChange={(v) => setJobForm({ ...jobForm, experience: v })}>
                  <SelectTrigger className="bg-accent/30 border-border">
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="Entry Level (0-1 years)">Entry Level (0-1 years)</SelectItem>
                    <SelectItem value="Junior (1-3 years)">Junior (1-3 years)</SelectItem>
                    <SelectItem value="Mid-Level (3-5 years)">Mid-Level (3-5 years)</SelectItem>
                    <SelectItem value="Senior (5-8 years)">Senior (5-8 years)</SelectItem>
                    <SelectItem value="Lead (8+ years)">Lead (8+ years)</SelectItem>
                    <SelectItem value="Principal/Staff (10+ years)">Principal/Staff (10+ years)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Location */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="job-location" className="text-sm font-medium">Location</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="job-location"
                  placeholder="e.g. San Francisco, CA or Remote"
                  className="pl-9 bg-accent/30 border-border"
                  value={jobForm.location}
                  onChange={(e) => setJobForm({ ...jobForm, location: e.target.value })}
                />
              </div>
            </div>

            {/* Salary Range */}
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium">Salary Range (USD)</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Min e.g. 120000"
                    className="pl-9 bg-accent/30 border-border"
                    type="number"
                    value={jobForm.salaryMin}
                    onChange={(e) => setJobForm({ ...jobForm, salaryMin: e.target.value })}
                  />
                </div>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Max e.g. 180000"
                    className="pl-9 bg-accent/30 border-border"
                    type="number"
                    value={jobForm.salaryMax}
                    onChange={(e) => setJobForm({ ...jobForm, salaryMax: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="job-desc" className="text-sm font-medium">Job Description</Label>
              <Textarea
                id="job-desc"
                placeholder="Brief description of the role..."
                className="bg-accent/30 border-border min-h-[80px] resize-none"
                value={jobForm.description}
                onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })}
              />
            </div>

            <div className="h-px bg-border" />

            {/* Requirements (bullet points) */}
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
                Requirements
              </Label>
              <p className="text-[11px] text-muted-foreground">Add individual requirements as bullet points</p>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. 5+ years of experience in React"
                  className="bg-accent/30 border-border flex-1"
                  value={newRequirement}
                  onChange={(e) => setNewRequirement(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      addToArray("requirements", newRequirement)
                      setNewRequirement("")
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => { addToArray("requirements", newRequirement); setNewRequirement("") }}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              {jobForm.requirements.length > 0 && (
                <div className="flex flex-col gap-1.5 mt-1">
                  {jobForm.requirements.map((req, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm bg-accent/30 rounded-md px-3 py-1.5">
                      <span className="text-muted-foreground text-xs">{"•"}</span>
                      <span className="flex-1">{req}</span>
                      <button onClick={() => removeFromArray("requirements", i)} className="text-muted-foreground hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Skills */}
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                Skills
              </Label>
              <p className="text-[11px] text-muted-foreground">Add skills (1-3 words each)</p>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. React, TypeScript, Node.js"
                  className="bg-accent/30 border-border flex-1"
                  value={newSkill}
                  onChange={(e) => setNewSkill(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      addToArray("skills", newSkill)
                      setNewSkill("")
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => { addToArray("skills", newSkill); setNewSkill("") }}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              {jobForm.skills.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {jobForm.skills.map((skill, i) => (
                    <Badge key={i} variant="secondary" className="gap-1 pr-1 bg-accent text-accent-foreground">
                      {skill}
                      <button onClick={() => removeFromArray("skills", i)} className="hover:text-destructive">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Benefits */}
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Gift className="h-3.5 w-3.5 text-muted-foreground" />
                Benefits
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. Health insurance, 401k matching"
                  className="bg-accent/30 border-border flex-1"
                  value={newBenefit}
                  onChange={(e) => setNewBenefit(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      addToArray("benefits", newBenefit)
                      setNewBenefit("")
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => { addToArray("benefits", newBenefit); setNewBenefit("") }}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              {jobForm.benefits.length > 0 && (
                <div className="flex flex-col gap-1.5 mt-1">
                  {jobForm.benefits.map((b, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm bg-accent/30 rounded-md px-3 py-1.5">
                      <Check className="h-3 w-3 text-green-500 shrink-0" />
                      <span className="flex-1">{b}</span>
                      <button onClick={() => removeFromArray("benefits", i)} className="text-muted-foreground hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Detailed Requirements */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="detailed-req" className="text-sm font-medium flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                Detailed Requirements
              </Label>
              <Textarea
                id="detailed-req"
                placeholder="Full detailed requirements for the position..."
                className="bg-accent/30 border-border min-h-[120px] resize-none"
                value={jobForm.detailedRequirements}
                onChange={(e) => setJobForm({ ...jobForm, detailedRequirements: e.target.value })}
              />
            </div>

            <div className="h-px bg-border" />

            {/* Education Level */}
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
                Education Level
              </Label>
              <Select value={jobForm.educationLevel} onValueChange={(v) => setJobForm({ ...jobForm, educationLevel: v })}>
                <SelectTrigger className="bg-accent/30 border-border">
                  <SelectValue placeholder="Select education level" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {EDUCATION_QUALIFICATIONS.map((edu) => (
                    <SelectItem key={edu} value={edu}>{edu}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Work Authorization */}
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium">Work Authorization / Visa Requirements</Label>
              <Select value={jobForm.workAuthorization} onValueChange={(v) => setJobForm({ ...jobForm, workAuthorization: v })}>
                <SelectTrigger className="bg-accent/30 border-border">
                  <SelectValue placeholder="Select work authorization requirement" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {WORK_AUTHORIZATION.map((auth) => (
                    <SelectItem key={auth} value={auth}>{auth}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="mt-4 gap-2">
            <Button variant="outline" onClick={() => { setShowAddForm(false); resetJobForm() }} className="text-xs">
              Cancel
            </Button>
            <Button
              className="text-xs bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
              onClick={handleAddJob}
              disabled={!jobForm.title || isSaving}
            >
              <Plus className="h-3 w-3" /> {isSaving ? "Saving..." : "Add to Queue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========== JOB DETAIL / EDIT MODAL ========== */}
      <Dialog open={!!selectedJob} onOpenChange={() => { setSelectedJob(null); setIsEditing(false) }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-card border-border">
          {selectedJob && !isEditing && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-foreground">
                    {selectedJob.companyInitial}
                  </div>
                  <div>
                    <DialogTitle className="text-lg">{selectedJob.title}</DialogTitle>
                    <p className="text-xs text-muted-foreground">{selectedJob.companyName} - {selectedJob.location}</p>
                  </div>
                </div>
              </DialogHeader>

              <div className="flex flex-col gap-5 mt-2">
                {/* Job Info */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Job Information</h3>
                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    <span className="text-muted-foreground">Job ID</span>
                    <span className="font-mono text-xs">#{selectedJob.id}</span>
                    <span className="text-muted-foreground">Type</span>
                    <span className="font-medium">{selectedJob.type}</span>
                    <span className="text-muted-foreground">Salary</span>
                    <span className="font-medium">{selectedJob.salaryRange}</span>
                    <span className="text-muted-foreground">Experience</span>
                    <span className="font-medium">{selectedJob.experience}</span>
                    <span className="text-muted-foreground">Education</span>
                    <span className="font-medium">{selectedJob.educationLevel || "Not specified"}</span>
                    <span className="text-muted-foreground">Work Auth</span>
                    <span className="font-medium">{selectedJob.workAuthorization || "Not specified"}</span>
                    <span className="text-muted-foreground">Posted</span>
                    <span className="font-medium">{selectedJob.postedAt}</span>
                    <span className="text-muted-foreground">Status</span>
                    <StatusBadge status={selectedJob.status} />
                  </div>
                </div>

                {/* Links */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Links</h3>
                  <div className="flex flex-col gap-2">
                    {selectedJob.portalUrl && (
                      <div className="flex items-center gap-2 text-sm">
                        <Link className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-[11px] text-muted-foreground shrink-0">Portal:</span>
                        <span className="text-muted-foreground truncate flex-1">{selectedJob.portalUrl}</span>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => window.open(selectedJob.portalUrl.startsWith("http") ? selectedJob.portalUrl : `https://${selectedJob.portalUrl}`, "_blank")}><ExternalLink className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => navigator.clipboard.writeText(selectedJob.portalUrl)}><Copy className="h-3.5 w-3.5" /></Button>
                      </div>
                    )}
                    {selectedJob.jobUrl && (
                      <div className="flex items-center gap-2 text-sm">
                        <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-[11px] text-muted-foreground shrink-0">Listing:</span>
                        <span className="text-muted-foreground truncate flex-1">{selectedJob.jobUrl}</span>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => window.open(selectedJob.jobUrl.startsWith("http") ? selectedJob.jobUrl : `https://${selectedJob.jobUrl}`, "_blank")}><ExternalLink className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => navigator.clipboard.writeText(selectedJob.jobUrl)}><Copy className="h-3.5 w-3.5" /></Button>
                      </div>
                    )}
                    {selectedJob.companyWebsite && (
                      <div className="flex items-center gap-2 text-sm">
                        <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-[11px] text-muted-foreground shrink-0">Website:</span>
                        <span className="text-muted-foreground truncate flex-1">{selectedJob.companyWebsite}</span>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => window.open(selectedJob.companyWebsite?.startsWith("http") ? selectedJob.companyWebsite : `https://${selectedJob.companyWebsite}`, "_blank")}><ExternalLink className="h-3.5 w-3.5" /></Button>
                      </div>
                    )}
                    {selectedJob.companyLinkedin && (
                      <div className="flex items-center gap-2 text-sm">
                        <Linkedin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-[11px] text-muted-foreground shrink-0">LinkedIn:</span>
                        <span className="text-muted-foreground truncate flex-1">{selectedJob.companyLinkedin}</span>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => window.open(selectedJob.companyLinkedin?.startsWith("http") ? selectedJob.companyLinkedin : `https://${selectedJob.companyLinkedin}`, "_blank")}><ExternalLink className="h-3.5 w-3.5" /></Button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Application Stats */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Application Stats</h3>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-md bg-accent/50 py-2">
                      <p className="text-sm font-bold">{selectedJob.successRate}%</p>
                      <p className="text-[10px] text-muted-foreground">Success Rate</p>
                    </div>
                    <div className="rounded-md bg-accent/50 py-2">
                      <p className="text-sm font-bold">{selectedJob.rightSwipes ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground">Right Swipes</p>
                    </div>
                    <div className="rounded-md bg-accent/50 py-2">
                      <p className="text-sm font-bold">{selectedJob.avgTime}</p>
                      <p className="text-[10px] text-muted-foreground">Avg Time</p>
                    </div>
                  </div>
                </div>

                {/* Description */}
                {selectedJob.description && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Job Description</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{selectedJob.description}</p>
                  </div>
                )}

                {/* Requirements */}
                {selectedJob.requirements && selectedJob.requirements.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                      <ListChecks className="h-3.5 w-3.5" /> Requirements
                    </h3>
                    <ul className="flex flex-col gap-1.5">
                      {selectedJob.requirements.map((req, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <span className="mt-1 shrink-0">{"•"}</span>
                          <span>{req}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Skills */}
                {selectedJob.skills && selectedJob.skills.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5" /> Skills
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedJob.skills.map((skill, i) => (
                        <Badge key={i} variant="secondary" className="bg-accent text-accent-foreground">{skill}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Benefits */}
                {selectedJob.benefits && selectedJob.benefits.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                      <Gift className="h-3.5 w-3.5" /> Benefits
                    </h3>
                    <ul className="flex flex-col gap-1.5">
                      {selectedJob.benefits.map((b, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <Check className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Detailed Requirements */}
                {selectedJob.detailedRequirements && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" /> Detailed Requirements
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{selectedJob.detailedRequirements}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => startEditing(selectedJob)}>
                    <Edit2 className="h-3 w-3" /> Edit
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs gap-1.5 text-warning">
                    <Pause className="h-3 w-3" /> Pause
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs gap-1.5 text-destructive" onClick={handleDeleteJob} disabled={isSaving}>
                    <Trash2 className="h-3 w-3" /> {isSaving ? "Deleting..." : "Delete"}
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* ========== EDIT MODE ========== */}
          {selectedJob && isEditing && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                    <Edit2 className="h-5 w-5" />
                  </div>
                  <div>
                    <DialogTitle className="text-lg">Edit Job</DialogTitle>
                    <p className="text-xs text-muted-foreground">Editing #{selectedJob.id} - Changes save to Supabase</p>
                  </div>
                </div>
              </DialogHeader>

              <div className="flex flex-col gap-5 mt-2">
                {/* Title */}
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-medium">Job Title <span className="text-destructive">*</span></Label>
                  <Input
                    className="bg-accent/30 border-border"
                    value={(editForm.title as string) || ""}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  />
                </div>

                {/* Status */}
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-medium">Status</Label>
                  <Select value={(editForm.status as string) || "queued"} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                    <SelectTrigger className="bg-accent/30 border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      <SelectItem value="queued">Queued</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* URLs */}
                <div className="grid grid-cols-1 gap-4">
                  <div className="flex flex-col gap-2">
                    <Label className="text-sm font-medium">Application Portal URL</Label>
                    <div className="relative">
                      <Link className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        className="pl-9 bg-accent/30 border-border"
                        value={(editForm.portal_url as string) || ""}
                        onChange={(e) => setEditForm({ ...editForm, portal_url: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label className="text-sm font-medium">Job Listing URL</Label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        className="pl-9 bg-accent/30 border-border"
                        value={(editForm.job_url as string) || ""}
                        onChange={(e) => setEditForm({ ...editForm, job_url: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Company URLs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <Label className="text-sm font-medium">Company Website</Label>
                    <Input
                      className="bg-accent/30 border-border"
                      value={(editForm.company_website as string) || ""}
                      onChange={(e) => setEditForm({ ...editForm, company_website: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label className="text-sm font-medium">Company LinkedIn</Label>
                    <Input
                      className="bg-accent/30 border-border"
                      value={(editForm.company_linkedin as string) || ""}
                      onChange={(e) => setEditForm({ ...editForm, company_linkedin: e.target.value })}
                    />
                  </div>
                </div>

                {/* Type & Experience */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <Label className="text-sm font-medium">Job Type</Label>
                    <Select value={(editForm.type as string) || ""} onValueChange={(v) => setEditForm({ ...editForm, type: v })}>
                      <SelectTrigger className="bg-accent/30 border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        <SelectItem value="Full-time">Full-time</SelectItem>
                        <SelectItem value="Part-time">Part-time</SelectItem>
                        <SelectItem value="Contract">Contract</SelectItem>
                        <SelectItem value="Internship">Internship</SelectItem>
                        <SelectItem value="Freelance">Freelance</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label className="text-sm font-medium">Experience Level</Label>
                    <Select value={(editForm.experience as string) || ""} onValueChange={(v) => setEditForm({ ...editForm, experience: v })}>
                      <SelectTrigger className="bg-accent/30 border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        <SelectItem value="Entry Level (0-1 years)">Entry Level (0-1 years)</SelectItem>
                        <SelectItem value="Junior (1-3 years)">Junior (1-3 years)</SelectItem>
                        <SelectItem value="Mid-Level (3-5 years)">Mid-Level (3-5 years)</SelectItem>
                        <SelectItem value="Senior (5-8 years)">Senior (5-8 years)</SelectItem>
                        <SelectItem value="Lead (8+ years)">Lead (8+ years)</SelectItem>
                        <SelectItem value="Principal/Staff (10+ years)">Principal/Staff (10+ years)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Location & Salary */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <Label className="text-sm font-medium">Location</Label>
                    <Input
                      className="bg-accent/30 border-border"
                      value={(editForm.location as string) || ""}
                      onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label className="text-sm font-medium">Salary Range</Label>
                    <Input
                      className="bg-accent/30 border-border"
                      value={(editForm.salary_range as string) || ""}
                      onChange={(e) => setEditForm({ ...editForm, salary_range: e.target.value })}
                    />
                  </div>
                </div>

                {/* Description */}
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-medium">Job Description</Label>
                  <Textarea
                    className="bg-accent/30 border-border min-h-[80px] resize-none"
                    value={(editForm.description as string) || ""}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  />
                </div>

                <div className="h-px bg-border" />

                {/* Edit Requirements */}
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <ListChecks className="h-3.5 w-3.5 text-muted-foreground" /> Requirements
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add a requirement..."
                      className="bg-accent/30 border-border flex-1"
                      value={editNewRequirement}
                      onChange={(e) => setEditNewRequirement(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          editAddToArray("requirements", editNewRequirement)
                          setEditNewRequirement("")
                        }
                      }}
                    />
                    <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => { editAddToArray("requirements", editNewRequirement); setEditNewRequirement("") }}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  {((editForm.requirements as string[]) || []).length > 0 && (
                    <div className="flex flex-col gap-1.5 mt-1">
                      {((editForm.requirements as string[]) || []).map((req, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm bg-accent/30 rounded-md px-3 py-1.5">
                          <span className="text-muted-foreground text-xs">{"•"}</span>
                          <span className="flex-1">{req}</span>
                          <button onClick={() => editRemoveFromArray("requirements", i)} className="text-muted-foreground hover:text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Edit Skills */}
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-muted-foreground" /> Skills
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add a skill..."
                      className="bg-accent/30 border-border flex-1"
                      value={editNewSkill}
                      onChange={(e) => setEditNewSkill(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          editAddToArray("skills", editNewSkill)
                          setEditNewSkill("")
                        }
                      }}
                    />
                    <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => { editAddToArray("skills", editNewSkill); setEditNewSkill("") }}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  {((editForm.skills as string[]) || []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {((editForm.skills as string[]) || []).map((skill, i) => (
                        <Badge key={i} variant="secondary" className="gap-1 pr-1 bg-accent text-accent-foreground">
                          {skill}
                          <button onClick={() => editRemoveFromArray("skills", i)} className="hover:text-destructive">
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Edit Benefits */}
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <Gift className="h-3.5 w-3.5 text-muted-foreground" /> Benefits
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add a benefit..."
                      className="bg-accent/30 border-border flex-1"
                      value={editNewBenefit}
                      onChange={(e) => setEditNewBenefit(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          editAddToArray("benefits", editNewBenefit)
                          setEditNewBenefit("")
                        }
                      }}
                    />
                    <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => { editAddToArray("benefits", editNewBenefit); setEditNewBenefit("") }}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  {((editForm.benefits as string[]) || []).length > 0 && (
                    <div className="flex flex-col gap-1.5 mt-1">
                      {((editForm.benefits as string[]) || []).map((b, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm bg-accent/30 rounded-md px-3 py-1.5">
                          <Check className="h-3 w-3 text-green-500 shrink-0" />
                          <span className="flex-1">{b}</span>
                          <button onClick={() => editRemoveFromArray("benefits", i)} className="text-muted-foreground hover:text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Edit Detailed Requirements */}
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" /> Detailed Requirements
                  </Label>
                  <Textarea
                    className="bg-accent/30 border-border min-h-[120px] resize-none"
                    value={(editForm.detailed_requirements as string) || ""}
                    onChange={(e) => setEditForm({ ...editForm, detailed_requirements: e.target.value })}
                  />
                </div>

                <div className="h-px bg-border" />

                {/* Edit Education Level */}
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" /> Education Level
                  </Label>
                  <Select value={(editForm.education_level as string) || ""} onValueChange={(v) => setEditForm({ ...editForm, education_level: v })}>
                    <SelectTrigger className="bg-accent/30 border-border">
                      <SelectValue placeholder="Select education level" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {EDUCATION_QUALIFICATIONS.map((edu) => (
                        <SelectItem key={edu} value={edu}>{edu}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Edit Work Authorization */}
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-medium">Work Authorization / Visa Requirements</Label>
                  <Select value={(editForm.work_authorization as string) || ""} onValueChange={(v) => setEditForm({ ...editForm, work_authorization: v })}>
                    <SelectTrigger className="bg-accent/30 border-border">
                      <SelectValue placeholder="Select work authorization requirement" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {WORK_AUTHORIZATION.map((auth) => (
                        <SelectItem key={auth} value={auth}>{auth}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter className="mt-4 gap-2">
                <Button variant="outline" onClick={cancelEditing} className="text-xs">
                  Cancel
                </Button>
                <Button
                  className="text-xs bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
                  onClick={handleSaveEdit}
                  disabled={isSaving}
                >
                  <Save className="h-3 w-3" /> {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ========== ADD JOB BATCH DIALOG ========== */}
      <Dialog open={showBatchForm} onOpenChange={(open) => { if (!open) { setShowBatchForm(false); setBatchCompanyId(""); setBatchPortalUrl(""); setScrapedJobs([]); setCurrentJobIndex(0) } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Zap className="h-5 w-5 text-primary" />
              Add Job Batch
            </DialogTitle>
          </DialogHeader>

          {scrapedJobs.length === 0 ? (
            <div className="flex flex-col gap-5 mt-2">
              {/* Company Selection */}
              <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium">Company <span className="text-destructive">*</span></Label>
                <Select value={batchCompanyId} onValueChange={setBatchCompanyId}>
                  <SelectTrigger className="bg-accent/30 border-border">
                    <SelectValue placeholder="Select a company" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={company.id}>
                        <span className="flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded bg-accent text-[9px] font-bold text-accent-foreground shrink-0">
                            {company.logoInitial}
                          </span>
                          {company.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Portal URL */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="batch-portal-url" className="text-sm font-medium">
                  Career Portal URL <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="batch-portal-url"
                    placeholder="e.g. https://careers.company.com/jobs"
                    className="pl-9 bg-accent/30 border-border"
                    value={batchPortalUrl}
                    onChange={(e) => setBatchPortalUrl(e.target.value)}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">The main careers page URL where all jobs are listed</p>
              </div>

              <DialogFooter className="mt-4 gap-2">
                <Button variant="outline" onClick={() => { setShowBatchForm(false); setBatchCompanyId(""); setBatchPortalUrl("") }} className="text-xs">
                  Cancel
                </Button>
                <Button
                  className="text-xs bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
                  onClick={async () => {
                    if (!batchCompanyId || !batchPortalUrl || isScraping) return
                    setIsScraping(true)
                    try {
                      const response = await fetch("/api/scraper", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ portalUrl: batchPortalUrl }),
                      })
                      const data = await response.json()
                      setScrapedJobs(data.jobs || [])
                      setCurrentJobIndex(0)
                    } catch (error) {
                      console.error("Scraping error:", error)
                      alert("Failed to scrape jobs. Please check the URL and try again.")
                    } finally {
                      setIsScraping(false)
                    }
                  }}
                  disabled={!batchCompanyId || !batchPortalUrl || isScraping}
                >
                  {isScraping ? (
                    <>
                      <Loader className="h-3 w-3 animate-spin" /> Fetching Jobs...
                    </>
                  ) : (
                    <>
                      <Zap className="h-3 w-3" /> Fetch & Preview
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="flex flex-col gap-5 mt-2">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Found {scrapedJobs.length} Jobs</h3>
                  <p className="text-xs text-muted-foreground">Reviewing job {currentJobIndex + 1} of {scrapedJobs.length}</p>
                </div>
              </div>

              {scrapedJobs[currentJobIndex] && (
                <div className="flex flex-col gap-4 p-4 rounded-lg bg-accent/20 border border-border">
                  <div>
                    <h4 className="text-sm font-semibold mb-1">{scrapedJobs[currentJobIndex].title}</h4>
                    <p className="text-xs text-muted-foreground">{scrapedJobs[currentJobIndex].location} • {scrapedJobs[currentJobIndex].type}</p>
                  </div>

                  {scrapedJobs[currentJobIndex].salaryMin && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Salary: </span>
                      <span className="font-medium">${scrapedJobs[currentJobIndex].salaryMin} - ${scrapedJobs[currentJobIndex].salaryMax}</span>
                    </div>
                  )}

                  {scrapedJobs[currentJobIndex].description && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Description:</p>
                      <p className="text-xs line-clamp-3">{scrapedJobs[currentJobIndex].description}</p>
                    </div>
                  )}

                  {scrapedJobs[currentJobIndex].requirements.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Requirements:</p>
                      <ul className="text-xs space-y-0.5">
                        {scrapedJobs[currentJobIndex].requirements.slice(0, 3).map((req, i) => (
                          <li key={i} className="text-muted-foreground">• {req}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2 justify-between">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() => setCurrentJobIndex(Math.max(0, currentJobIndex - 1))}
                  disabled={currentJobIndex === 0}
                >
                  Previous
                </Button>
                <div className="flex gap-1">
                  {scrapedJobs.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentJobIndex(i)}
                      className={`h-2 w-2 rounded-full transition-colors ${
                        i === currentJobIndex ? "bg-primary" : "bg-muted"
                      }`}
                    />
                  ))}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() => setCurrentJobIndex(Math.min(scrapedJobs.length - 1, currentJobIndex + 1))}
                  disabled={currentJobIndex === scrapedJobs.length - 1}
                >
                  Next
                </Button>
              </div>

              <DialogFooter className="mt-4 gap-2">
                <Button
                  variant="outline"
                  onClick={() => { setShowBatchForm(false); setBatchCompanyId(""); setBatchPortalUrl(""); setScrapedJobs([]); setCurrentJobIndex(0) }}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  className="text-xs bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
                  onClick={async () => {
                    if (isSaving) return
                    setIsSaving(true)
                    const company = companies.find((c) => c.id === batchCompanyId)
                    let successCount = 0

                    for (const job of scrapedJobs) {
                      const salaryRange = job.salaryMin && job.salaryMax
                        ? `$${Number(job.salaryMin).toLocaleString()} - $${Number(job.salaryMax).toLocaleString()}`
                        : job.salaryMin
                          ? `$${Number(job.salaryMin).toLocaleString()}+`
                          : "Competitive"

                      const result = await addJob({
                        company_id: batchCompanyId,
                        company_name: company?.name || "Custom Company",
                        company_initial: company?.logoInitial || "C",
                        title: job.title,
                        location: job.location || "Remote",
                        type: job.type || "Full-time",
                        salary_range: salaryRange,
                        experience: job.experience || "Not specified",
                        portal_url: batchPortalUrl,
                        job_url: job.jobUrl || "",
                        company_website: company?.website || null,
                        company_linkedin: company?.linkedinUrl || null,
                        description: job.description || "",
                        requirements: job.requirements,
                        skills: job.skills,
                        benefits: job.benefits,
                        detailed_requirements: job.detailedRequirements,
                      })

                      if (result) successCount++
                    }

                    setIsSaving(false)
                    alert(`Successfully added ${successCount} out of ${scrapedJobs.length} jobs`)
                    setShowBatchForm(false)
                    setBatchCompanyId("")
                    setBatchPortalUrl("")
                    setScrapedJobs([])
                    setCurrentJobIndex(0)
                  }}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <Loader className="h-3 w-3 animate-spin" /> Adding Jobs...
                    </>
                  ) : (
                    <>
                      <Plus className="h-3 w-3" /> Add All {scrapedJobs.length} Jobs
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
