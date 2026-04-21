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

  // ─── Skills (expanded keyword list, word-boundary matching) ───
  const skillKeywords = [
    "react", "node.js", "nodejs", "python", "java", "javascript", "typescript", "aws",
    "docker", "kubernetes", "sql", "nosql", "mongodb", "postgresql", "redis", "graphql",
    "rest api", "microservices", "agile", "scrum", "git", "ci/cd", "jenkins",
    "terraform", "ansible", "linux", "ios", "android", "swift", "kotlin", "flutter",
    "react native", "vue", "angular", "django", "flask", "spring", "express", "fastapi",
    "go", "golang", "rust", "c++", "c#", ".net", "ruby", "rails", "php", "laravel",
    "salesforce", "tableau", "power bi", "figma", "machine learning", "deep learning",
    "nlp", "computer vision", "data science", "pytorch", "tensorflow", "spark",
    "kafka", "elasticsearch", "rabbitmq", "nginx", "gcp", "azure", "cloudflare",
    "next.js", "nextjs", "svelte", "tailwind", "sass", "webpack", "vite",
    "cypress", "jest", "selenium", "grafana", "prometheus", "datadog",
    "snowflake", "dbt", "airflow", "pandas", "numpy", "scikit-learn",
    "openai", "langchain", "llm", "rag", "vector database",
    "solidity", "web3", "blockchain", "ethereum",
  ]

  const foundSkills = new Set<string>()
  for (const skill of skillKeywords) {
    // Word-boundary match to avoid partial matches (e.g. "go" in "google")
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const regex = new RegExp(`\\b${escaped}\\b`, "i")
    if (regex.test(lowerPlain)) {
      const display = skill === "golang" ? "Go" : skill === "nodejs" ? "Node.js" : skill === "nextjs" ? "Next.js"
        : skill.split(/[\s/]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
      foundSkills.add(display)
    }
  }
  result.skills = Array.from(foundSkills).slice(0, 15)

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

/**
 * Title-first, section-aware experience level extraction.
 * Priority: title keywords > year requirements in req section > year mentions in full text
 */
function extractExperienceLevel(lowerTitle: string, reqSection: string, fullText: string): string {
  // 1. Title is the strongest signal
  if (/\bintern(?:ship)?\b/.test(lowerTitle)) return "Internship"
  if (/\bentry[\s-]?level\b/.test(lowerTitle)) return "Entry Level (0-1 years)"
  if (/\bjunior\b|\bjr\.?\b/.test(lowerTitle) && !/\bsenior\b/.test(lowerTitle)) return "Junior (1-3 years)"
  if (/\bstaff\b/.test(lowerTitle)) return "Principal/Staff (10+ years)"
  if (/\bprincipal\b/.test(lowerTitle)) return "Principal/Staff (10+ years)"
  if (/\bdirector\b/.test(lowerTitle)) return "Principal/Staff (10+ years)"
  if (/\bvp\b|\bvice\s+president\b/.test(lowerTitle)) return "Principal/Staff (10+ years)"
  // "Lead" only in title as a role, not "team lead" in description
  if (/\blead\b/.test(lowerTitle) && !/\bleader\b/.test(lowerTitle)) return "Lead (8+ years)"
  if (/\bsenior\b|\bsr\.?\b/.test(lowerTitle)) return "Senior (5-8 years)"
  if (/\bmid[\s-]?level\b/.test(lowerTitle)) return "Mid-Level (3-5 years)"
  if (/\bmanager\b/.test(lowerTitle) && /\bengineering\b|\btechnical\b/.test(lowerTitle)) return "Lead (8+ years)"
  if (/\bhead\s+of\b/.test(lowerTitle)) return "Lead (8+ years)"

  // 2. Look for year requirements in the requirements section first
  const yearsFromReq = extractMinYears(reqSection)
  if (yearsFromReq !== null) return yearsToLevel(yearsFromReq)

  // 3. Fall back to full text, but only match "X+ years of experience/engineering" patterns
  const experiencePattern = /(\d+)\+?\s*years?\s+(?:of\s+)?(?:experience|professional|relevant|industry|engineering|software|work)/gi
  let expMatch: RegExpExecArray | null
  const expYears: number[] = []
  while ((expMatch = experiencePattern.exec(fullText)) !== null) {
    expYears.push(parseInt(expMatch[1]))
  }
  if (expYears.length > 0) {
    return yearsToLevel(Math.min(...expYears))
  }

  return ""
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

function yearsToLevel(years: number): string {
  if (years <= 1) return "Entry Level (0-1 years)"
  if (years <= 3) return "Junior (1-3 years)"
  if (years <= 5) return "Mid-Level (3-5 years)"
  if (years <= 8) return "Senior (5-8 years)"
  if (years <= 12) return "Lead (8+ years)"
  return "Principal/Staff (10+ years)"
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
