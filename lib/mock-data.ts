// Mock data for NextQuark Admin Dashboard

export type ApplicationStatus = "queued" | "processing" | "completed" | "failed"
export type AgentStatus = "active" | "idle" | "error"
export type PortalStatus = "active" | "slow" | "down"

export interface Application {
  id: string
  userId: string
  userName: string
  userEmail: string
  userPhone: string
  userLocation: string
  companyId: string
  companyName: string
  jobTitle: string
  jobId: string
  status: ApplicationStatus
  agentId: string | null
  progressStep: number
  totalSteps: number
  stepDescription: string
  startedAt: string
  duration: string
  createdAt: string
  screenshot?: string
}

export interface WorkExperience {
  company: string
  title: string
  startDate: string
  endDate: string
  yearsOfExperience: number
  description: string
}

export interface Education {
  university: string
  degree: string
  course: string
  grade: string
  startDate: string
  endDate: string
}

export interface Project {
  title: string
  skills: string[]
  bullets: string[]
}

export interface User {
  id: string
  name: string
  email: string
  phone: string
  location: string
  headline: string
  experience: string
  skills: string[]
  resumeUrl: string
  linkedinUrl: string
  // Personal Information
  gender: string
  ethnicity: string
  disabilityStatus: string
  // Work Experience
  workExperience: WorkExperience[]
  // Education
  education: Education[]
  // Projects
  projects: Project[]
  // Cover letter
  coverLetter: string
  // Resume summary
  resumeSummary: string
  // Stats
  totalApps: number
  successfulApps: number
  failedApps: number
  inProgressApps: number
  lastActive: string
  joinedAt: string
  status: "active" | "inactive"
}

export interface Company {
  id: string
  name: string
  logoInitial: string
  logoUrl?: string
  website: string
  careersUrl: string
  linkedinUrl?: string
  description?: string
  industry: string
  size: string
  location: string | string[]
  portalType: string
  portalStatus: PortalStatus
  totalJobs: number
  appsToday: number
  successRate: number
  avgTime: string
  addedAt: string
  benefits?: string[]
}

export interface Job {
  id: string
  companyId: string
  companyName: string
  companyInitial: string
  title: string
  location: string
  type: string
  salaryRange: string
  experience: string
  portalUrl: string
  jobUrl: string
  companyWebsite?: string
  companyLinkedin?: string
  status: "active" | "paused" | "closed" | "queued"
  totalApps: number
  rightSwipes: number
  successRate: number
  avgTime: string
  postedAt: string
  description: string
  requirements?: string[]
  skills?: string[]
  benefits?: string[]
  detailedRequirements?: string
  educationLevel?: string
  workAuthorization?: string
}

export interface Agent {
  id: string
  status: AgentStatus
  currentJob: string | null
  currentUser: string | null
  currentAppId: string | null
  progressStep: number
  totalSteps: number
  runtime: string
  server: string
  browser: string
  cpu: number
  ram: string
  network: string
  lastJob: string | null
  lastError: string | null
  idleTime: string | null
  retryCount: number
  maxRetries: number
}

export interface LogEntry {
  id: string
  timestamp: string
  level: "info" | "warn" | "error"
  agentId: string
  message: string
  applicationId?: string
}

// MOCK DATA

export const mockApplications: Application[] = [
  { id: "A-7821", userId: "u1", userName: "Aditya S.", userEmail: "mail.adityasurana@gmail.com", userPhone: "+91 7776004343", userLocation: "San Francisco, CA", companyId: "c1", companyName: "CRED", jobTitle: "Sr. Software Engineer", jobId: "G-001", status: "processing", agentId: "Agent-01", progressStep: 3, totalSteps: 5, stepDescription: "Filling personal details", startedAt: "10:45:18", duration: "2m 15s", createdAt: "2m ago", screenshot: "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22%3E%3Crect fill=%22%23f0f0f0%22 width=%22400%22 height=%22300%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2220%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22 fill=%22%23666%22%3EJob Application Portal%3C/text%3E%3C/svg%3E" },
]

