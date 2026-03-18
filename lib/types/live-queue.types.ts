// Types for live_application_queue table

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
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'awaiting_otp'
  
  // OTP verification
  verification_otp?: string | null
  
  // Live stream URL (deprecated — Skyvern uses recordings instead)
  live_url?: string | null
  
  // Recording URL
  recording_url?: string | null
  
  // Metadata
  onboarding_data: Record<string, any>
  created_at: string
  
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
