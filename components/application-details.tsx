"use client"

import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { LiveApplicationQueue, ApplicationStats } from "@/lib/types/live-queue.types"
import { useLogs, LogEntry } from "@/lib/logs-context"
import { 
  User as UserIcon, Heart, Shield, ExternalLink, FileText, 
  Globe, Briefcase, GraduationCap, Award, DollarSign, MapPin, Clock, Terminal
} from "lucide-react"

interface ApplicationDetailsProps {
  application: LiveApplicationQueue
  stats: ApplicationStats
  onStartApplication?: () => void
  isStreaming?: boolean
  recordingUrl?: string | null
}

export function ApplicationDetails({ 
  application, 
  stats, 
  onStartApplication,
  isStreaming = false,
  recordingUrl = null
}: ApplicationDetailsProps) {
  const fullName = `${application.first_name} ${application.last_name}`
  const { logs } = useLogs()
  const [dbLogs, setDbLogs] = useState<LogEntry[]>([])
  
  // Fetch logs from database
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const response = await fetch(`/api/logs?applicationId=${application.id}`)
        const data = await response.json()
        if (data.logs) {
          setDbLogs(data.logs)
        }
      } catch (err) {
        console.error('Failed to fetch logs:', err)
      }
    }
    
    fetchLogs()
    const interval = setInterval(fetchLogs, 3000)
    return () => clearInterval(interval)
  }, [application.id])
  
  // Combine context logs (real-time) with database logs
  const contextLogs = logs.filter(log => log.applicationId === application.id)
  const allLogs = [...contextLogs, ...dbLogs]
  const uniqueLogs = Array.from(new Map(allLogs.map(log => [log.id, log])).values())
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  


  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Application Details</h2>
            <Badge variant="outline" className="font-mono text-[10px]">{application.id}</Badge>
          </div>
          <Badge variant={
            application.status === 'completed' ? 'default' : 
            application.status === 'processing' ? 'secondary' : 
            application.status === 'failed' ? 'destructive' : 'outline'
          }>
            {application.status}
          </Badge>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-4">
          <Button
            size="sm"
            className="text-xs gap-1.5"
            onClick={onStartApplication}
            disabled={isStreaming}
          >
            {isStreaming ? 'Processing...' : 'Start Application'}
          </Button>
        </div>
      </div>

      {/* Task Recording Viewer */}
      {(recordingUrl || application.recording_url) && (
        <div className="px-6 py-5 border-b border-border">
          <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-green-600">Task Recording</h4>
              <Badge variant="outline" className="text-[10px]">● SAVED</Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-2">Recording URL: {recordingUrl || application.recording_url}</p>
            <div className="relative w-full bg-black rounded-lg" style={{ paddingBottom: '56.25%' }}>
              <iframe
                src={recordingUrl || application.recording_url || ""}
                className="absolute top-0 left-0 w-full h-full rounded-lg"
                allow="clipboard-read; clipboard-write; autoplay"
                title="Task Recording"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">Playback of the completed task</p>
          </div>
        </div>
      )}
      
      {/* Processing indicator */}
      {isStreaming && !recordingUrl && !application.recording_url && (
        <div className="px-6 py-5 border-b border-border">
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
            <p className="text-xs text-yellow-600">Task is running... Recording will be available once the task completes. Check logs below for progress.</p>
          </div>
        </div>
      )}

      {/* Job Details */}
      <div className="px-6 py-5 border-b border-border">
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-primary mb-2">Job Application Link</h4>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">{application.job_title} at {application.company_name}</p>
            </div>
            <div className="flex items-center gap-2">
              <a href={application.job_url} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline" className="text-xs gap-1.5">
                  <ExternalLink className="h-3 w-3" /> Application Portal
                </Button>
              </a>
              <a href={application.job_url} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline" className="text-xs gap-1.5">
                  <Globe className="h-3 w-3" /> Job Listing
                </Button>
              </a>
            </div>
          </div>
        </div>

        {/* Logs Section */}
        {uniqueLogs.length > 0 && (
          <div className="rounded-lg border border-border bg-background p-4 mt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2">
              <Terminal className="h-3 w-3" /> Application Logs
            </h4>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {uniqueLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-2 text-xs font-mono">
                  <span className="text-muted-foreground shrink-0">{log.timestamp}</span>
                  <Badge variant={log.level === "error" ? "destructive" : log.level === "warn" ? "secondary" : "outline"} className="text-[9px] h-4 shrink-0">
                    {log.level}
                  </Badge>
                  <span className="text-muted-foreground">{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Full Profile */}
      <div className="px-6 py-5 flex flex-col gap-5">
        {/* User Header */}
        <div className="rounded-lg border border-border p-5 bg-foreground/5">
          <div className="text-center mb-4 pb-3 border-b border-border">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary mx-auto mb-2">
              {application.first_name[0]}{application.last_name[0]}
            </div>
            <h3 className="text-lg font-bold">{fullName}</h3>
            <p className="text-sm text-muted-foreground">{application.headline}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {application.phone} | {application.location}
            </p>
            <div className="flex items-center justify-center gap-3 mt-2">
              {application.linkedin_url && (
                <a href={application.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                  {application.linkedin_url}
                </a>
              )}
              {application.github_url && (
                <a href={application.github_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                  {application.github_url}
                </a>
              )}
            </div>
          </div>

          {/* Professional Summary */}
          <div className="mb-4">
            <h4 className="text-xs font-bold uppercase tracking-wider mb-1.5">Professional Summary</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">{application.bio}</p>
          </div>

          <Separator className="my-3" />

          {/* Personal Information */}
          <div className="mb-4">
            <h4 className="text-xs font-bold uppercase tracking-wider mb-2">Personal Information</h4>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <span className="text-muted-foreground flex items-center gap-1"><UserIcon className="h-3 w-3" /> Gender</span>
              <span className="font-medium col-span-2">{application.gender || 'Not specified'}</span>
              <span className="text-muted-foreground flex items-center gap-1"><Heart className="h-3 w-3" /> Ethnicity</span>
              <span className="font-medium col-span-2">{application.ethnicity}</span>
              <span className="text-muted-foreground flex items-center gap-1"><Shield className="h-3 w-3" /> Disability</span>
              <span className="font-medium col-span-2">{application.disability_status}</span>
              <span className="text-muted-foreground flex items-center gap-1"><Shield className="h-3 w-3" /> Veteran Status</span>
              <span className="font-medium col-span-2">{application.veteran_status}</span>
              {application.work_authorization_status && (
                <>
                  <span className="text-muted-foreground flex items-center gap-1"><FileText className="h-3 w-3" /> Work Authorization</span>
                  <span className="font-medium col-span-2">{application.work_authorization_status}</span>
                </>
              )}
            </div>
          </div>

          <Separator className="my-3" />

          {/* Work Experience */}
          <div className="mb-4">
            <h4 className="text-xs font-bold uppercase tracking-wider mb-2">Work Experience</h4>
            {application.experience.map((exp) => (
              <div key={exp.id} className="mb-3">
                <div className="flex justify-between">
                  <span className="text-xs font-semibold">{exp.title} - {exp.company}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {exp.startDate} - {exp.isCurrent ? 'Present' : exp.endDate}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{exp.description}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {exp.jobLocation} • {exp.employmentType} • {exp.workMode}
                </p>
                {exp.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {exp.skills.map((skill) => (
                      <Badge key={skill} variant="secondary" className="text-[9px] h-4">{skill}</Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <Separator className="my-3" />

          {/* Education */}
          <div className="mb-4">
            <h4 className="text-xs font-bold uppercase tracking-wider mb-2">Education</h4>
            {application.education.map((edu) => (
              <div key={edu.id} className="mb-2">
                <div className="flex justify-between">
                  <span className="text-xs font-semibold">{edu.degree} in {edu.field} - {edu.institution}</span>
                  <span className="text-[10px] text-muted-foreground">{edu.startDate} - {edu.endDate}</span>
                </div>
              </div>
            ))}
          </div>

          <Separator className="my-3" />

          {/* Certifications */}
          {application.certifications.length > 0 && (
            <>
              <div className="mb-4">
                <h4 className="text-xs font-bold uppercase tracking-wider mb-2">Certifications</h4>
                {application.certifications.map((cert) => (
                  <div key={cert.id} className="mb-3 rounded-lg bg-accent/30 p-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-xs font-semibold">{cert.name}</span>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{cert.issuingOrganization}</p>
                      </div>
                      {cert.credentialUrl && (
                        <a href={cert.credentialUrl} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="ghost" className="h-6 text-[10px]">
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </a>
                      )}
                    </div>
                    {cert.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {cert.skills.map((skill) => (
                          <Badge key={skill} variant="outline" className="text-[9px] h-4">{skill}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <Separator className="my-3" />
            </>
          )}

          {/* Achievements */}
          {application.achievements.length > 0 && (
            <>
              <div className="mb-4">
                <h4 className="text-xs font-bold uppercase tracking-wider mb-2">Achievements</h4>
                {application.achievements.map((ach) => (
                  <div key={ach.id} className="mb-3 rounded-lg bg-accent/30 p-3">
                    <div className="flex items-start justify-between">
                      <span className="text-xs font-semibold">{ach.title}</span>
                      <span className="text-[10px] text-muted-foreground">{ach.date}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{ach.issuer}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">{ach.description}</p>
                  </div>
                ))}
              </div>
              <Separator className="my-3" />
            </>
          )}

          {/* Job Preferences */}
          <div className="mb-4">
            <h4 className="text-xs font-bold uppercase tracking-wider mb-2">Job Preferences</h4>
            <div className="space-y-2">
              <div>
                <span className="text-[10px] text-muted-foreground">Job Types:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {application.job_preferences.map((pref) => (
                    <Badge key={pref} variant="secondary" className="text-[9px] h-4">{pref}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground">Work Mode:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {application.work_mode_preferences.map((mode) => (
                    <Badge key={mode} variant="secondary" className="text-[9px] h-4">{mode}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <Separator className="my-3" />

          {/* Salary Expectations */}
          <div className="mb-4">
            <h4 className="text-xs font-bold uppercase tracking-wider mb-2">Salary Expectations</h4>
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                {application.salary_currency} {application.salary_min ? `${application.salary_min.toLocaleString()} - ` : ''}
                {application.salary_max.toLocaleString()}
              </span>
            </div>
          </div>

          <Separator className="my-3" />

          {/* Skills */}
          <div className="mb-4">
            <h4 className="text-xs font-bold uppercase tracking-wider mb-2">Skills</h4>
            <div className="flex flex-wrap gap-1.5">
              {(application.top_skills.length > 0 ? application.top_skills : application.skills).map((skill) => (
                <Badge key={skill} variant="secondary" className="text-[10px] bg-accent text-accent-foreground">{skill}</Badge>
              ))}
            </div>
          </div>

          <Separator className="my-3" />

          {/* Application Stats */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              { label: "Total Apps", value: stats.totalApps },
              { label: "Successful", value: stats.successful },
              { label: "Failed", value: stats.failed },
              { label: "In Progress", value: stats.inProgress },
            ].map((s) => (
              <div key={s.label} className="rounded-lg bg-accent/50 p-3 text-center">
                <p className="text-lg font-bold">{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Resume Download */}
        <div className="rounded-lg border border-border p-5 bg-foreground/5">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> Resume
            </h4>
            <a href={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/resumes/${application.resume_url}`} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="text-xs gap-1.5 h-7">
                <FileText className="h-3 w-3" /> Download PDF
              </Button>
            </a>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Resume will be automatically uploaded during application process</p>
        </div>

        {/* Cover Letter */}
        {application.cover_letter && (
          <div className="rounded-lg border border-border p-5">
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> Cover Letter
            </h4>
            <div className="rounded-lg bg-accent/30 p-4">
              {application.cover_letter.split('\n').map((line, i) => (
                <p key={i} className={`text-sm leading-relaxed text-muted-foreground ${line === '' ? 'h-3' : ''}`}>
                  {line}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