export const mockUsers: User[] = [
  {
    id: "u1", name: "Aditya Surana", email: "mail.adityasurana@gmail.com", phone: "+91 7776004343", location: "San Francisco, CA", headline: "Senior Software Engineer", experience: "8 years",
    skills: ["React", "Python", "AWS", "Docker", "TypeScript", "Node.js", "PostgreSQL", "Redis", "GraphQL", "Kubernetes", "CI/CD", "System Design"],
    resumeUrl: "#", linkedinUrl: "linkedin.com/in/adityasurana",
    gender: "Male", ethnicity: "Asian", disabilityStatus: "None",
    workExperience: [
      { company: "Stripe", title: "Senior Software Engineer", startDate: "Jan 2021", endDate: "Present", yearsOfExperience: 4, description: "Led development of payment processing microservices handling 10M+ transactions/day." },
      { company: "Dropbox", title: "Software Engineer", startDate: "Mar 2018", endDate: "Dec 2020", yearsOfExperience: 3, description: "Built real-time file sync infrastructure using Python and Go." },
      { company: "Accenture", title: "Junior Developer", startDate: "Jun 2016", endDate: "Feb 2018", yearsOfExperience: 2, description: "Developed enterprise web applications for Fortune 500 clients." },
    ],
    education: [
      { university: "Stanford University", degree: "M.S.", course: "Computer Science", grade: "3.9/4.0", startDate: "Sep 2014", endDate: "Jun 2016" },
      { university: "IIT Delhi", degree: "B.Tech", course: "Computer Science & Engineering", grade: "9.2/10", startDate: "Aug 2010", endDate: "May 2014" },
    ],
    projects: [
      { title: "Distributed Task Scheduler", skills: ["Go", "Redis", "Docker", "Kubernetes"], bullets: ["Built a fault-tolerant distributed task scheduler supporting 50K concurrent jobs.", "Implemented priority queues with dead-letter handling and automatic retries.", "Reduced job processing latency by 40% compared to the previous Celery-based system.", "Deployed on Kubernetes with auto-scaling based on queue depth metrics."] },
      { title: "Real-Time Analytics Dashboard", skills: ["React", "TypeScript", "WebSocket", "D3.js"], bullets: ["Developed a real-time analytics dashboard processing 1M+ events per minute.", "Built custom charting components using D3.js with sub-100ms render times.", "Implemented WebSocket-based data streaming with automatic reconnection."] },
      { title: "ML-Powered Code Review Bot", skills: ["Python", "TensorFlow", "GitHub API"], bullets: ["Created an ML model that automatically reviews pull requests for common issues.", "Trained on 500K+ code review comments from open-source projects.", "Achieved 78% accuracy in identifying potential bugs before human review.", "Integrated with GitHub Actions for seamless CI/CD pipeline integration."] },
    ],
    coverLetter: "Dear Hiring Manager,\n\nI am writing to express my strong interest in the Senior Software Engineer position. With 8 years of experience building scalable distributed systems at companies like Stripe and Dropbox, I am confident in my ability to contribute meaningfully to your engineering team.\n\nAt Stripe, I led the development of payment processing microservices that handle over 10 million transactions daily, achieving 99.99% uptime. My expertise in React, Python, AWS, and Kubernetes allows me to deliver robust full-stack solutions.\n\nI am particularly excited about the opportunity to work on challenging technical problems and mentor junior engineers. I look forward to discussing how my experience aligns with your team's goals.\n\nBest regards,\nAditya Surana",
    resumeSummary: "Experienced Senior Software Engineer with 8+ years building scalable distributed systems. Expertise in full-stack development, cloud infrastructure, and system design. Proven track record at Stripe and Dropbox delivering high-availability services processing millions of transactions.",
    totalApps: 47, successfulApps: 44, failedApps: 3, inProgressApps: 2, lastActive: "2m ago", joinedAt: "2024-01-15", status: "active"
  },
]

