/**
 * Parses job content to extract structured data.
 * Accepts an optional jobTitle for title-aware extraction.
 */
export function parseJobContent(html: string, jobTitle?: string) {
  const empty = {
    requirements: [] as string[],
    skills: [] as string[],
    benefits: [] as string[],
    responsibilities: [] as string[],
    jobType: "",
    experienceLevel: "",
    salaryMin: "",
    salaryMax: "",
    educationLevel: "",
    workAuthorization: "",
  }

  if (!html) return empty

  const result = { ...empty }

  // Strip HTML to plain text for keyword matching
  const plainText = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  const lowerPlain = plainText.toLowerCase()
  const lowerTitle = (jobTitle || "").toLowerCase().trim()

  // ─── Section extraction helper ───
  // Finds a section by heading and returns the text until the next heading
  function extractSection(text: string, headingPatterns: RegExp[]): string {
    for (const pattern of headingPatterns) {
      const match = text.match(pattern)
      if (match && match.index !== undefined) {
        const start = match.index + match[0].length
        // Find next heading-like boundary
        const rest = text.slice(start)
        const nextHeading = rest.match(/\n\s*(?:#{1,6}\s|[A-Z][A-Z\s]{3,}(?:\n|:)|what\s+you|who\s+you|about\s+the|about\s+ramp|benefits|nice.to.have|requirements|qualifications)/i)
        const end = nextHeading?.index ?? rest.length
        return rest.slice(0, end).trim()
      }
    }
    return ""
  }

  // Extract the requirements/qualifications section text
  const reqSectionPatterns = [
    /(?:what\s+you(?:'ll)?\s+need|what\s+we(?:'re)?\s+looking\s+for|minimum\s+(?:requirements|qualifications)|requirements|qualifications|who\s+you\s+are|about\s+you)\s*[:\n]/i,
  ]
  const reqSection = extractSection(lowerPlain, reqSectionPatterns)

  // ─── Helper: extract list items from HTML sections ───
  function extractListItems(content: string, startPattern: RegExp): string[] {
    const match = content.match(startPattern)
    if (!match) return []
    const startIndex = match.index! + match[0].length
    const nextHeadingMatch = content.slice(startIndex).match(/<h[1-6]|<\/div>|<div class=/i)
    const endIndex = nextHeadingMatch ? startIndex + nextHeadingMatch.index! : content.length
    const sectionContent = content.slice(startIndex, endIndex)
    const items: string[] = []
    let liMatch: RegExpExecArray | null
    const liRegex = /<li[^>]*>(.*?)<\/li>/gi
    while ((liMatch = liRegex.exec(sectionContent)) !== null) {
      const text = liMatch[1]
        .replace(/<[^>]*>/g, " ")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ").trim()
      if (text && text.length > 3) items.push(text)
    }
    return items
  }

  // ─── Requirements ───
  const reqHtmlPatterns = [
    /<h[1-6][^>]*>.*?(what\s+you(?:'ll)?\s+need|what\s+we(?:'re)?\s+looking\s+for|minimum\s+requirements|minimum\s+qualifications|qualifications|requirements|who\s+you\s+are|about\s+you).*?<\/h[1-6]>/i,
    /<strong>.*?(what\s+you(?:'ll)?\s+need|minimum\s+requirements|qualifications|requirements).*?<\/strong>/i,
    /<p[^>]*>.*?<strong>.*?(requirements|qualifications).*?<\/strong>.*?<\/p>/i,
  ]
  for (const pattern of reqHtmlPatterns) {
    const items = extractListItems(html, pattern)
    if (items.length > 0) { result.requirements.push(...items); break }
  }

  // Preferred qualifications
  const prefHtmlPatterns = [
    /<h[1-6][^>]*>.*?(preferred\s+qualifications|nice[\s-]+to[\s-]+have|bonus\s+points|ideal\s+candidate).*?<\/h[1-6]>/i,
  ]
  for (const pattern of prefHtmlPatterns) {
    const items = extractListItems(html, pattern)
    if (items.length > 0) { result.requirements.push(...items); break }
  }

  // ─── Responsibilities ───
  const respHtmlPatterns = [
    /<h[1-6][^>]*>.*?(responsibilities|what\s+you'll\s+do|what\s+you\s+will\s+do|your\s+role|the\s+role|day\s+to\s+day|duties).*?<\/h[1-6]>/i,
  ]
  for (const pattern of respHtmlPatterns) {
    const items = extractListItems(html, pattern)
    if (items.length > 0) result.responsibilities.push(...items)
  }

  // ─── Benefits ───
  const benefitHtmlPatterns = [
    /<h[1-6][^>]*>.*?(benefits|perks|what\s+we\s+offer|pay\s+and\s+benefits|our\s+benefits|why\s+join\s+us|package).*?<\/h[1-6]>/i,
  ]
  for (const pattern of benefitHtmlPatterns) {
    const items = extractListItems(html, pattern)
    if (items.length > 0) result.benefits.push(...items)
  }

  // ─── Skills ───
  result.skills = extractSkills(lowerPlain)

  // ─── Job Type ───
  // Only match as standalone phrases, not inside other words
  if (/\bfull[\s-]?time\b/i.test(lowerPlain)) {
    result.jobType = "Full-time"
  } else if (/\bpart[\s-]?time\b/i.test(lowerPlain)) {
    result.jobType = "Part-time"
  } else if (/\bcontract\b/i.test(lowerTitle) || /\bcontract\s+(position|role|opportunity)\b/i.test(lowerPlain)) {
    result.jobType = "Contract"
  } else if (/\bintern(?:ship)?\b/i.test(lowerTitle) || /\binternship\b/i.test(lowerPlain)) {
    result.jobType = "Internship"
  } else if (/\bfreelance\b/i.test(lowerPlain)) {
    result.jobType = "Freelance"
  }

  // ─── Experience Level (title-first, then section-aware) ───
  result.experienceLevel = extractExperienceLevel(lowerTitle, reqSection || lowerPlain, lowerPlain)

  // ─── Salary Range ───
  const salaryResult = extractSalary(plainText)
  if (salaryResult) {
    result.salaryMin = salaryResult.min
    result.salaryMax = salaryResult.max
  }

  // ─── Education Level (section-aware) ───
  // Prefer matching in requirements section, fall back to full text
  const eduText = reqSection || lowerPlain
  result.educationLevel = extractEducation(eduText)

  // ─── Work Authorization ───
  result.workAuthorization = extractWorkAuth(lowerPlain)

  return result
}

/** Valid experience levels */
export const EXPERIENCE_LEVELS = [
  "Internship",
  "Entry Level",
  "Middle Level",
  "Senior Level",
  "Lead",
  "Principal",
  "Director",
  "VP",
  "C-Level",
] as const

export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number]

/**
 * Normalize any experience string to one of the 8 allowed levels.
 * Use this everywhere before writing to the DB.
 */
export function normalizeExperienceLevel(raw: string | null | undefined): ExperienceLevel {
  if (!raw) return "Entry Level"
  const lower = raw.toLowerCase().trim()

  // Already one of the valid values (case-insensitive)
  if (lower === "internship") return "Internship"
  if (lower === "entry level") return "Entry Level"
  if (lower === "middle level") return "Middle Level"
  if (lower === "senior level") return "Senior Level"
  if (lower === "lead") return "Lead"
  if (lower === "principal") return "Principal"
  if (lower === "director") return "Director"
  if (lower === "vp") return "VP"
  if (lower === "c-level") return "C-Level"

  // Map legacy / free-form values
  if (/c[\s-]?level|c[\s-]?suite|\bchief\b|\bceo\b|\bcto\b|\bcfo\b|\bcoo\b|\bcio\b|\bcmo\b/.test(lower)) return "C-Level"
  if (/\bvp\b|\bvice[\s-]?president\b/.test(lower)) return "VP"
  if (/\bdirector\b/.test(lower)) return "Director"
  if (/\bprincipal\b|\bstaff\b|\bdistinguished\b|\bfellow\b/.test(lower)) return "Principal"
  if (/\blead\b|\bhead\s+of\b|\bmanager\b/.test(lower)) return "Lead"
  if (/\bsenior\b|\bsr\.?\b|senior|5[\s-]?8|8\+/.test(lower)) return "Senior Level"
  if (/\bmid[\s-]?level\b|\bmiddle\b|3[\s-]?5/.test(lower)) return "Middle Level"
  if (/\bjunior\b|\bjr\.?\b|1[\s-]?3/.test(lower)) return "Middle Level"
  if (/\bintern(?:ship)?\b|\bco[\s-]?op\b/.test(lower)) return "Internship"
  if (/\bentry\b|0[\s-]?1/.test(lower)) return "Entry Level"

  return "Entry Level"
}

/**
 * Title-first, section-aware experience level extraction.
 * Priority: title keywords > year requirements in req section > year mentions in full text
 */
function extractExperienceLevel(lowerTitle: string, reqSection: string, fullText: string): string {
  // 1. Title is the strongest signal
  if (/\bc[\s-]?level\b|\bchief\b|\bceo\b|\bcto\b|\bcfo\b|\bcoo\b|\bcio\b/.test(lowerTitle)) return "C-Level"
  if (/\bvp\b|\bvice\s+president\b/.test(lowerTitle)) return "VP"
  if (/\bdirector\b/.test(lowerTitle)) return "Director"
  if (/\bprincipal\b|\bstaff\b|\bdistinguished\b|\bfellow\b/.test(lowerTitle)) return "Principal"
  if (/\blead\b/.test(lowerTitle) && !/\bleader\b/.test(lowerTitle)) return "Lead"
  if (/\bmanager\b/.test(lowerTitle) && /\bengineering\b|\btechnical\b/.test(lowerTitle)) return "Lead"
  if (/\bhead\s+of\b/.test(lowerTitle)) return "Lead"
  if (/\bsenior\b|\bsr\.?\b/.test(lowerTitle)) return "Senior Level"
  if (/\bmid[\s-]?level\b/.test(lowerTitle)) return "Middle Level"
  if (/\bjunior\b|\bjr\.?\b/.test(lowerTitle) && !/\bsenior\b/.test(lowerTitle)) return "Middle Level"
  if (/\bintern(?:ship)?\b|\bco[\s-]?op\b/.test(lowerTitle)) return "Internship"
  if (/\bentry[\s-]?level\b/.test(lowerTitle)) return "Entry Level"

  // 2. Look for year requirements in the requirements section first
  const yearsFromReq = extractMinYears(reqSection)
  if (yearsFromReq !== null) return yearsToLevel(yearsFromReq)

  // 3. Fall back to full text
  const experiencePattern = /(\d+)\+?\s*years?\s+(?:of\s+)?(?:experience|professional|relevant|industry|engineering|software|work)/gi
  let expMatch: RegExpExecArray | null
  const expYears: number[] = []
  while ((expMatch = experiencePattern.exec(fullText)) !== null) {
    expYears.push(parseInt(expMatch[1]))
  }
  if (expYears.length > 0) {
    return yearsToLevel(Math.min(...expYears))
  }

  return "Entry Level"
}

/**
 * Extract the minimum year requirement from a section of text.
 * Looks for patterns like "5+ years", "minimum 3 years", "at least 2 years"
 */
function extractMinYears(text: string): number | null {
  if (!text) return null

  const patterns = [
    /(?:minimum|at\s+least|min\.?)\s+(\d+)\+?\s*years?/gi,
    /(\d+)\+?\s*years?\s+(?:of\s+)?(?:experience|professional|relevant|engineering|software|work|industry)/gi,
    /(\d+)\+?\s*years?/gi,
  ]

  for (const pattern of patterns) {
    let match: RegExpExecArray | null
    const yearValues: number[] = []
    const regex = new RegExp(pattern.source, pattern.flags)
    while ((match = regex.exec(text)) !== null) {
      yearValues.push(parseInt(match[1]))
    }
    if (yearValues.length > 0) {
      const years = Math.min(...yearValues)
      if (years > 0 && years < 30) return years
    }
  }

  return null
}

function yearsToLevel(years: number): ExperienceLevel {
  if (years <= 1) return "Entry Level"
  if (years <= 3) return "Middle Level"
  if (years <= 5) return "Middle Level"
  if (years <= 8) return "Senior Level"
  if (years <= 12) return "Lead"
  return "Principal"
}

/**
 * Extract skills from text using keyword matching.
 * Covers engineering, data, design, sales, marketing, finance, HR, ops, and more.
 */
export function extractSkills(text: string): string[] {
  const SKILL_KEYWORDS: [string, string][] = [
    // --- Programming Languages ---
    ["python", "Python"], ["java", "Java"], ["javascript", "JavaScript"], ["typescript", "TypeScript"],
    ["go", "Go"], ["golang", "Go"], ["rust", "Rust"], ["c\\+\\+", "C++"], ["c#", "C#"],
    ["ruby", "Ruby"], ["php", "PHP"], ["swift", "Swift"], ["kotlin", "Kotlin"],
    ["scala", "Scala"], ["r\\b", "R"], ["matlab", "MATLAB"], ["perl", "Perl"],
    ["lua", "Lua"], ["haskell", "Haskell"], ["elixir", "Elixir"], ["clojure", "Clojure"],
    ["dart", "Dart"], ["objective-c", "Objective-C"], ["shell", "Shell"], ["bash", "Bash"],
    ["powershell", "PowerShell"], ["solidity", "Solidity"],
    // --- Frontend ---
    ["react", "React"], ["react native", "React Native"], ["vue", "Vue"], ["angular", "Angular"],
    ["next\\.js", "Next.js"], ["nextjs", "Next.js"], ["svelte", "Svelte"], ["nuxt", "Nuxt"],
    ["tailwind", "Tailwind"], ["sass", "Sass"], ["webpack", "Webpack"], ["vite", "Vite"],
    ["html", "HTML"], ["css", "CSS"], ["redux", "Redux"], ["jquery", "jQuery"],
    ["bootstrap", "Bootstrap"], ["material ui", "Material UI"], ["storybook", "Storybook"],
    // --- Backend ---
    ["node\\.js", "Node.js"], ["nodejs", "Node.js"], ["express", "Express"], ["fastapi", "FastAPI"],
    ["django", "Django"], ["flask", "Flask"], ["spring", "Spring"], ["spring boot", "Spring Boot"],
    ["\\.net", ".NET"], ["rails", "Rails"], ["laravel", "Laravel"], ["nestjs", "NestJS"],
    ["graphql", "GraphQL"], ["rest api", "REST API"], ["grpc", "gRPC"],
    ["microservices", "Microservices"],
    // --- Databases ---
    ["sql", "SQL"], ["nosql", "NoSQL"], ["postgresql", "PostgreSQL"], ["mysql", "MySQL"],
    ["mongodb", "MongoDB"], ["redis", "Redis"], ["dynamodb", "DynamoDB"],
    ["cassandra", "Cassandra"], ["oracle", "Oracle DB"], ["sqlite", "SQLite"],
    ["neo4j", "Neo4j"], ["couchbase", "Couchbase"], ["supabase", "Supabase"],
    ["firebase", "Firebase"], ["cockroachdb", "CockroachDB"],
    // --- Cloud & Infra ---
    ["aws", "AWS"], ["gcp", "GCP"], ["azure", "Azure"], ["cloudflare", "Cloudflare"],
    ["docker", "Docker"], ["kubernetes", "Kubernetes"], ["terraform", "Terraform"],
    ["ansible", "Ansible"], ["jenkins", "Jenkins"], ["ci\\/cd", "CI/CD"],
    ["github actions", "GitHub Actions"], ["gitlab", "GitLab"], ["circleci", "CircleCI"],
    ["linux", "Linux"], ["nginx", "Nginx"], ["apache", "Apache"],
    ["serverless", "Serverless"], ["lambda", "Lambda"], ["heroku", "Heroku"],
    ["vercel", "Vercel"], ["netlify", "Netlify"],
    // --- Data & ML ---
    ["machine learning", "Machine Learning"], ["deep learning", "Deep Learning"],
    ["nlp", "NLP"], ["computer vision", "Computer Vision"], ["data science", "Data Science"],
    ["pytorch", "PyTorch"], ["tensorflow", "TensorFlow"], ["spark", "Spark"],
    ["kafka", "Kafka"], ["airflow", "Airflow"], ["pandas", "Pandas"], ["numpy", "NumPy"],
    ["scikit-learn", "Scikit-learn"], ["snowflake", "Snowflake"], ["dbt", "dbt"],
    ["databricks", "Databricks"], ["hadoop", "Hadoop"], ["hive", "Hive"],
    ["redshift", "Redshift"], ["bigquery", "BigQuery"], ["looker", "Looker"],
    ["openai", "OpenAI"], ["langchain", "LangChain"], ["llm", "LLM"],
    ["rag", "RAG"], ["vector database", "Vector Database"], ["hugging face", "Hugging Face"],
    ["etl", "ETL"], ["data pipeline", "Data Pipelines"], ["data warehouse", "Data Warehouse"],
    ["data modeling", "Data Modeling"],
    // --- Monitoring & Observability ---
    ["grafana", "Grafana"], ["prometheus", "Prometheus"], ["datadog", "Datadog"],
    ["splunk", "Splunk"], ["new relic", "New Relic"], ["elasticsearch", "Elasticsearch"],
    ["kibana", "Kibana"], ["pagerduty", "PagerDuty"],
    // --- Testing ---
    ["cypress", "Cypress"], ["jest", "Jest"], ["selenium", "Selenium"],
    ["playwright", "Playwright"], ["mocha", "Mocha"], ["junit", "JUnit"],
    ["pytest", "Pytest"], ["postman", "Postman"],
    // --- Mobile ---
    ["ios", "iOS"], ["android", "Android"], ["flutter", "Flutter"],
    ["swiftui", "SwiftUI"], ["jetpack compose", "Jetpack Compose"],
    // --- DevOps & Version Control ---
    ["git", "Git"], ["agile", "Agile"], ["scrum", "Scrum"], ["kanban", "Kanban"],
    ["jira", "Jira"], ["confluence", "Confluence"],
    // --- Security ---
    ["oauth", "OAuth"], ["sso", "SSO"], ["penetration testing", "Penetration Testing"],
    ["soc 2", "SOC 2"], ["iso 27001", "ISO 27001"], ["owasp", "OWASP"],
    // --- Web3 ---
    ["web3", "Web3"], ["blockchain", "Blockchain"], ["ethereum", "Ethereum"],
    ["smart contracts", "Smart Contracts"], ["defi", "DeFi"],
    // --- Design & UX ---
    ["figma", "Figma"], ["sketch", "Sketch"], ["adobe xd", "Adobe XD"],
    ["invision", "InVision"], ["photoshop", "Photoshop"], ["illustrator", "Illustrator"],
    ["after effects", "After Effects"], ["premiere pro", "Premiere Pro"],
    ["user research", "User Research"], ["wireframing", "Wireframing"],
    ["prototyping", "Prototyping"], ["design systems", "Design Systems"],
    ["accessibility", "Accessibility"], ["responsive design", "Responsive Design"],
    // --- Sales & CRM ---
    ["salesforce", "Salesforce"], ["hubspot", "HubSpot"], ["pipedrive", "Pipedrive"],
    ["outreach", "Outreach"], ["salesloft", "SalesLoft"], ["gong", "Gong"],
    ["cold calling", "Cold Calling"], ["lead generation", "Lead Generation"],
    ["account management", "Account Management"], ["pipeline management", "Pipeline Management"],
    ["solution selling", "Solution Selling"], ["consultative selling", "Consultative Selling"],
    ["saas sales", "SaaS Sales"], ["enterprise sales", "Enterprise Sales"],
    ["sales operations", "Sales Operations"], ["crm", "CRM"],
    ["business development", "Business Development"], ["negotiation", "Negotiation"],
    ["contract negotiation", "Contract Negotiation"],
    // --- Marketing ---
    ["seo", "SEO"], ["sem", "SEM"], ["google ads", "Google Ads"],
    ["facebook ads", "Facebook Ads"], ["google analytics", "Google Analytics"],
    ["content marketing", "Content Marketing"], ["email marketing", "Email Marketing"],
    ["social media marketing", "Social Media Marketing"], ["brand strategy", "Brand Strategy"],
    ["marketing automation", "Marketing Automation"], ["marketo", "Marketo"],
    ["mailchimp", "Mailchimp"], ["copywriting", "Copywriting"],
    ["demand generation", "Demand Generation"], ["product marketing", "Product Marketing"],
    ["growth marketing", "Growth Marketing"], ["abm", "ABM"],
    // --- Finance & Accounting ---
    ["financial modeling", "Financial Modeling"], ["financial analysis", "Financial Analysis"],
    ["fp&a", "FP&A"], ["gaap", "GAAP"], ["ifrs", "IFRS"],
    ["quickbooks", "QuickBooks"], ["netsuite", "NetSuite"], ["sap", "SAP"],
    ["budgeting", "Budgeting"], ["forecasting", "Forecasting"],
    ["accounts payable", "Accounts Payable"], ["accounts receivable", "Accounts Receivable"],
    ["revenue recognition", "Revenue Recognition"], ["audit", "Audit"],
    ["tax compliance", "Tax Compliance"], ["treasury", "Treasury"],
    // --- HR & People ---
    ["workday", "Workday"], ["bamboohr", "BambooHR"], ["greenhouse", "Greenhouse"],
    ["lever", "Lever"], ["talent acquisition", "Talent Acquisition"],
    ["employee relations", "Employee Relations"], ["compensation", "Compensation"],
    ["benefits administration", "Benefits Administration"],
    ["performance management", "Performance Management"],
    ["hris", "HRIS"], ["onboarding", "Onboarding"],
    // --- PM & Strategy ---
    ["product management", "Product Management"], ["product strategy", "Product Strategy"],
    ["roadmap", "Roadmapping"], ["a\\/b testing", "A/B Testing"],
    ["okr", "OKRs"], ["stakeholder management", "Stakeholder Management"],
    ["go-to-market", "Go-to-Market"], ["competitive analysis", "Competitive Analysis"],
    // --- Analytics & BI ---
    ["tableau", "Tableau"], ["power bi", "Power BI"], ["mixpanel", "Mixpanel"],
    ["amplitude", "Amplitude"], ["segment", "Segment"], ["domo", "Domo"],
    ["data visualization", "Data Visualization"], ["statistical analysis", "Statistical Analysis"],
    // --- Operations & Supply Chain ---
    ["supply chain", "Supply Chain"], ["logistics", "Logistics"],
    ["procurement", "Procurement"], ["inventory management", "Inventory Management"],
    ["lean", "Lean"], ["six sigma", "Six Sigma"], ["process improvement", "Process Improvement"],
    ["vendor management", "Vendor Management"],
    // --- Legal & Compliance ---
    ["contract management", "Contract Management"], ["regulatory compliance", "Regulatory Compliance"],
    ["gdpr", "GDPR"], ["hipaa", "HIPAA"], ["sox", "SOX"],
    ["intellectual property", "Intellectual Property"], ["risk management", "Risk Management"],
    // --- Customer Success ---
    ["customer success", "Customer Success"], ["customer support", "Customer Support"],
    ["zendesk", "Zendesk"], ["intercom", "Intercom"], ["freshdesk", "Freshdesk"],
    ["technical support", "Technical Support"], ["customer onboarding", "Customer Onboarding"],
    // --- Communication & Collaboration ---
    ["slack", "Slack"], ["microsoft teams", "Microsoft Teams"],
    ["google workspace", "Google Workspace"], ["o365", "Office 365"],
    ["ms office", "MS Office"], ["asana", "Asana"], ["monday\.com", "Monday.com"],
    ["notion", "Notion"], ["trello", "Trello"],
    // --- Misc Tools ---
    ["okta", "Okta"], ["auth0", "Auth0"], ["stripe", "Stripe"],
    ["twilio", "Twilio"], ["sendgrid", "SendGrid"], ["rabbitmq", "RabbitMQ"],
    ["jamf", "JAMF"], ["intune", "Intune"], ["mdm", "MDM"],
  ]

  const foundSkills = new Set<string>()
  for (const [pattern, display] of SKILL_KEYWORDS) {
    const regex = new RegExp(`\\b${pattern}\\b`, "i")
    if (regex.test(text)) {
      foundSkills.add(display)
    }
  }
  return Array.from(foundSkills).slice(0, 20)
}

/**
 * Extract salary from text. Handles multiple formats:
 * $120,000 - $180,000 | $120k-$180k | $103,628 – $148,040 CAD | ₹X - ₹Y LPA
 */
function extractSalary(text: string): { min: string; max: string } | null {
  const patterns = [
    // $120,000 - $180,000 or $120,000.00 – $180,000.00
    /\$\s*([\d,]+(?:\.\d{2})?)\s*[-–—to]+\s*\$\s*([\d,]+(?:\.\d{2})?)/i,
    // $120k - $180k
    /\$\s*(\d+)\s*k\s*[-–—to]+\s*\$\s*(\d+)\s*k/i,
    // $120K-$180K (uppercase)
    /\$\s*(\d+)\s*K\s*[-–—to]+\s*\$\s*(\d+)\s*K/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      let min = match[1].replace(/,/g, "")
      let max = match[2].replace(/,/g, "")

      // Handle k notation
      if (/k/i.test(pattern.source)) {
        min = (parseInt(min) * 1000).toString()
        max = (parseInt(max) * 1000).toString()
      }

      // Remove decimal cents
      min = Math.round(parseFloat(min)).toString()
      max = Math.round(parseFloat(max)).toString()

      // Sanity check: salary should be reasonable
      const minNum = parseInt(min)
      const maxNum = parseInt(max)
      if (minNum > 10000 && maxNum > minNum && maxNum < 10000000) {
        return { min, max }
      }
    }
  }

  return null
}

/**
 * Extract education level from text, preferring requirements section context.
 * Uses word boundaries to avoid false matches.
 */
function extractEducation(text: string): string {
  // Order from most specific to least
  if (/\bphd\b|\bph\.?d\b|\bdoctorate\b|\bdoctoral\b/i.test(text)) return "PhD/Doctorate"
  if (/\bmba\b/i.test(text)) return "MBA"
  if (/\bmaster(?:'?s)?\s+(?:degree|of|in)\b|\bm\.?s\.?\s+(?:in|degree)\b/i.test(text)) return "Master's Degree"
  if (/\bbachelor(?:'?s)?\s+(?:degree|of|in)\b|\bb\.?s\.?\s+(?:in|degree)\b|\bb\.?a\.?\s+(?:in|degree)\b/i.test(text)) return "Bachelor's Degree"
  if (/\bassociate(?:'?s)?\s+(?:degree|of|in)\b/i.test(text)) return "Associate's Degree"
  if (/\bhigh\s+school\s+diploma\b|\bhs\s+diploma\b|\bged\b/i.test(text)) return "High School Diploma"
  // Looser matches as fallback
  if (/\bbachelor(?:'?s)?\b/i.test(text)) return "Bachelor's Degree"
  if (/\bmaster(?:'?s)?\b/i.test(text) && !/\bmaster(?:ing|ed|y|ful)\b/i.test(text)) return "Master's Degree"
  return ""
}

/**
 * Extract work authorization requirements.
 * Uses phrase matching to avoid false positives.
 */
function extractWorkAuth(text: string): string {
  if (/\bus\s+citizen(?:ship)?\s+(?:or|and)\s+(?:green\s+card|permanent\s+resident)/i.test(text)) {
    return "US Citizen or Green Card holder only"
  }
  if (/\bno\s+(?:visa\s+)?sponsorship\b|\bnot\s+(?:able\s+to\s+)?sponsor\b|\bwill\s+not\s+sponsor\b|\bunable\s+to\s+sponsor\b/i.test(text)) {
    return "Must be authorized to work (no sponsorship)"
  }
  if (/\bvisa\s+sponsor(?:ship)?\s+(?:available|provided|offered)\b|\bwill\s+sponsor\b|\bh[\s-]?1b\s+(?:sponsor|transfer)\b/i.test(text)) {
    return "Will sponsor work visa (H1B, etc.)"
  }
  if (/\bmust\s+be\s+(?:legally\s+)?authorized\s+to\s+work\b|\bwork\s+authorization\s+required\b/i.test(text)) {
    return "Must be authorized to work (no sponsorship)"
  }
  if (/\bopen\s+to\s+all\s+(?:work\s+)?authorization\b|\bany\s+work\s+authorization\b/i.test(text)) {
    return "Open to all work authorization statuses"
  }
  if (/\bgreen\s+card\s+(?:holder|required)\b/i.test(text)) {
    return "US Citizen or Green Card holder only"
  }
  return ""
}

/**
 * Parse salary from Lever's `additional` field or Ashby compensation.
 * These are separate from the main description.
 */
export function parseSalaryFromText(text: string): { min: string; max: string } | null {
  if (!text) return null
  const plain = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
  return extractSalary(plain)
}

/**
 * Map Lever commitment values to standard job types.
 */
export function mapLeverCommitment(commitment: string): string {
  if (!commitment) return ""
  const lower = commitment.toLowerCase()
  if (lower === "permanent" || lower === "full-time" || lower === "fulltime") return "Full-time"
  if (lower === "part-time" || lower === "parttime") return "Part-time"
  if (lower === "contract" || lower === "contractor") return "Contract"
  if (lower === "intern" || lower === "internship") return "Internship"
  if (lower === "freelance") return "Freelance"
  if (lower === "temporary" || lower === "temp") return "Contract"
  return commitment
}

/**
 * Map Ashby employmentType values to standard job types.
 */
export function mapAshbyEmploymentType(type: string): string {
  if (!type) return ""
  const lower = type.toLowerCase()
  if (lower === "fulltime" || lower === "full-time" || lower === "full_time") return "Full-time"
  if (lower === "parttime" || lower === "part-time" || lower === "part_time") return "Part-time"
  if (lower === "contract" || lower === "contractor") return "Contract"
  if (lower === "intern" || lower === "internship") return "Internship"
  if (lower === "freelance") return "Freelance"
  if (lower === "temporary" || lower === "temp") return "Contract"
  return type
}
