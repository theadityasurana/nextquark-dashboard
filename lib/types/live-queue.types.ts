// Types for live_application_queue table

import type { RunTimeline } from "@/lib/run-timeline"
import type { Knockout } from "@/lib/knockouts"

export type { RunTimeline, Knockout }

export interface LiveApplicationQueue {
  // Primary fields
  id: string
  user_id: string
  job_id: string
  
  // Personal Information
  first_name: string
  last_name: string
  email: string | null
  gender: string | null
  phone: string
  country_code: string | null
  location: string
  headline: string
  bio: string
  
  // URLs
  resume_url: string
  linkedin_url: string
  github_url: string | null
  
  // Status fields
  veteran_status: string
  disability_status: string
  ethnicity: string
  work_authorization_status?: string
  
  // Skills
  skills: string[]
  top_skills: string[]
  
  // Experience (JSONB)
  experience: Experience[]
  
  // Education (JSONB)
  education: Education[]
  
  // Certifications (JSONB)
  certifications: Certification[]
  
  // Achievements (JSONB)
  achievements: Achievement[]
  
  // Job Preferences
  job_preferences: string[] | any[]
  work_mode_preferences: string[]
  
  // Salary
  salary_currency: string
  salary_min: number | null
  salary_max: number
  
  // Other preferences
  desired_roles: string[]
  preferred_cities: string[]
  work_professions: string[]
  
  // Job details
  company_name: string
  job_title: string
  job_url: string
  
  // Application status
  // 'blocked' is set by the pre-flight gate for terminally-blocked applications
  // (explicit knockout, unrecognized portal) — these never reach a browser.
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'awaiting_otp' | 'awaiting_captcha' | 'blocked'
  
  // OTP verification
  verification_otp?: string | null
  
  // Live stream URL
  live_url?: string | null
  
  // Recording URL
  recording_url?: string | null
  
  // Premium
  is_premium: boolean
  
  // Retry
  attempt_count: number
  max_attempts: number
  last_error?: string | null
  
  // Rejection
  rejected_at?: string | null

  // Run telemetry (scripts/054_add_run_timeline.sql). Null on rows written before
  // the driver was instrumented — the UI renders those as "no timeline recorded".
  run_timeline?: RunTimeline | null
  /** ATS-issued reference captured off the confirmation page, when there was one. */
  confirmation_id?: string | null
  /** How that reference was introduced, e.g. "confirmation number". */
  confirmation_label?: string | null
  confirmation_confidence?: 'high' | 'medium' | 'low' | null
  /** Canonical id of the first step that failed, for at-a-glance triage. */
  failed_step?: string | null
  /** Validation messages the form itself reported after a submit attempt. */
  validation_errors?: string[] | null

  // Pre-flight gating (scripts/055_add_preflight_gating.sql). Null on rows the
  // gate has never evaluated — those render as "not screened", not as passing.
  /** True only when something explicitly stated disqualifies this application. */
  knockout_blocked?: boolean | null
  knockout_reason?: string | null
  knockout_checks?: Knockout[] | null
  /** Estimated share of the form fillable from this profile, 0..100. */
  coverage_percent?: number | null
  /** Blocking fields the profile lacks — these stall the submit gate. */
  coverage_blocking_missing?: string[] | null
  portal_confidence?: number | null
  portal_name?: string | null
  screened_at?: string | null

  // Answer bank telemetry (scripts/056_add_answer_bank.sql).
  /** Share of the form's custom questions answered from the bank, 0..100. */
  answer_coverage_percent?: number | null
  /** Questions the bank could not answer — candidates for capture. */
  unanswered_questions?: string[] | null
  /** Unanswered AND sensitive: these must go to a human, never to the model. */
  questions_needing_human?: string[] | null
  /** How many questions still fell through to the LLM on this run. */
  llm_answered_count?: number | null

  // Metadata
  onboarding_data: Record<string, any>
  created_at: string
  started_at?: string | null
  completed_at?: string | null
  
  // Cover letter
  cover_letter?: string
}

export interface Experience {
  id: string
  title: string
  company: string
  startDate: string
  endDate: string | null
  isCurrent: boolean
  description: string
  jobLocation: string
  employmentType: string
  workMode: string
  skills: string[]
}

export interface Education {
  id: string
  degree: string
  field: string
  institution: string
  startDate: string
  endDate: string
}

export interface Certification {
  id: string
  name: string
  issuingOrganization: string
  skills: string[]
  credentialUrl: string
}

export interface Achievement {
  id: string
  title: string
  issuer: string
  date: string
  description: string
}

// Application statistics
export interface ApplicationStats {
  totalApps: number
  successful: number
  failed: number
  inProgress: number
}