export const mockCompanies: Company[] = [
  { id: "c1", name: "CRED", logoInitial: "C", website: "cred.club", careersUrl: "careers.cred.club", linkedinUrl: "linkedin.com/company/cred", description: "CRED is a fintech platform for credit card payments and rewards.", industry: "Technology", size: "1,000+", location: "Bangalore, India", portalType: "Custom", portalStatus: "active", totalJobs: 234, appsToday: 127, successRate: 96.2, avgTime: "3m 24s", addedAt: "2024-01-10" },
  { id: "c2", name: "Meta", logoInitial: "M", website: "meta.com", careersUrl: "careers.meta.com", linkedinUrl: "linkedin.com/company/meta", description: "Meta builds technologies that help people connect, find communities, and grow businesses.", industry: "Technology", size: "70,000+", location: "Menlo Park, CA", portalType: "Lever", portalStatus: "active", totalJobs: 189, appsToday: 98, successRate: 95.1, avgTime: "2m 58s", addedAt: "2024-01-10" },
  { id: "c3", name: "Apple", logoInitial: "A", website: "apple.com", careersUrl: "jobs.apple.com", linkedinUrl: "linkedin.com/company/apple", description: "Apple designs, manufactures, and markets smartphones, personal computers, tablets, and more.", industry: "Technology", size: "150,000+", location: "Cupertino, CA", portalType: "Custom", portalStatus: "active", totalJobs: 156, appsToday: 87, successRate: 94.8, avgTime: "4m 12s", addedAt: "2024-01-12" },
  { id: "c4", name: "Amazon", logoInitial: "A", website: "amazon.com", careersUrl: "amazon.jobs", linkedinUrl: "linkedin.com/company/amazon", description: "Amazon is a multinational technology company focusing on e-commerce, cloud computing, and AI.", industry: "Technology", size: "1,500,000+", location: "Seattle, WA", portalType: "Workday", portalStatus: "slow", totalJobs: 298, appsToday: 76, successRate: 93.2, avgTime: "5m 45s", addedAt: "2024-01-10" },
  { id: "c5", name: "Microsoft", logoInitial: "M", website: "microsoft.com", careersUrl: "careers.microsoft.com", linkedinUrl: "linkedin.com/company/microsoft", description: "Microsoft develops and supports software, services, devices, and solutions worldwide.", industry: "Technology", size: "200,000+", location: "Redmond, WA", portalType: "Workday", portalStatus: "active", totalJobs: 201, appsToday: 65, successRate: 92.5, avgTime: "4m 30s", addedAt: "2024-01-11" },
  { id: "c6", name: "Netflix", logoInitial: "N", website: "netflix.com", careersUrl: "jobs.netflix.com", linkedinUrl: "linkedin.com/company/netflix", description: "Netflix is a streaming entertainment service offering TV series, documentaries, and feature films.", industry: "Entertainment", size: "12,000+", location: "Los Gatos, CA", portalType: "Greenhouse", portalStatus: "down", totalJobs: 87, appsToday: 45, successRate: 88.4, avgTime: "3m 55s", addedAt: "2024-01-15" },
  { id: "c7", name: "Tesla", logoInitial: "T", website: "tesla.com", careersUrl: "tesla.com/careers", linkedinUrl: "linkedin.com/company/tesla-motors", description: "Tesla designs and manufactures electric vehicles, battery energy storage, and solar panels.", industry: "Automotive", size: "100,000+", location: "Austin, TX", portalType: "Custom", portalStatus: "active", totalJobs: 124, appsToday: 38, successRate: 91.7, avgTime: "4m 20s", addedAt: "2024-01-18" },
  { id: "c8", name: "Spotify", logoInitial: "S", website: "spotify.com", careersUrl: "lifeatspotify.com", linkedinUrl: "linkedin.com/company/spotify", description: "Spotify is a digital music, podcast, and video service that gives you access to millions of songs.", industry: "Music/Tech", size: "8,000+", location: "Stockholm, Sweden", portalType: "Greenhouse", portalStatus: "active", totalJobs: 65, appsToday: 22, successRate: 93.8, avgTime: "3m 10s", addedAt: "2024-01-20" },
]

export const mockJobs: Job[] = [
  { id: "G-001", companyId: "c1", companyName: "CRED", companyInitial: "C", title: "Sr. Software Engineer", location: "Bangalore, India", type: "Full-time", salaryRange: "₹30,00,000 - ₹50,00,000", experience: "5+ years", portalUrl: "https://changejar.applytojob.com/apply/job_20260210095417_CPMUJGIOXZS0CLIL", jobUrl: "https://changejar.applytojob.com/apply/job_20260210095417_CPMUJGIOXZS0CLIL", companyWebsite: "cred.club", companyLinkedin: "linkedin.com/company/cred", status: "active", totalApps: 47, rightSwipes: 312, successRate: 96.2, avgTime: "3m 15s", postedAt: "2024-02-15", description: "We are seeking a Senior Software Engineer to join our Platform team..." },
  { id: "M-045", companyId: "c2", companyName: "Meta", companyInitial: "M", title: "Product Manager", location: "Menlo Park, CA", type: "Full-time", salaryRange: "$160,000 - $220,000", experience: "4+ years", portalUrl: "careers.meta.com/apply/67890", jobUrl: "https://careers.meta.com/jobs/67890", companyWebsite: "meta.com", companyLinkedin: "linkedin.com/company/meta", status: "active", totalApps: 32, rightSwipes: 245, successRate: 95.1, avgTime: "2m 48s", postedAt: "2024-02-12", description: "We are looking for a Product Manager to drive our next-generation social platform..." },
  { id: "A-128", companyId: "c3", companyName: "Apple", companyInitial: "A", title: "UX Designer", location: "Cupertino, CA", type: "Full-time", salaryRange: "$140,000 - $200,000", experience: "3+ years", portalUrl: "jobs.apple.com/apply/11111", jobUrl: "https://jobs.apple.com/jobs/11111", companyWebsite: "apple.com", companyLinkedin: "linkedin.com/company/apple", status: "active", totalApps: 28, rightSwipes: 198, successRate: 94.8, avgTime: "4m 05s", postedAt: "2024-02-10", description: "Join Apple's Human Interface team to design intuitive experiences..." },
  { id: "A-299", companyId: "c4", companyName: "Amazon", companyInitial: "A", title: "DevOps Engineer", location: "Seattle, WA", type: "Full-time", salaryRange: "$150,000 - $210,000", experience: "4+ years", portalUrl: "amazon.jobs/apply/22222", jobUrl: "https://amazon.jobs/jobs/22222", companyWebsite: "amazon.com", companyLinkedin: "linkedin.com/company/amazon", status: "active", totalApps: 24, rightSwipes: 176, successRate: 93.2, avgTime: "5m 30s", postedAt: "2024-02-08", description: "Amazon Web Services is looking for a DevOps Engineer..." },
  { id: "N-087", companyId: "c6", companyName: "Netflix", companyInitial: "N", title: "Data Scientist", location: "Los Gatos, CA", type: "Full-time", salaryRange: "$170,000 - $240,000", experience: "3+ years", portalUrl: "jobs.netflix.com/apply/33333", jobUrl: "https://jobs.netflix.com/jobs/33333", companyWebsite: "netflix.com", companyLinkedin: "linkedin.com/company/netflix", status: "active", totalApps: 19, rightSwipes: 143, successRate: 88.4, avgTime: "3m 50s", postedAt: "2024-02-14", description: "Netflix is seeking a Data Scientist for our Recommendation Systems team..." },
  { id: "T-033", companyId: "c7", companyName: "Tesla", companyInitial: "T", title: "ML Engineer", location: "Austin, TX", type: "Full-time", salaryRange: "$160,000 - $230,000", experience: "4+ years", portalUrl: "tesla.com/careers/apply/44444", jobUrl: "https://tesla.com/careers/jobs/44444", companyWebsite: "tesla.com", companyLinkedin: "linkedin.com/company/tesla-motors", status: "active", totalApps: 15, rightSwipes: 112, successRate: 91.7, avgTime: "4m 15s", postedAt: "2024-02-16", description: "Tesla Autopilot team is looking for an ML Engineer..." },
  { id: "S-012", companyId: "c8", companyName: "Spotify", companyInitial: "S", title: "Product Designer", location: "Stockholm, Sweden", type: "Full-time", salaryRange: "$130,000 - $180,000", experience: "3+ years", portalUrl: "lifeatspotify.com/apply/55555", jobUrl: "https://lifeatspotify.com/jobs/55555", companyWebsite: "spotify.com", companyLinkedin: "linkedin.com/company/spotify", status: "active", totalApps: 12, rightSwipes: 89, successRate: 93.8, avgTime: "3m 05s", postedAt: "2024-02-18", description: "Spotify is looking for a Product Designer for our Free Tier experience..." },
  { id: "G-002", companyId: "c1", companyName: "Google", companyInitial: "G", title: "Product Manager", location: "Mountain View, CA", type: "Full-time", salaryRange: "$170,000 - $240,000", experience: "5+ years", portalUrl: "careers.google.com/apply/66666", jobUrl: "https://careers.google.com/jobs/66666", companyWebsite: "google.com", companyLinkedin: "linkedin.com/company/google", status: "active", totalApps: 32, rightSwipes: 267, successRate: 95.0, avgTime: "3m 20s", postedAt: "2024-02-11", description: "Google Cloud is seeking a Product Manager..." },
]

export const mockAgents: Agent[] = [
  { id: "Agent-01", status: "active", currentJob: "Google - Sr. SWE", currentUser: "Rohan K.", currentAppId: "A-7821", progressStep: 3, totalSteps: 5, runtime: "2m 15s", server: "agent-server-01 (AWS us-west-2)", browser: "Chrome 121.0.6167", cpu: 45, ram: "2.1GB", network: "12 MB/s", lastJob: null, lastError: null, idleTime: null, retryCount: 0, maxRetries: 3 },
  { id: "Agent-02", status: "active", currentJob: "Meta - PM", currentUser: "Sarah M.", currentAppId: "A-7822", progressStep: 4, totalSteps: 5, runtime: "4m 02s", server: "agent-server-01 (AWS us-west-2)", browser: "Chrome 121.0.6167", cpu: 62, ram: "2.4GB", network: "8 MB/s", lastJob: null, lastError: null, idleTime: null, retryCount: 0, maxRetries: 3 },
  { id: "Agent-03", status: "active", currentJob: "Apple - UX Designer", currentUser: "Alex R.", currentAppId: "A-7823", progressStep: 2, totalSteps: 5, runtime: "1m 45s", server: "agent-server-02 (AWS us-east-1)", browser: "Chrome 121.0.6167", cpu: 38, ram: "1.9GB", network: "15 MB/s", lastJob: null, lastError: null, idleTime: null, retryCount: 0, maxRetries: 3 },
  { id: "Agent-04", status: "idle", currentJob: null, currentUser: null, currentAppId: null, progressStep: 0, totalSteps: 0, runtime: "-", server: "agent-server-02 (AWS us-east-1)", browser: "Chrome 121.0.6167", cpu: 5, ram: "0.8GB", network: "0 MB/s", lastJob: "Amazon - DevOps (Mike T.)", lastError: null, idleTime: "3m 12s", retryCount: 0, maxRetries: 3 },
  { id: "Agent-05", status: "active", currentJob: "Netflix - Data Sci", currentUser: "John D.", currentAppId: "A-7824", progressStep: 4, totalSteps: 5, runtime: "3m 35s", server: "agent-server-03 (AWS eu-west-1)", browser: "Chrome 121.0.6167", cpu: 55, ram: "2.3GB", network: "10 MB/s", lastJob: null, lastError: null, idleTime: null, retryCount: 0, maxRetries: 3 },
  { id: "Agent-06", status: "error", currentJob: null, currentUser: null, currentAppId: null, progressStep: 0, totalSteps: 0, runtime: "-", server: "agent-server-03 (AWS eu-west-1)", browser: "Chrome 121.0.6167", cpu: 0, ram: "0.5GB", network: "0 MB/s", lastJob: "Spotify - Designer (Lisa P.)", lastError: "Connection timeout after 5m", idleTime: null, retryCount: 3, maxRetries: 3 },
  { id: "Agent-07", status: "active", currentJob: "LinkedIn - Engineer", currentUser: "David L.", currentAppId: "A-7828", progressStep: 5, totalSteps: 5, runtime: "3m 38s", server: "agent-server-01 (AWS us-west-2)", browser: "Chrome 121.0.6167", cpu: 42, ram: "2.0GB", network: "9 MB/s", lastJob: null, lastError: null, idleTime: null, retryCount: 0, maxRetries: 3 },
  { id: "Agent-08", status: "active", currentJob: "Airbnb - PM", currentUser: "Amy C.", currentAppId: "A-7829", progressStep: 1, totalSteps: 5, runtime: "0m 58s", server: "agent-server-02 (AWS us-east-1)", browser: "Chrome 121.0.6167", cpu: 28, ram: "1.7GB", network: "14 MB/s", lastJob: null, lastError: null, idleTime: null, retryCount: 0, maxRetries: 3 },
  { id: "Agent-09", status: "idle", currentJob: null, currentUser: null, currentAppId: null, progressStep: 0, totalSteps: 0, runtime: "-", server: "agent-server-03 (AWS eu-west-1)", browser: "Chrome 121.0.6167", cpu: 3, ram: "0.6GB", network: "0 MB/s", lastJob: "Google - PM (Nina K.)", lastError: null, idleTime: "5m 45s", retryCount: 0, maxRetries: 3 },
  { id: "Agent-10", status: "active", currentJob: "Uber - Backend", currentUser: "Tom H.", currentAppId: "A-7830", progressStep: 2, totalSteps: 5, runtime: "1m 22s", server: "agent-server-01 (AWS us-west-2)", browser: "Chrome 121.0.6167", cpu: 35, ram: "1.8GB", network: "11 MB/s", lastJob: null, lastError: null, idleTime: null, retryCount: 0, maxRetries: 3 },
]

export const mockLogs: LogEntry[] = [
  { id: "l1", timestamp: "10:48:10", level: "info", agentId: "Agent-02", message: "Application completed: #A-7822 - Meta PM", applicationId: "A-7822" },
  { id: "l2", timestamp: "10:48:05", level: "info", agentId: "System", message: "Agent-06 marked for restart after timeout" },
  { id: "l3", timestamp: "10:48:00", level: "error", agentId: "Agent-06", message: "Timeout on page load - Netflix portal unresponsive", applicationId: "A-7827" },
  { id: "l4", timestamp: "10:47:55", level: "warn", agentId: "Agent-06", message: "Slow response from Netflix careers portal (>5000ms)" },
  { id: "l5", timestamp: "10:47:52", level: "info", agentId: "Agent-01", message: "Resume uploaded successfully for Rohan K.", applicationId: "A-7821" },
  { id: "l6", timestamp: "10:47:48", level: "info", agentId: "Agent-01", message: "Navigating to Google careers portal", applicationId: "A-7821" },
  { id: "l7", timestamp: "10:47:45", level: "info", agentId: "Agent-01", message: "Application started: #A-7821 - Google Sr. SWE", applicationId: "A-7821" },
  { id: "l8", timestamp: "10:47:42", level: "info", agentId: "Agent-03", message: "Clicking Next button on Apple portal", applicationId: "A-7823" },
  { id: "l9", timestamp: "10:47:40", level: "info", agentId: "Agent-03", message: "Phone entered: +1-555-345-6789", applicationId: "A-7823" },
  { id: "l10", timestamp: "10:47:38", level: "info", agentId: "Agent-08", message: "Opening Airbnb careers portal", applicationId: "A-7829" },
  { id: "l11", timestamp: "10:47:35", level: "info", agentId: "Agent-05", message: "Answering screening question 2/4", applicationId: "A-7824" },
  { id: "l12", timestamp: "10:47:33", level: "info", agentId: "Agent-01", message: "Entering name: Rohan Kumar", applicationId: "A-7821" },
  { id: "l13", timestamp: "10:47:30", level: "warn", agentId: "Agent-05", message: "Netflix portal slow response (3200ms)", applicationId: "A-7824" },
  { id: "l14", timestamp: "10:47:25", level: "info", agentId: "Agent-10", message: "Application queued: #A-7830 - Uber Backend", applicationId: "A-7830" },
  { id: "l15", timestamp: "10:47:20", level: "info", agentId: "Agent-07", message: "Submitting application to LinkedIn", applicationId: "A-7828" },
]

export const mockChartData = {
  applicationsPerHour: [
    { time: "6am", count: 12 },
    { time: "7am", count: 28 },
    { time: "8am", count: 45 },
    { time: "9am", count: 89 },
    { time: "10am", count: 120 },
    { time: "11am", count: 98 },
    { time: "12pm", count: 76 },
    { time: "1pm", count: 85 },
    { time: "2pm", count: 92 },
    { time: "3pm", count: 78 },
  ],
  applicationsOverWeek: [
    { day: "Mon", count: 1180 },
    { day: "Tue", count: 1340 },
    { day: "Wed", count: 1220 },
    { day: "Thu", count: 1450 },
    { day: "Fri", count: 1100 },
    { day: "Sat", count: 620 },
    { day: "Sun", count: 480 },
  ],
  failureReasons: [
    { reason: "Timeout", percentage: 45 },
    { reason: "Form Error", percentage: 28 },
    { reason: "Portal Down", percentage: 18 },
    { reason: "Auth Failed", percentage: 9 },
  ],
  peakHours: [
    { hour: "6am", count: 45 },
    { hour: "7am", count: 120 },
    { hour: "8am", count: 280 },
    { hour: "9am", count: 450 },
    { hour: "10am", count: 520 },
    { hour: "11am", count: 490 },
    { hour: "12pm", count: 380 },
    { hour: "1pm", count: 420 },
    { hour: "2pm", count: 460 },
    { hour: "3pm", count: 350 },
    { hour: "4pm", count: 280 },
    { hour: "5pm", count: 180 },
  ],
}
