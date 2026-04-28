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

  // ─── Education Level (section-aware with sanity check) ───
  result.educationLevel = extractEducationSafe(reqSection, lowerPlain, lowerTitle)

  // ─── Work Authorization ───
  result.workAuthorization = extractWorkAuth(lowerPlain)

  return result
}

/** Valid job types */
export const JOB_TYPES = [
  "Full-time",
  "Part-time",
  "Contract",
  "Internship",
  "Freelance",
] as const

export type JobType = (typeof JOB_TYPES)[number]

/**
 * Normalize any job type string to one of the 5 valid values.
 * Use this everywhere before writing to the DB.
 */
export function normalizeJobType(raw: string | null | undefined): JobType {
  if (!raw) return "Full-time"
  const lower = raw.toLowerCase().trim()

  if (lower === "full-time" || lower === "fulltime" || lower === "full_time" || lower === "full time") return "Full-time"
  if (lower === "part-time" || lower === "parttime" || lower === "part_time" || lower === "part time") return "Part-time"
  if (lower === "contract" || lower === "contractor") return "Contract"
  if (lower === "internship" || lower === "intern") return "Internship"
  if (lower === "freelance" || lower === "freelancer") return "Freelance"

  // Fuzzy matching for ATS values that slip through mappers
  if (lower.includes("full") && (lower.includes("time") || lower.includes("regular") || lower.includes("permanent"))) return "Full-time"
  if (lower.includes("part") && lower.includes("time")) return "Part-time"
  if (lower.includes("contract") || lower.includes("temporary") || lower.includes("temp")) return "Contract"
  if (lower.includes("intern")) return "Internship"
  if (lower.includes("freelance")) return "Freelance"
  if (lower === "permanent" || lower === "regular") return "Full-time"

  return "Full-time"
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
 * Normalize any experience string to one of the 9 allowed levels.
 * Handles ATS values, UI dropdown values ("Entry Level (0-1 years)"), and free-form text.
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

  // Handle UI dropdown format: "Entry Level (0-1 years)", "Junior (1-3 years)", etc.
  if (lower.startsWith("entry level")) return "Entry Level"
  if (lower.startsWith("junior")) return "Middle Level"
  if (lower.startsWith("mid-level") || lower.startsWith("mid level")) return "Middle Level"
  if (lower.startsWith("senior")) return "Senior Level"
  if (lower.startsWith("lead")) return "Lead"
  if (lower.startsWith("principal") || lower.startsWith("staff")) return "Principal"

  // Map legacy / free-form values
  if (/c[\s-]?level|c[\s-]?suite|\bchief\b|\bceo\b|\bcto\b|\bcfo\b|\bcoo\b|\bcio\b|\bcmo\b/.test(lower)) return "C-Level"
  if (/\bvp\b|\bvice[\s-]?president\b/.test(lower)) return "VP"
  if (/\bdirector\b/.test(lower)) return "Director"
  if (/\bprincipal\b|\bstaff\b|\bdistinguished\b|\bfellow\b/.test(lower)) return "Principal"
  if (/\blead\b|\bhead\s+of\b|\bmanager\b/.test(lower)) return "Lead"
  if (/\bsenior\b|\bsr\.?\b|5[\s-]?8|8\+/.test(lower)) return "Senior Level"
  if (/\bmid[\s-]?level\b|\bmiddle\b|3[\s-]?5/.test(lower)) return "Middle Level"
  if (/\bjunior\b|\bjr\.?\b|1[\s-]?3/.test(lower)) return "Middle Level"
  if (/\bintern(?:ship)?\b|\bco[\s-]?op\b/.test(lower)) return "Internship"
  if (/\bentry\b|0[\s-]?1/.test(lower)) return "Entry Level"

  return "Entry Level"
}

/**
 * Title-first, section-aware experience level extraction with sanity checks.
 * Priority: title keywords > year requirements in req section > year mentions in full text
 * Sanity: cross-checks years-based result against title to catch mismatches
 */
function extractExperienceLevel(lowerTitle: string, reqSection: string, fullText: string): string {
  // 1. Title is the strongest signal — return immediately
  const titleLevel = extractLevelFromTitle(lowerTitle)
  if (titleLevel) return titleLevel

  // 2. Look for year requirements in the requirements section first
  const yearsFromReq = extractMinYears(reqSection, true)
  if (yearsFromReq !== null) {
    return sanitizeYearsLevel(yearsToLevel(yearsFromReq), lowerTitle)
  }

  // 3. Fall back to full text — only match experience-specific patterns, skip soft mentions
  const yearsFromFull = extractMinYearsFromFullText(fullText)
  if (yearsFromFull !== null) {
    return sanitizeYearsLevel(yearsToLevel(yearsFromFull), lowerTitle)
  }

  return "Entry Level"
}

/** Extract level purely from title keywords — covers all domains and numbered levels */
function extractLevelFromTitle(lowerTitle: string): string | null {
  // ═══════════════════════════════════════════════════════════════════════════
  // 0. INTERNSHIP — highest priority, always wins
  // ═══════════════════════════════════════════════════════════════════════════
  if (/\bintern(?:ship)?\b/.test(lowerTitle)) return "Internship"
  if (/\bco[\s-]?op\b/.test(lowerTitle)) return "Internship"
  if (/\bapprentice(?:ship)?\b/.test(lowerTitle)) return "Internship"
  if (/\bworking\s+student\b|\bwerkstudent\b|\bstudent\s+worker\b/.test(lowerTitle)) return "Internship"
  // Summer/Winter/Spring programs
  if (/\b(?:summer|winter|spring|fall)\s+(?:analyst|associate|fellow|researcher|clerk)\b/.test(lowerTitle)) return "Internship"
  // Placement / Sandwich year (UK)
  if (/\bplacement\s+(?:year|student)\b|\bsandwich\s+(?:year|student|placement)\b/.test(lowerTitle)) return "Internship"
  // Practicum (healthcare/education)
  if (/\bpracticum\b|\bclinical\s+rotation\b/.test(lowerTitle)) return "Internship"
  // Volunteer roles that are internship-like
  if (/\bvolunteer\s+(?:intern|coordinator|assistant)\b/.test(lowerTitle)) return "Internship"

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. C-LEVEL
  // ═══════════════════════════════════════════════════════════════════════════
  if (/\bc[\s-]?level\b/.test(lowerTitle)) return "C-Level"
  // All Chief X Officer variants
  if (/\bchief\s+\w+\s+officer\b|\bchief\s+of\s+staff\b/.test(lowerTitle)) return "C-Level"
  if (/\bchief\b/.test(lowerTitle) && /\bofficer\b|\bexecutive\b|\bstrateg/.test(lowerTitle)) return "C-Level"
  // Standard C-suite abbreviations
  if (/\bceo\b|\bcto\b|\bcfo\b|\bcoo\b|\bcio\b|\bcmo\b|\bcpo\b|\bcro\b|\bcso\b|\bcdo\b|\bcco\b|\bclo\b|\bcao\b|\bcno\b|\bcbo\b/.test(lowerTitle)) return "C-Level"
  // Founder / Co-founder
  if (/\b(?:co[\s-]?)?founder\b/.test(lowerTitle)) return "C-Level"
  // President (not VP)
  if (/\bpresident\b/.test(lowerTitle) && !/\bvice\b/.test(lowerTitle)) return "C-Level"
  // General Manager (top-level)
  if (/\bgeneral\s+manager\b/.test(lowerTitle) && /\bcountry\b|\bregion|\bglobal\b|\bnational\b/.test(lowerTitle)) return "C-Level"
  // General Counsel / General Partner
  if (/\bgeneral\s+counsel\b|\bgeneral\s+partner\b/.test(lowerTitle)) return "C-Level"

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. VP
  // ═══════════════════════════════════════════════════════════════════════════
  if (/\bvice[\s-]?president\b/.test(lowerTitle)) return "VP"
  if (/\bvp\b|\bavp\b|\bsvp\b|\bevp\b|\bgvp\b/.test(lowerTitle)) return "VP"
  // Group VP, Divisional VP
  if (/\b(?:group|divisional|regional|global)\s+vp\b/.test(lowerTitle)) return "VP"

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. DIRECTOR
  // ═══════════════════════════════════════════════════════════════════════════
  if (/\bdirector\b/.test(lowerTitle)) return "Director"
  // Finance: Managing Director
  if (/\bmanaging\s+director\b/.test(lowerTitle)) return "Director"
  // Executive Director (non-profit)
  if (/\bexecutive\s+director\b/.test(lowerTitle)) return "Director"
  // Country/Regional Manager (director-level)
  if (/\b(?:country|regional|national|area)\s+manager\b/.test(lowerTitle)) return "Director"
  // General Manager (non-country)
  if (/\bgeneral\s+manager\b/.test(lowerTitle)) return "Director"
  // Superintendent (education/construction)
  if (/\bsuperintendent\b/.test(lowerTitle)) return "Director"
  // Dean (academia)
  if (/\bdean\b/.test(lowerTitle)) return "Director"
  // Department Head / Chair
  if (/\bdepartment\s+(?:head|chair)\b|\bchair(?:man|woman|person)?\b/.test(lowerTitle) && /\bdepartment\b|\bboard\b/.test(lowerTitle)) return "Director"

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. PRINCIPAL / STAFF / DISTINGUISHED
  // ═══════════════════════════════════════════════════════════════════════════
  if (/\bprincipal\b/.test(lowerTitle)) return "Principal"
  if (/\bstaff\b/.test(lowerTitle) && /\bengineer|\bscientist|\bdesigner|\barchitect|\bdeveloper|\bresearcher|\bwriter|\banalyst/.test(lowerTitle)) return "Principal"
  if (/\bdistinguished\b/.test(lowerTitle)) return "Principal"
  // Fellow (tech — not medical fellow)
  if (/\bfellow\b/.test(lowerTitle) && /\bengineer|\btechni|\bresearch|\bscien|\barchitect/.test(lowerTitle) && !/\bmedic|\bclinical|\bsurg|\bphysician|\bpostdoc/.test(lowerTitle)) return "Principal"
  // Academia: Full Professor, Endowed Chair Professor, Regents Professor
  if (/\bfull\s+professor\b|\bendowed\b.*\bprofessor\b|\bregents?\s+professor\b|\buniversity\s+professor\b|\bchaired\s+professor\b/.test(lowerTitle)) return "Principal"
  // Legal: Partner, Senior Partner, Equity Partner, Named Partner
  if (/\b(?:senior\s+|equity\s+|named\s+|managing\s+)?partner\b/.test(lowerTitle) && !/\bjunior\s+partner\b/.test(lowerTitle)) return "Principal"
  // Consulting: Senior Principal, Principal Consultant
  if (/\bsenior\s+principal\b|\bprincipal\s+consultant\b/.test(lowerTitle)) return "Principal"
  // Architecture: Principal Architect
  if (/\bprincipal\s+architect\b/.test(lowerTitle)) return "Principal"
  // Medicine: Department Chief (already caught by director), Chief Medical Officer (C-level)
  // Engineering: Fellow Engineer, Technical Fellow
  if (/\btechnical\s+fellow\b|\bfellow\s+engineer\b|\bengineering\s+fellow\b/.test(lowerTitle)) return "Principal"

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. LEAD / HEAD / MANAGER
  // ═══════════════════════════════════════════════════════════════════════════
  // Generic "Lead" keyword (but not "lead generation", "leader", "leadership")
  if (/\blead\b/.test(lowerTitle) && !/\bleader(?:ship)?\b|\blead\s+gen/.test(lowerTitle)) return "Lead"
  // Head of X
  if (/\bhead\s+of\b/.test(lowerTitle)) return "Lead"
  // Tech/Engineering Managers
  if (/\bmanager\b/.test(lowerTitle) && /\bengineering\b|\btechnical\b|\bprogram\b|\bproject\b|\bproduct\b|\bdesign\b|\bdata\b|\banalytics\b|\binfrastructure\b|\bplatform\b|\bdevops\b|\bsecurity\b|\bqa\b|\bquality\b|\brelease\b|\bdelivery\b/.test(lowerTitle)) return "Lead"
  // People/Team Manager in tech context
  if (/\b(?:people|team|group)\s+manager\b/.test(lowerTitle)) return "Lead"
  // Scrum Master, Agile Coach (team-level leadership)
  if (/\bscrum\s+master\b|\bagile\s+coach\b/.test(lowerTitle)) return "Lead"
  // Tech Lead, Team Lead, Design Lead, QA Lead, DevOps Lead
  if (/\b(?:tech|team|design|qa|devops|data|security|frontend|backend|mobile|platform|infra|cloud|ml|ai)\s+lead\b/.test(lowerTitle)) return "Lead"
  // Architect (standalone — not "junior architect" or "associate architect")
  if (/\barchitect\b/.test(lowerTitle) && !/\bjunior\b|\bassociate\b|\bintern\b/.test(lowerTitle) && !/\bprincipal\b|\bstaff\b|\bsenior\b|\bchief\b/.test(lowerTitle)) return "Lead"
  // Academia: Associate Professor, Associate Dean
  if (/\bassociate\s+professor\b|\bassociate\s+dean\b/.test(lowerTitle)) return "Lead"
  // Medical: Attending Physician/Surgeon, Chief Resident
  if (/\battending\s+(?:physician|surgeon|doctor)\b|\battending\b/.test(lowerTitle)) return "Lead"
  if (/\bchief\s+resident\b/.test(lowerTitle)) return "Lead"
  // Medical: Nurse Manager, Charge Nurse, Nurse Supervisor
  if (/\bnurse\s+(?:manager|supervisor|director)\b|\bcharge\s+nurse\b/.test(lowerTitle)) return "Lead"
  // Pharmacy: Pharmacy Manager, Lead Pharmacist
  if (/\bpharmacy\s+manager\b|\blead\s+pharmacist\b/.test(lowerTitle)) return "Lead"
  // Education: Department Head, Grade Level Lead, Curriculum Lead
  if (/\bdepartment\s+head\b|\bgrade\s+level\s+lead\b|\bcurriculum\s+lead\b/.test(lowerTitle)) return "Lead"
  // Construction/Trades: Foreman, Superintendent (already caught), Site Manager
  if (/\bforeman\b|\bsite\s+manager\b|\bfield\s+manager\b/.test(lowerTitle)) return "Lead"
  // Hospitality: Executive Chef, Head Chef
  if (/\bexecutive\s+chef\b|\bhead\s+chef\b/.test(lowerTitle)) return "Lead"
  // Creative: Creative Director (already caught by director), Art Director (already caught)
  // Warehouse/Logistics: Warehouse Manager, Operations Manager, Shift Manager
  if (/\b(?:warehouse|operations|shift|plant|facility|store)\s+manager\b/.test(lowerTitle)) return "Lead"
  // Retail: Store Manager, District Manager
  if (/\b(?:store|district|branch)\s+manager\b/.test(lowerTitle)) return "Lead"
  // HR: HR Manager, Recruiting Manager, Talent Manager
  if (/\b(?:hr|recruiting|talent|people\s+ops|compensation|benefits)\s+manager\b/.test(lowerTitle)) return "Lead"
  // Finance: Finance Manager, Controller, Treasurer
  if (/\bfinance\s+manager\b|\bcontroller\b|\btreasurer\b/.test(lowerTitle)) return "Lead"
  // Marketing: Marketing Manager, Brand Manager, Growth Manager
  if (/\b(?:marketing|brand|growth|content|digital|social\s+media|communications|pr)\s+manager\b/.test(lowerTitle)) return "Lead"
  // Sales: Sales Manager, Account Manager (senior), Territory Manager
  if (/\b(?:sales|territory|channel|partnership)\s+manager\b/.test(lowerTitle)) return "Lead"
  // Customer: Customer Success Manager, Support Manager
  if (/\b(?:customer\s+success|support|service|success)\s+manager\b/.test(lowerTitle)) return "Lead"
  // Legal: Senior Associate (law firms)
  if (/\bsenior\s+associate\b/.test(lowerTitle) && /\battorney|\blawyer|\blegal|\blaw\b/.test(lowerTitle)) return "Lead"

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. SENIOR
  // ═══════════════════════════════════════════════════════════════════════════
  // Explicit "Senior" or "Sr." prefix
  if (/\bsenior\b|\bsr\.?\s/.test(lowerTitle)) return "Senior Level"
  // Legal: Counsel, Of Counsel (not General Counsel — that's C-level)
  if (/\b(?:of\s+)?counsel\b/.test(lowerTitle) && !/\bgeneral\s+counsel\b|\bjunior\b|\bassociate\b/.test(lowerTitle)) return "Senior Level"
  // Academia: Assistant Professor (tenure-track, mid-career)
  if (/\bassistant\s+professor\b/.test(lowerTitle)) return "Senior Level"
  // Academia: Lecturer (senior academic role in many systems)
  if (/\bsenior\s+lecturer\b/.test(lowerTitle)) return "Senior Level"
  // Medical: Specialist, Consultant (UK/AU medical = senior doctor)
  if (/\bconsultant\s+(?:physician|surgeon|doctor|psychiatrist|radiologist|anaesthetist|anesthetist|pathologist|cardiologist|neurologist|oncologist|dermatologist|urologist|ophthalmologist|gastroenterologist)\b/.test(lowerTitle)) return "Senior Level"
  if (/\bspecialist\s+(?:physician|surgeon|doctor)\b/.test(lowerTitle)) return "Senior Level"
  // Nursing: Clinical Nurse Specialist, Nurse Practitioner
  if (/\bclinical\s+nurse\s+specialist\b|\bnurse\s+practitioner\b|\badvanced\s+practice\b/.test(lowerTitle)) return "Senior Level"
  // Pharmacy: Clinical Pharmacist, Senior Pharmacist
  if (/\bclinical\s+pharmacist\b|\bsenior\s+pharmacist\b/.test(lowerTitle)) return "Senior Level"
  // Engineering: Solutions Architect, Enterprise Architect (without principal/staff)
  if (/\b(?:solutions?|enterprise|cloud|security|data|systems?)\s+architect\b/.test(lowerTitle) && !/\bprincipal\b|\bstaff\b|\bchief\b|\bjunior\b|\bassociate\b/.test(lowerTitle)) return "Senior Level"
  // Consulting: Senior Consultant, Senior Associate (consulting firms)
  if (/\bsenior\s+(?:consultant|associate|advisor|specialist|strategist)\b/.test(lowerTitle)) return "Senior Level"
  // Finance: Senior Analyst, Senior Accountant, Senior Auditor
  if (/\bsenior\s+(?:analyst|accountant|auditor|underwriter|actuary|trader|advisor|planner|examiner)\b/.test(lowerTitle)) return "Senior Level"
  // Creative: Senior Designer, Senior Writer, Senior Editor, Senior Producer
  if (/\bsenior\s+(?:designer|writer|editor|producer|copywriter|art\s+director|creative|animator|illustrator|photographer|videographer)\b/.test(lowerTitle)) return "Senior Level"
  // HR: Senior Recruiter, Senior HR Business Partner, Senior HRBP
  if (/\bsenior\s+(?:recruiter|hr|hrbp|talent|people)\b/.test(lowerTitle)) return "Senior Level"
  // Sales: Senior Account Executive, Senior Sales Rep
  if (/\bsenior\s+(?:account\s+executive|sales|ae|business\s+development)\b/.test(lowerTitle)) return "Senior Level"
  // Marketing: Senior Marketing, Senior Content, Senior Growth
  if (/\bsenior\s+(?:marketing|content|growth|brand|digital|seo|product\s+marketing)\b/.test(lowerTitle)) return "Senior Level"
  // Operations: Senior Operations, Senior Supply Chain, Senior Logistics
  if (/\bsenior\s+(?:operations|supply\s+chain|logistics|procurement|buyer|planner)\b/.test(lowerTitle)) return "Senior Level"
  // Education: Senior Teacher, Master Teacher, Senior Instructor
  if (/\bsenior\s+(?:teacher|instructor|trainer|facilitator|lecturer)\b|\bmaster\s+teacher\b/.test(lowerTitle)) return "Senior Level"
  // Trades: Master Electrician, Master Plumber, Master Carpenter, Journeyman
  if (/\bmaster\s+(?:electrician|plumber|carpenter|mechanic|technician|welder)\b|\bjourneyman\b/.test(lowerTitle)) return "Senior Level"
  // Hospitality: Sous Chef, Senior Cook
  if (/\bsous\s+chef\b|\bsenior\s+cook\b/.test(lowerTitle)) return "Senior Level"
  // Real Estate: Senior Agent, Senior Broker, Managing Broker
  if (/\bsenior\s+(?:agent|broker|appraiser|loan\s+officer)\b|\bmanaging\s+broker\b/.test(lowerTitle)) return "Senior Level"
  // Insurance: Senior Underwriter, Senior Claims, Senior Adjuster
  if (/\bsenior\s+(?:underwriter|claims|adjuster|actuary)\b/.test(lowerTitle)) return "Senior Level"
  // Government: Senior Policy, Senior Advisor, Senior Analyst
  if (/\bsenior\s+(?:policy|advisor|counsel|analyst|investigator|officer|specialist|planner|economist)\b/.test(lowerTitle)) return "Senior Level"
  // Research: Senior Researcher, Senior Scientist, Research Scientist (without junior/associate)
  if (/\bsenior\s+(?:researcher|scientist|research)\b/.test(lowerTitle)) return "Senior Level"
  if (/\bresearch\s+scientist\b/.test(lowerTitle) && !/\bjunior\b|\bassociate\b|\bintern\b/.test(lowerTitle)) return "Senior Level"

  // ─── 7. Numbered levels: SDE-3, Engineer III, L5, IC5 = Senior ───
  // Must check BEFORE entry-level numbered patterns
  const numberedLevel = extractNumberedLevel(lowerTitle)
  if (numberedLevel) return numberedLevel

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. MIDDLE LEVEL (Junior, Mid, domain-specific mid-career)
  // ═══════════════════════════════════════════════════════════════════════════
  // Explicit Junior / Jr. prefix
  if (/\bjunior\b|\bjr\.?\s/.test(lowerTitle) && !/\bsenior\b/.test(lowerTitle)) return "Middle Level"
  // Explicit Mid-Level
  if (/\bmid[\s-]?level\b|\bmid[\s-]?career\b/.test(lowerTitle)) return "Middle Level"

  // ─── Legal ───
  if (/\bassociate\s+(?:attorney|lawyer|solicitor|barrister|counsel)\b/.test(lowerTitle)) return "Middle Level"
  if (/\bjunior\s+(?:attorney|lawyer|solicitor|barrister|counsel|associate|partner)\b/.test(lowerTitle)) return "Middle Level"

  // ─── Medical ───
  // Fellow (medical, post-residency — NOT tech fellow)
  if (/\bfellow\b/.test(lowerTitle) && /\bmedic|\bclinical|\bsurg|\bphysician|\bcardio|\bneuro|\bonco|\bgastro|\bpulmon|\bnephro|\bhemato|\brheumat|\bendocrin|\bgeriatr|\bpediatr|\bpsychiatr|\borthop|\bophthalm|\bdermat|\burol|\bpath|\bradiol|\banesthes|\bintensive|\bicu|\ber\b|\bemergency/.test(lowerTitle)) return "Middle Level"
  // Physician Assistant, PA-C
  if (/\bphysician\s+assistant\b|\bpa[\s-]c\b/.test(lowerTitle)) return "Middle Level"
  // Registered Nurse (RN) without senior/lead/manager
  if (/\bregistered\s+nurse\b|\b(?:rn)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanager\b|\bcharge\b|\bsupervisor\b|\bdirector\b|\bchief\b/.test(lowerTitle)) return "Middle Level"
  // Licensed Practical Nurse, LPN, LVN
  if (/\blicensed\s+(?:practical|vocational)\s+nurse\b|\blpn\b|\blvn\b/.test(lowerTitle)) return "Middle Level"
  // Occupational Therapist, Physical Therapist, Speech Therapist (licensed, not assistant)
  if (/\b(?:occupational|physical|speech|respiratory|radiation)\s+therapist\b/.test(lowerTitle) && !/\bassistant\b|\baide\b|\bintern\b|\bstudent\b/.test(lowerTitle)) return "Middle Level"
  // Pharmacist (not senior/lead/clinical)
  if (/\bpharmacist\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bclinical\b|\bmanager\b|\bdirector\b|\bchief\b/.test(lowerTitle)) return "Middle Level"
  // Dentist, Optometrist, Chiropractor, Podiatrist
  if (/\bdentist\b|\boptometrist\b|\bchiropractor\b|\bpodiatrist\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bchief\b|\bdirector\b/.test(lowerTitle)) return "Middle Level"
  // Veterinarian
  if (/\bveterinarian\b|\bvet\s+(?:tech|doctor)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bchief\b/.test(lowerTitle)) return "Middle Level"

  // ─── Finance / Banking / Consulting ───
  // "Associate" at banks/consulting (not "Associate Engineer" etc.)
  if (/^associate\b/.test(lowerTitle) && !/\bengineer|\bdevelop|\bdesign|\bmanag|\bdirect|\bsoftware|\bdata|\bproduct|\bux|\bui|\bqa|\bdevops|\bcloud|\bsecurity|\bsystems|\bnetwork|\btechnical/.test(lowerTitle)) return "Middle Level"
  // Consultant (standalone, not senior/principal/managing)
  if (/\bconsultant\b/.test(lowerTitle) && !/\bsenior\b|\bprincipal\b|\bmanaging\b|\blead\b|\bstaff\b|\bchief\b|\bdirector\b/.test(lowerTitle) && !/\bnurse\b|\bphysician\b|\bdoctor\b|\bsurgeon\b/.test(lowerTitle)) return "Middle Level"
  // Financial Advisor/Planner (not senior)
  if (/\bfinancial\s+(?:advisor|planner|consultant)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b|\bdirect\b/.test(lowerTitle)) return "Middle Level"
  // Loan Officer, Mortgage Officer, Credit Analyst
  if (/\b(?:loan|mortgage)\s+officer\b|\bcredit\s+analyst\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b/.test(lowerTitle)) return "Middle Level"
  // Underwriter, Actuary (not senior)
  if (/\bunderwriter\b|\bactuary\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bchief\b|\bmanag\b/.test(lowerTitle)) return "Middle Level"
  // Tax Accountant, Staff Accountant, CPA
  if (/\b(?:tax|staff|cost)\s+accountant\b|\bcpa\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b|\bdirect\b/.test(lowerTitle)) return "Middle Level"

  // ─── Engineering / Tech (mid-level without explicit keyword) ───
  // "Software Engineer" / "Developer" / "Data Engineer" etc. with NO level qualifier
  // These are ambiguous — we return null and let years-based extraction handle it
  // BUT: specific mid-level signals like "Engineer 2", "SDE-2" are caught by numbered patterns above

  // ─── Sales ───
  // Account Executive (not senior/lead)
  if (/\baccount\s+executive\b|\b(?:ae)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b|\bdirect\b|\bvp\b|\benterprise\b/.test(lowerTitle)) return "Middle Level"
  // Account Manager (not senior/lead — individual contributor)
  if (/\baccount\s+manager\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bdirect\b|\bvp\b|\bregional\b|\bnational\b|\bglobal\b/.test(lowerTitle)) return "Middle Level"
  // Inside Sales Rep, Outside Sales Rep, Sales Representative
  if (/\b(?:inside|outside)?\s*sales\s+(?:rep(?:resentative)?|exec(?:utive)?)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b|\bdirect\b/.test(lowerTitle)) return "Middle Level"
  // Solutions Engineer, Sales Engineer, Pre-Sales (not senior)
  if (/\b(?:solutions?|sales|pre[\s-]?sales)\s+engineer\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bprincipal\b|\bstaff\b/.test(lowerTitle)) return "Middle Level"
  // Customer Success Manager (individual contributor, not lead/director)
  if (/\bcustomer\s+success\s+manager\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bdirect\b|\bvp\b|\bhead\b/.test(lowerTitle)) return "Middle Level"

  // ─── Marketing ───
  // Marketing Manager (standalone, not senior/director)
  if (/\bmarketing\s+(?:specialist|coordinator|executive|associate)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b|\bdirect\b/.test(lowerTitle)) return "Middle Level"
  // Content Writer, Copywriter, Social Media Manager (not senior)
  if (/\b(?:content\s+writer|copywriter|social\s+media\s+(?:specialist|coordinator|executive))\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b|\bdirect\b/.test(lowerTitle)) return "Middle Level"
  // SEO Specialist, SEM Specialist, Growth Marketer
  if (/\b(?:seo|sem|growth|digital|email|performance)\s+(?:specialist|marketer|analyst|executive)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b|\bdirect\b/.test(lowerTitle)) return "Middle Level"

  // ─── Design / Creative ───
  // Designer, UX Designer, UI Designer, Product Designer (not senior/lead/principal)
  if (/\b(?:ux|ui|product|visual|graphic|interaction|motion|web)\s+designer\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bprincipal\b|\bstaff\b|\bmanag\b|\bdirect\b/.test(lowerTitle)) return "Middle Level"
  // UX Researcher (not senior)
  if (/\bux\s+researcher\b|\buser\s+researcher\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bprincipal\b|\bstaff\b/.test(lowerTitle)) return "Middle Level"

  // ─── HR / People ───
  // Recruiter, Talent Acquisition Specialist (not senior/lead)
  if (/\brecruiter\b|\btalent\s+acquisition\s+(?:specialist|coordinator|partner)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b|\bdirect\b|\bhead\b|\bprincipal\b/.test(lowerTitle)) return "Middle Level"
  // HR Business Partner, HRBP (not senior)
  if (/\bhr\s+business\s+partner\b|\bhrbp\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bdirect\b|\bhead\b/.test(lowerTitle)) return "Middle Level"
  // HR Generalist, HR Specialist, HR Coordinator
  if (/\bhr\s+(?:generalist|specialist|coordinator|administrator)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b|\bdirect\b/.test(lowerTitle)) return "Middle Level"

  // ─── Education ───
  // Teacher (not senior/lead/master/head)
  if (/\bteacher\b|\binstructor\b|\blecturer\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmaster\b|\bhead\b|\bprincipal\b|\bdirect\b|\bassistant\s+professor\b|\bassociate\s+professor\b/.test(lowerTitle)) return "Middle Level"
  // School Counselor, Guidance Counselor
  if (/\b(?:school|guidance)\s+counselor\b/.test(lowerTitle)) return "Middle Level"
  // Librarian (not senior/head)
  if (/\blibrarian\b/.test(lowerTitle) && !/\bsenior\b|\bhead\b|\blead\b|\bdirect\b/.test(lowerTitle)) return "Middle Level"

  // ─── Trades / Manufacturing ───
  // Electrician, Plumber, Carpenter, HVAC Tech, Mechanic (licensed, not master/lead)
  if (/\b(?:electrician|plumber|carpenter|hvac|mechanic|welder|machinist|millwright|pipefitter|ironworker|boilermaker|glazier|roofer|painter|drywall|mason|bricklayer|tiler|flooring)\b/.test(lowerTitle) && !/\bmaster\b|\blead\b|\bsenior\b|\bforeman\b|\bsupervisor\b|\bmanag\b|\bapprentice\b|\bhelper\b|\bintern\b/.test(lowerTitle)) return "Middle Level"
  // CNC Operator, Machine Operator (not lead/senior)
  if (/\b(?:cnc|machine|equipment|press|lathe|mill)\s+operator\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b/.test(lowerTitle)) return "Middle Level"

  // ─── Hospitality / Food Service ───
  // Cook, Line Cook, Prep Cook (not sous/executive/head chef)
  if (/\b(?:line\s+)?cook\b|\bprep\s+cook\b/.test(lowerTitle) && !/\bsenior\b|\bhead\b|\bexecutive\b|\bsous\b|\bchef\b/.test(lowerTitle)) return "Middle Level"
  // Chef (not sous/executive/head)
  if (/\bchef\b/.test(lowerTitle) && !/\bsous\b|\bexecutive\b|\bhead\b|\bpastry\s+chef\b|\bsenior\b/.test(lowerTitle)) return "Middle Level"
  // Hotel: Front Desk Agent, Concierge, Housekeeping Supervisor
  if (/\bconcierge\b|\bhousekeeping\s+supervisor\b/.test(lowerTitle)) return "Middle Level"

  // ─── Real Estate ───
  // Real Estate Agent, Broker (not senior/managing)
  if (/\breal\s+estate\s+(?:agent|broker|associate)\b/.test(lowerTitle) && !/\bsenior\b|\bmanaging\b|\blead\b|\bdirect\b/.test(lowerTitle)) return "Middle Level"
  // Property Manager (not senior/regional)
  if (/\bproperty\s+manager\b/.test(lowerTitle) && !/\bsenior\b|\bregional\b|\bdirect\b/.test(lowerTitle)) return "Middle Level"

  // ─── Government / Public Sector ───
  // Policy Analyst, Program Analyst, Budget Analyst (not senior)
  if (/\b(?:policy|program|budget|management|intelligence|research)\s+analyst\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bprincipal\b|\bchief\b|\bdirect\b/.test(lowerTitle)) return "Middle Level"
  // Case Manager, Social Worker, Probation Officer
  if (/\bcase\s+manager\b|\bsocial\s+worker\b|\bprobation\s+officer\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bsupervisor\b|\bdirect\b/.test(lowerTitle)) return "Middle Level"

  // ─── Logistics / Supply Chain ───
  // Supply Chain Analyst, Logistics Coordinator, Procurement Specialist
  if (/\b(?:supply\s+chain|logistics|procurement|inventory|demand|planning)\s+(?:analyst|coordinator|specialist|planner)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b|\bdirect\b/.test(lowerTitle)) return "Middle Level"

  // ─── Customer Support ───
  // Customer Support Specialist, Technical Support Engineer (not senior/lead)
  if (/\b(?:customer|technical|it)\s+support\s+(?:specialist|engineer|representative|analyst)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b|\bdirect\b/.test(lowerTitle)) return "Middle Level"
  // Help Desk Analyst/Technician (not senior)
  if (/\bhelp\s+desk\s+(?:analyst|technician|specialist|engineer)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b/.test(lowerTitle)) return "Middle Level"

  // ─── Data / Analytics ───
  // Data Analyst, Business Analyst, BI Analyst (not senior/lead)
  if (/\b(?:data|business|bi|business\s+intelligence|reporting|analytics)\s+analyst\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bprincipal\b|\bstaff\b|\bmanag\b|\bdirect\b/.test(lowerTitle)) return "Middle Level"

  // ─── Project / Program ───
  // Project Manager, Program Manager (not senior/lead/director)
  if (/\b(?:project|program)\s+manager\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bdirect\b|\bvp\b|\bhead\b|\bprincipal\b/.test(lowerTitle)) return "Middle Level"
  // Project Coordinator, Program Coordinator
  if (/\b(?:project|program)\s+coordinator\b/.test(lowerTitle) && !/\bsenior\b|\blead\b/.test(lowerTitle)) return "Middle Level"

  // ─── Product ───
  // Product Manager (not senior/lead/director/vp/head/principal/group)
  if (/\bproduct\s+manager\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bdirect\b|\bvp\b|\bhead\b|\bprincipal\b|\bgroup\b|\bstaff\b/.test(lowerTitle)) return "Middle Level"
  // Product Owner (not senior)
  if (/\bproduct\s+owner\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bprincipal\b/.test(lowerTitle)) return "Middle Level"

  // ─── Security ───
  // Security Analyst, Security Engineer, SOC Analyst (not senior/lead)
  if (/\b(?:security|soc|cyber|infosec|information\s+security)\s+(?:analyst|engineer|specialist|consultant|architect)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bprincipal\b|\bstaff\b|\bmanag\b|\bdirect\b|\bchief\b/.test(lowerTitle)) return "Middle Level"

  // ─── DevOps / SRE / Cloud ───
  // DevOps Engineer, SRE, Cloud Engineer, Platform Engineer (not senior/lead/staff)
  if (/\b(?:devops|sre|site\s+reliability|cloud|platform|infrastructure|release)\s+engineer\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bprincipal\b|\bstaff\b|\bmanag\b|\bdirect\b/.test(lowerTitle)) return "Middle Level"

  // ─── QA / Testing ───
  // QA Engineer, Test Engineer, SDET, QA Analyst (not senior/lead)
  if (/\b(?:qa|quality|test|sdet|automation\s+test|performance\s+test)\s+(?:engineer|analyst|specialist|lead)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bprincipal\b|\bstaff\b|\bmanag\b|\bdirect\b/.test(lowerTitle)) return "Middle Level"

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. ENTRY LEVEL
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Generic entry-level signals ───
  if (/\bentry[\s-]?level\b/.test(lowerTitle)) return "Entry Level"
  if (/\bnew\s+grad(?:uate)?\b/.test(lowerTitle)) return "Entry Level"
  if (/\bgraduate\s+(?:program|role|position|engineer|developer|analyst|hire|trainee|scheme|rotation)\b/.test(lowerTitle)) return "Entry Level"
  if (/\brecent\s+grad(?:uate)?\b/.test(lowerTitle)) return "Entry Level"
  if (/\btrainee\b/.test(lowerTitle)) return "Entry Level"
  if (/\brotational\b|\brotation\s+(?:program|analyst|engineer|associate)\b/.test(lowerTitle)) return "Entry Level"
  if (/\bdevelopment\s+program\b|\bleadership\s+(?:development|rotation)\s+program\b/.test(lowerTitle)) return "Entry Level"
  if (/\bearly\s+career\b|\bearly\s+talent\b|\bemerging\s+talent\b/.test(lowerTitle)) return "Entry Level"
  if (/\bfreshers?\b|\bfresh\s+graduate\b/.test(lowerTitle)) return "Entry Level"
  // Campus hire, University hire
  if (/\bcampus\s+(?:hire|recruit|analyst|engineer|associate)\b|\buniversity\s+(?:hire|recruit|grad)\b/.test(lowerTitle)) return "Entry Level"
  // Cadet (aviation, military, police)
  if (/\bcadet\b/.test(lowerTitle)) return "Entry Level"
  // Probationary (government)
  if (/\bprobationary\b/.test(lowerTitle)) return "Entry Level"

  // ─── "Associate" prefix for tech/product/data roles = entry level ───
  if (/\bassociate\s+(?:software|engineer|developer|programmer|product|data|design|ux|ui|qa|devops|cloud|security|systems|network|it\b|technical|solutions|platform|infrastructure|mobile|frontend|backend|fullstack|full[\s-]?stack)/.test(lowerTitle)) return "Entry Level"
  // Associate Consultant, Associate Analyst (tech context)
  if (/\bassociate\s+(?:consultant|analyst)\b/.test(lowerTitle) && /\btechn|\bsoftware|\bdata|\bit\b|\bdigital|\bcloud|\bcyber/.test(lowerTitle)) return "Entry Level"

  // ─── Sales entry-level ───
  // SDR, BDR (Sales/Business Development Representative)
  if (/\b(?:sales|business)\s+development\s+rep(?:resentative)?\b/.test(lowerTitle)) return "Entry Level"
  if (/\bsdr\b|\bbdr\b/.test(lowerTitle)) return "Entry Level"
  // Market Development Rep, Lead Development Rep
  if (/\b(?:market|lead)\s+development\s+rep(?:resentative)?\b|\bmdr\b|\bldr\b/.test(lowerTitle)) return "Entry Level"
  // Sales Associate, Retail Sales Associate
  if (/\b(?:sales|retail)\s+associate\b/.test(lowerTitle)) return "Entry Level"
  // Sales Trainee, Sales Cadet
  if (/\bsales\s+(?:trainee|cadet|intern)\b/.test(lowerTitle)) return "Entry Level"

  // ─── Finance / Banking / Accounting entry-level ───
  // Analyst at investment banks / consulting (entry-level role)
  if (/\banalyst\b/.test(lowerTitle) && !/\bsenior\b|\bstaff\b|\blead\b|\bprincipal\b|\bmanag\b|\bdirect\b|\bvp\b/.test(lowerTitle) && /\binvestment|\bbank|\bconsult|\bfinancial|\bfp&a|\bcredit|\brisk|\bequity|\bfixed\s+income|\bm&a|\bmerger|\bvaluation|\bprivate\s+equity|\bventure|\bhedge|\basset|\bwealth|\btreasury/.test(lowerTitle)) return "Entry Level"
  // Junior Accountant, Junior Auditor, Accounting Clerk
  if (/\bjunior\s+(?:accountant|auditor|analyst|bookkeeper)\b|\baccounting\s+clerk\b|\bbookkeeper\b/.test(lowerTitle)) return "Entry Level"
  // Accounts Payable/Receivable Clerk, Billing Clerk
  if (/\b(?:accounts?\s+(?:payable|receivable)|billing|payroll)\s+(?:clerk|specialist|coordinator|associate)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b/.test(lowerTitle)) return "Entry Level"
  // Bank Teller, Personal Banker
  if (/\bbank\s+teller\b|\bpersonal\s+banker\b|\bteller\b/.test(lowerTitle)) return "Entry Level"
  // Financial Analyst (generic, entry at most companies — not senior)
  if (/\bfinancial\s+analyst\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bprincipal\b|\bmanag\b|\bdirect\b/.test(lowerTitle)) return "Entry Level"

  // ─── Legal entry-level ───
  if (/\barticling\b|\barticled\s+clerk\b/.test(lowerTitle)) return "Entry Level"
  if (/\blaw\s+clerk\b|\blegal\s+clerk\b|\bcourt\s+clerk\b/.test(lowerTitle)) return "Entry Level"
  if (/\bparalegal\b|\blegal\s+assistant\b|\blegal\s+secretary\b/.test(lowerTitle)) return "Entry Level"
  if (/\blegal\s+(?:intern|trainee|fellow|extern|aide|runner)\b/.test(lowerTitle)) return "Entry Level"
  // Pupil Barrister (UK), Trainee Solicitor (UK)
  if (/\bpupil\s+barrister\b|\btrainee\s+solicitor\b|\bpupillage\b/.test(lowerTitle)) return "Entry Level"
  // Legal Analyst, Compliance Analyst (entry-level)
  if (/\b(?:legal|compliance|regulatory)\s+(?:analyst|coordinator|specialist|associate)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b|\bdirect\b/.test(lowerTitle)) return "Entry Level"

  // ─── Medical / Healthcare entry-level ───
  // Resident (medical)
  if (/\bresident\b/.test(lowerTitle) && /\bmedic|\bclinical|\bsurg|\bphysician|\bhospital|\bpsychiatr|\bpediatr|\binternal|\bfamily|\bemergency|\borthop|\bpath|\bradiol|\banesthes|\bneuro|\bobstetric|\bgynec|\bdermat|\burol|\bophthalm/.test(lowerTitle)) return "Entry Level"
  // Medical Assistant, Clinical Assistant, Dental Assistant
  if (/\b(?:medical|clinical|dental|surgical|veterinary|pharmacy|laboratory|lab|radiology|physical\s+therapy|occupational\s+therapy)\s+assistant\b/.test(lowerTitle)) return "Entry Level"
  // Nursing Assistant, CNA, Patient Care Technician
  if (/\bnursing\s+assistant\b|\bcna\b|\bcertified\s+nursing\s+assistant\b|\bpatient\s+care\s+(?:technician|tech|associate|assistant)\b/.test(lowerTitle)) return "Entry Level"
  // Phlebotomist, Medical Scribe, Medical Coder, Medical Biller
  if (/\bphlebotomist\b|\bmedical\s+scribe\b|\bmedical\s+(?:coder|biller|transcriptionist)\b/.test(lowerTitle)) return "Entry Level"
  // EMT, Paramedic (entry-level emergency)
  if (/\bemt\b|\bemergency\s+medical\s+technician\b/.test(lowerTitle)) return "Entry Level"
  // Home Health Aide, Caregiver, Personal Care Aide
  if (/\bhome\s+health\s+aide\b|\bcaregiver\b|\bpersonal\s+care\s+(?:aide|assistant)\b|\bcare\s+(?:aide|assistant|worker)\b/.test(lowerTitle)) return "Entry Level"
  // Dietary Aide, Food Service Worker (hospital)
  if (/\bdietary\s+(?:aide|assistant|clerk)\b/.test(lowerTitle)) return "Entry Level"
  // Vet Tech, Veterinary Assistant/Technician
  if (/\bvet(?:erinary)?\s+(?:tech(?:nician)?|assistant)\b/.test(lowerTitle)) return "Entry Level"
  // Pharmacy Technician
  if (/\bpharmacy\s+tech(?:nician)?\b/.test(lowerTitle)) return "Entry Level"
  // Lab Technician, Lab Assistant
  if (/\blab(?:oratory)?\s+(?:tech(?:nician)?|assistant|aide)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b/.test(lowerTitle)) return "Entry Level"
  // Sterile Processing Technician, Surgical Technician
  if (/\b(?:sterile\s+processing|surgical|operating\s+room)\s+tech(?:nician)?\b/.test(lowerTitle)) return "Entry Level"

  // ─── Research / Academia entry-level ───
  if (/\bresearch\s+assistant\b|\bteaching\s+assistant\b|\blab\s+assistant\b/.test(lowerTitle)) return "Entry Level"
  if (/\bpostdoc(?:toral)?\s+(?:researcher|fellow|scholar|associate)?\b/.test(lowerTitle)) return "Entry Level"
  if (/\bresearch\s+(?:intern|trainee|fellow|associate|aide|coordinator|technician)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bprincipal\b/.test(lowerTitle)) return "Entry Level"
  // Graduate Research Assistant, Graduate Teaching Assistant
  if (/\bgraduate\s+(?:research|teaching)\s+assistant\b|\bgra\b|\bgta\b/.test(lowerTitle)) return "Entry Level"
  // Adjunct Professor/Instructor/Lecturer (part-time, entry academic)
  if (/\badjunct\s+(?:professor|instructor|lecturer|faculty)\b/.test(lowerTitle)) return "Entry Level"

  // ─── Education entry-level ───
  // Student Teacher, Substitute Teacher, Teacher's Aide
  if (/\bstudent\s+teacher\b|\bsubstitute\s+teacher\b|\bteacher(?:'?s)?\s+(?:aide|assistant)\b/.test(lowerTitle)) return "Entry Level"
  // Paraprofessional, Instructional Aide
  if (/\bparaprofessional\b|\binstructional\s+(?:aide|assistant)\b/.test(lowerTitle)) return "Entry Level"
  // Tutor (not senior)
  if (/\btutor\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bhead\b/.test(lowerTitle)) return "Entry Level"
  // After-School Coordinator, Camp Counselor
  if (/\bafter[\s-]?school\s+(?:coordinator|counselor|teacher)\b|\bcamp\s+counselor\b/.test(lowerTitle)) return "Entry Level"
  // Teaching Fellow (not professor)
  if (/\bteaching\s+fellow\b/.test(lowerTitle)) return "Entry Level"

  // ─── Trades / Manufacturing / Construction entry-level ───
  // Apprentice (already caught in Internship section)
  // Helper, Laborer, General Laborer
  if (/\bhelper\b|\blabor(?:er)?\b|\bgeneral\s+labor(?:er)?\b/.test(lowerTitle)) return "Entry Level"
  // Entry-level trade roles
  if (/\b(?:apprentice|trainee|junior)\s+(?:electrician|plumber|carpenter|mechanic|welder|machinist|hvac|technician|painter|roofer)\b/.test(lowerTitle)) return "Entry Level"
  // Assembler, Packer, Picker, Warehouse Associate
  if (/\bassembler\b|\bpacker\b|\bpicker\b|\bwarehouse\s+(?:associate|worker|clerk|helper|operative)\b/.test(lowerTitle)) return "Entry Level"
  // Forklift Operator, Material Handler
  if (/\bforklift\s+operator\b|\bmaterial\s+handler\b|\bstock\s+(?:clerk|associate|handler)\b/.test(lowerTitle)) return "Entry Level"
  // Production Worker, Production Associate, Line Worker
  if (/\b(?:production|assembly|line|factory)\s+(?:worker|associate|operator|hand)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b|\bsupervisor\b/.test(lowerTitle)) return "Entry Level"
  // Quality Inspector (entry-level, not senior/lead)
  if (/\bquality\s+(?:inspector|checker|control\s+inspector)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b/.test(lowerTitle)) return "Entry Level"
  // Maintenance Helper, Maintenance Trainee
  if (/\bmaintenance\s+(?:helper|trainee|apprentice|assistant)\b/.test(lowerTitle)) return "Entry Level"
  // Janitor, Custodian, Groundskeeper
  if (/\bjanitor\b|\bcustodian\b|\bgroundskeeper\b|\bhousekeeper\b/.test(lowerTitle)) return "Entry Level"

  // ─── Hospitality / Food Service / Retail entry-level ───
  // Barista, Cashier, Host/Hostess, Busser, Dishwasher, Food Runner
  if (/\bbarista\b|\bcashier\b|\bhost(?:ess)?\b|\bbusser\b|\bdishwasher\b|\bfood\s+runner\b/.test(lowerTitle)) return "Entry Level"
  // Server, Waiter, Waitress, Bartender (not head/lead)
  if (/\bserver\b|\bwaiter\b|\bwaitress\b|\bbartender\b/.test(lowerTitle) && !/\bhead\b|\blead\b|\bsenior\b|\bmanag\b/.test(lowerTitle)) return "Entry Level"
  // Prep Cook, Kitchen Helper
  if (/\bprep\s+cook\b|\bkitchen\s+(?:helper|assistant|porter|hand)\b/.test(lowerTitle)) return "Entry Level"
  // Front Desk Agent/Clerk, Bellhop, Valet, Room Attendant
  if (/\bfront\s+desk\s+(?:agent|clerk|associate|receptionist)\b|\bbellhop\b|\bvalet\b|\broom\s+attendant\b/.test(lowerTitle)) return "Entry Level"
  // Retail Associate, Sales Clerk, Store Associate, Merchandiser
  if (/\bretail\s+(?:associate|clerk|specialist|team\s+member)\b|\bsales\s+clerk\b|\bstore\s+(?:associate|clerk|team\s+member)\b|\bmerchandiser\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b/.test(lowerTitle)) return "Entry Level"
  // Stocker, Shelf Stacker
  if (/\bstocker\b|\bshelf\s+stacker\b|\bstock\s+(?:associate|clerk)\b/.test(lowerTitle)) return "Entry Level"

  // ─── Government / Public Sector entry-level ───
  // Clerk (government), Administrative Clerk, File Clerk, Records Clerk
  if (/\b(?:administrative|file|records|data\s+entry|mail|office)\s+clerk\b/.test(lowerTitle)) return "Entry Level"
  // Page (legislative), Staff Assistant (congressional)
  if (/\blegislative\s+(?:page|aide|assistant|correspondent)\b|\bstaff\s+assistant\b|\bcongressional\s+(?:aide|assistant)\b/.test(lowerTitle)) return "Entry Level"
  // Peace Corps Volunteer, AmeriCorps Member
  if (/\bpeace\s+corps\b|\bameri\s*corps\b|\bvista\s+(?:member|volunteer)\b/.test(lowerTitle)) return "Entry Level"
  // Police Officer (entry), Firefighter (entry), Corrections Officer
  if (/\b(?:police|patrol)\s+officer\b|\bfirefighter\b|\bcorrections?\s+officer\b|\bdeputy\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bsergeant\b|\blieutenant\b|\bcaptain\b|\bchief\b|\bdetective\b/.test(lowerTitle)) return "Entry Level"
  // 911 Dispatcher, Emergency Dispatcher
  if (/\b(?:911|emergency)\s+dispatcher\b|\bdispatcher\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bsupervisor\b/.test(lowerTitle)) return "Entry Level"

  // ─── IT / Tech Support entry-level ───
  // Help Desk, Service Desk, Desktop Support
  if (/\b(?:help|service)\s+desk\s+(?:analyst|technician|specialist|engineer|associate|agent|rep)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b/.test(lowerTitle)) return "Entry Level"
  if (/\bdesktop\s+support\s+(?:technician|specialist|engineer|analyst)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b/.test(lowerTitle)) return "Entry Level"
  // IT Support Specialist/Technician, IT Helpdesk
  if (/\bit\s+(?:support|helpdesk|help\s+desk)\s+(?:specialist|technician|analyst|associate|engineer)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b/.test(lowerTitle)) return "Entry Level"
  // IT Technician, Field Technician, Network Technician, Systems Technician
  if (/\b(?:it|field|network|systems?|hardware|computer|desktop)\s+technician\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b/.test(lowerTitle)) return "Entry Level"
  // NOC Technician, Data Center Technician
  if (/\b(?:noc|data\s+center|server\s+room)\s+(?:technician|operator|engineer)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b/.test(lowerTitle)) return "Entry Level"
  // Geek Squad Agent, IT Specialist (generic entry)
  if (/\bit\s+specialist\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b|\bdirect\b/.test(lowerTitle)) return "Entry Level"

  // ─── Marketing / Communications entry-level ───
  // Marketing Assistant, Marketing Coordinator, Marketing Associate
  if (/\bmarketing\s+(?:assistant|coordinator|associate|trainee)\b/.test(lowerTitle)) return "Entry Level"
  // Social Media Assistant/Coordinator, Content Coordinator
  if (/\b(?:social\s+media|content|digital|communications?|pr|public\s+relations)\s+(?:assistant|coordinator|associate|trainee)\b/.test(lowerTitle)) return "Entry Level"
  // Community Manager (entry-level, not senior)
  if (/\bcommunity\s+(?:manager|coordinator|associate|specialist)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bdirect\b|\bhead\b/.test(lowerTitle)) return "Entry Level"
  // Event Coordinator, Event Assistant, Event Planner (entry)
  if (/\bevent\s+(?:coordinator|assistant|planner|associate)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b|\bdirect\b/.test(lowerTitle)) return "Entry Level"
  // Media Buyer (entry), Advertising Coordinator
  if (/\b(?:media\s+buyer|advertising\s+(?:coordinator|assistant|associate))\b/.test(lowerTitle) && !/\bsenior\b|\blead\b/.test(lowerTitle)) return "Entry Level"

  // ─── HR / People entry-level ───
  // HR Assistant, HR Coordinator, HR Associate, HR Administrator
  if (/\bhr\s+(?:assistant|coordinator|associate|administrator|trainee|clerk)\b/.test(lowerTitle)) return "Entry Level"
  // Recruiting Coordinator, Talent Coordinator, Sourcer
  if (/\b(?:recruiting|talent|staffing)\s+(?:coordinator|assistant|associate)\b|\bsourcer\b/.test(lowerTitle) && !/\bsenior\b|\blead\b/.test(lowerTitle)) return "Entry Level"
  // Payroll Clerk, Payroll Coordinator, Benefits Coordinator
  if (/\b(?:payroll|benefits|compensation)\s+(?:clerk|coordinator|assistant|associate|administrator)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b/.test(lowerTitle)) return "Entry Level"
  // Onboarding Specialist/Coordinator
  if (/\bonboarding\s+(?:specialist|coordinator|associate)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b/.test(lowerTitle)) return "Entry Level"

  // ─── Logistics / Supply Chain / Warehouse entry-level ───
  // Shipping/Receiving Clerk, Logistics Coordinator (entry)
  if (/\b(?:shipping|receiving)\s+(?:clerk|associate|coordinator)\b/.test(lowerTitle)) return "Entry Level"
  // Delivery Driver, Truck Driver (entry), Route Driver
  if (/\b(?:delivery|truck|route|van)\s+driver\b|\bcourier\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b/.test(lowerTitle)) return "Entry Level"
  // Inventory Clerk, Inventory Associate
  if (/\binventory\s+(?:clerk|associate|specialist|coordinator|counter)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b/.test(lowerTitle)) return "Entry Level"
  // Import/Export Coordinator, Customs Broker (entry)
  if (/\b(?:import|export|customs)\s+(?:coordinator|clerk|associate|specialist)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b/.test(lowerTitle)) return "Entry Level"

  // ─── Admin / Office entry-level ───
  // Administrative Assistant, Executive Assistant (entry), Office Assistant
  if (/\b(?:administrative|admin|office|executive|personal)\s+assistant\b/.test(lowerTitle) && !/\bsenior\b|\blead\b/.test(lowerTitle)) return "Entry Level"
  // Receptionist, Front Desk Receptionist
  if (/\breceptionist\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b/.test(lowerTitle)) return "Entry Level"
  // Office Manager (entry-level admin, not senior)
  if (/\boffice\s+(?:manager|coordinator|administrator)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bdirect\b|\bregional\b/.test(lowerTitle)) return "Entry Level"
  // Data Entry Clerk/Specialist/Operator
  if (/\bdata\s+entry\s+(?:clerk|specialist|operator|associate)\b/.test(lowerTitle)) return "Entry Level"
  // Secretary, Typist, Transcriptionist
  if (/\bsecretary\b|\btypist\b|\btranscriptionist\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\blegal\b|\bexecutive\b/.test(lowerTitle)) return "Entry Level"
  // Mailroom Clerk, Copy Clerk, Office Clerk
  if (/\b(?:mailroom|copy|office|general)\s+clerk\b/.test(lowerTitle)) return "Entry Level"
  // Virtual Assistant
  if (/\bvirtual\s+assistant\b/.test(lowerTitle)) return "Entry Level"

  // ─── Creative / Media entry-level ───
  // Junior Designer, Junior Writer, Junior Editor (already caught by Junior prefix)
  // Production Assistant, Editorial Assistant, Creative Assistant
  if (/\b(?:production|editorial|creative|studio|media|video|audio|photography|graphic)\s+assistant\b/.test(lowerTitle)) return "Entry Level"
  // Associate Designer, Associate Editor, Associate Producer
  if (/\bassociate\s+(?:designer|editor|producer|writer|creative|art\s+director)\b/.test(lowerTitle)) return "Entry Level"
  // Staff Writer (entry at publications)
  if (/\bstaff\s+writer\b/.test(lowerTitle) && !/\bsenior\b/.test(lowerTitle)) return "Entry Level"
  // Reporter, Journalist (entry)
  if (/\breporter\b|\bjournalist\b|\bcorrespondent\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bchief\b|\bmanag\b|\beditor\b|\bdirect\b/.test(lowerTitle)) return "Entry Level"
  // Camera Operator, Sound Technician, Grip, Gaffer
  if (/\bcamera\s+operator\b|\bsound\s+(?:technician|engineer)\b|\bgrip\b|\bgaffer\b|\bboom\s+operator\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bchief\b/.test(lowerTitle)) return "Entry Level"
  // Graphic Designer (standalone, no qualifier — often entry)
  if (/\bgraphic\s+designer\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bprincipal\b|\bstaff\b|\bmanag\b|\bdirect\b/.test(lowerTitle)) return "Entry Level"

  // ─── Customer Service entry-level ───
  // Customer Service Representative, Customer Care Agent
  if (/\bcustomer\s+(?:service|care)\s+(?:rep(?:resentative)?|agent|associate|specialist|advisor)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b|\bdirect\b/.test(lowerTitle)) return "Entry Level"
  // Call Center Agent/Representative, Contact Center Agent
  if (/\b(?:call|contact)\s+center\s+(?:agent|rep(?:resentative)?|associate|specialist|operator)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b|\bsupervisor\b/.test(lowerTitle)) return "Entry Level"
  // Chat Support, Email Support
  if (/\b(?:chat|email|phone|live)\s+support\s+(?:agent|specialist|representative|associate)\b/.test(lowerTitle)) return "Entry Level"
  // Technical Support Representative (entry)
  if (/\btechnical\s+support\s+(?:rep(?:resentative)?|agent|associate)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b/.test(lowerTitle)) return "Entry Level"

  // ─── Transportation / Driving entry-level ───
  // Bus Driver, Shuttle Driver, Taxi Driver, Rideshare Driver
  if (/\b(?:bus|shuttle|taxi|rideshare|school\s+bus|transit)\s+driver\b/.test(lowerTitle)) return "Entry Level"
  // CDL Driver (entry), OTR Driver
  if (/\bcdl\s+driver\b|\botr\s+driver\b|\bclass\s+[a-c]\s+driver\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b/.test(lowerTitle)) return "Entry Level"

  // ─── Fitness / Wellness entry-level ───
  // Personal Trainer, Fitness Instructor, Group Fitness Instructor
  if (/\bpersonal\s+trainer\b|\bfitness\s+(?:instructor|coach|specialist|trainer)\b|\bgroup\s+fitness\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b|\bdirect\b/.test(lowerTitle)) return "Entry Level"
  // Yoga Instructor, Pilates Instructor, Swim Instructor
  if (/\b(?:yoga|pilates|swim|dance|martial\s+arts|spinning|cycling)\s+instructor\b/.test(lowerTitle)) return "Entry Level"
  // Massage Therapist, Esthetician, Cosmetologist, Hair Stylist
  if (/\bmassage\s+therapist\b|\besthetician\b|\bcosmetologist\b|\bhair\s+stylist\b|\bbarber\b|\bnail\s+technician\b|\bbeautician\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b/.test(lowerTitle)) return "Entry Level"

  // ─── Non-profit / Social Services entry-level ───
  // Program Coordinator, Program Associate, Program Assistant
  if (/\bprogram\s+(?:coordinator|associate|assistant)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b|\bdirect\b/.test(lowerTitle)) return "Entry Level"
  // Outreach Coordinator, Community Organizer, Volunteer Coordinator
  if (/\b(?:outreach|community|volunteer|donor|fundraising|development)\s+(?:coordinator|associate|assistant|organizer)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b|\bdirect\b/.test(lowerTitle)) return "Entry Level"
  // Grant Writer (entry)
  if (/\bgrant\s+(?:writer|coordinator|associate|assistant)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b/.test(lowerTitle)) return "Entry Level"

  // ─── Insurance entry-level ───
  // Insurance Agent, Claims Adjuster, Claims Processor
  if (/\binsurance\s+(?:agent|representative|associate|specialist|advisor)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b|\bdirect\b/.test(lowerTitle)) return "Entry Level"
  if (/\bclaims\s+(?:adjuster|processor|examiner|representative|associate|specialist)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b/.test(lowerTitle)) return "Entry Level"

  // ─── Agriculture / Environment entry-level ───
  // Farm Worker, Agricultural Technician, Environmental Technician
  if (/\bfarm\s+(?:worker|hand|laborer|assistant)\b|\bagricultural\s+(?:technician|worker|assistant)\b/.test(lowerTitle)) return "Entry Level"
  if (/\benvironmental\s+(?:technician|specialist|coordinator|scientist|analyst)\b/.test(lowerTitle) && !/\bsenior\b|\blead\b|\bmanag\b|\bdirect\b/.test(lowerTitle)) return "Entry Level"
  // Park Ranger (entry), Wildlife Technician
  if (/\bpark\s+ranger\b|\bwildlife\s+(?:technician|biologist)\b|\bforestry\s+technician\b/.test(lowerTitle) && !/\bsenior\b|\blead\b/.test(lowerTitle)) return "Entry Level"
  // Legal: Articling Student, Law Clerk, Paralegal
  if (/\barticling\b|\blaw\s+clerk\b|\bparalegal\b/.test(lowerTitle)) return "Entry Level"
  // Medical: Resident
  if (/\bresident\b/.test(lowerTitle) && /\bmedic|\bclinical|\bsurg|\bphysician|\bhospital/.test(lowerTitle)) return "Entry Level"
  // Research: Research Assistant, Teaching Assistant, Postdoc
  if (/\bresearch\s+assistant\b|\bteaching\s+assistant\b|\bpostdoc(?:toral)?\b|\bra\b/.test(lowerTitle) && /\bresearch|\bacadem|\buniversity|\blab\b/.test(lowerTitle)) return "Entry Level"
  // Finance: Analyst (entry-level at banks/consulting)
  if (/\banalyst\b/.test(lowerTitle) && !/\bsenior\b|\bstaff\b|\blead\b|\bprincipal\b|\bmanag\b|\bdirect\b|\bvp\b/.test(lowerTitle) && /\binvestment|\bbank|\bconsult|\bfinancial|\bfp&a|\bcredit|\brisk/.test(lowerTitle)) return "Entry Level"

  return null
}

/**
 * Extract level from numbered title patterns.
 * Handles: SDE-1, SWE-2, Engineer III, Software Engineer 3, L5, IC4, T3, P2, E5,
 * Grade/Band/Level numbers, and hundreds of role+number combinations.
 */
function extractNumberedLevel(title: string): string | null {
  // ─── Pattern 1: Role + Roman numeral ───
  // Engineer I, Designer II, Analyst III, Consultant IV, Technician V, Specialist VI
  // Also: Nurse I, Therapist II, Planner III, Writer IV, Recruiter II, Accountant III
  const romanRoles = [
    // Engineering / Tech
    "engineer", "developer", "programmer", "coder", "architect", "scientist",
    "administrator", "admin",
    // Data
    "analyst", "statistician", "modeler",
    // Design
    "designer", "illustrator", "animator",
    // IT / Ops
    "technician", "specialist", "operator", "administrator",
    // Business
    "consultant", "advisor", "strategist", "coordinator", "planner",
    // Finance
    "accountant", "auditor", "underwriter", "actuary", "examiner", "appraiser",
    // HR / Recruiting
    "recruiter", "generalist", "coordinator",
    // Creative
    "writer", "editor", "producer", "copywriter",
    // Healthcare
    "nurse", "therapist", "technologist", "hygienist", "assistant", "aide",
    "pharmacist", "dietitian", "paramedic", "emt",
    // Education
    "teacher", "instructor", "tutor", "professor", "lecturer",
    // Legal
    "paralegal", "clerk",
    // Trades / Manufacturing
    "mechanic", "electrician", "welder", "machinist", "fabricator", "assembler",
    "inspector", "operator",
    // Government / Military
    "officer", "agent", "investigator", "ranger", "trooper",
    // Logistics / Supply Chain
    "buyer", "dispatcher", "scheduler",
    // Customer / Support
    "representative", "associate",
  ]
  const romanRolesPattern = romanRoles.join("|")
  const romanRegex = new RegExp(`\\b(?:${romanRolesPattern})\\s+(i{1,3}|iv|v|vi{0,3})\\b`, "i")
  const romanMatch = title.match(romanRegex)
  if (romanMatch) return romanToLevel(romanMatch[1])

  // ─── Pattern 2: Role + Arabic number ───
  // Software Engineer 1, Data Scientist 2, Product Designer 3, Nurse 2, Accountant 1
  const arabicRegex = new RegExp(`\\b(?:${romanRolesPattern})\\s+(\\d)\\b`, "i")
  const arabicMatch = title.match(arabicRegex)
  if (arabicMatch) return numberToLevel(parseInt(arabicMatch[1]))

  // ─── Pattern 3: Abbreviated role + hyphen/space + number ───
  // Engineering: SDE-1, SWE-2, SSE-3, SE-1, FE-2, BE-1
  // Data: DS-1, DE-2, DA-1, ML-2, AI-1
  // Product/Design: PM-2, TPM-1, UX-2, UI-1, PD-1
  // DevOps/Infra: SRE-2, DBA-1, SA-1, NA-1
  // QA/Test: QA-2, QE-1, SDET-2, SET-1
  // Security: SE-1 (already covered), SecEng-1
  // Management: EM-2 (engineering manager)
  // General: MTS-1 (member of technical staff)
  const abbrMatch = title.match(/\b(?:sde|swe|sse|se|fe|be|mts|pm|tpm|em|ds|de|da|ml|ai|qa|qe|sdet|set|sre|dba|sa|na|ux|ui|pd|re|ce|me|ee|che|ie|tic)[\s-]+(\d)\b/i)
  if (abbrMatch) return numberToLevel(parseInt(abbrMatch[1]))

  // ─── Pattern 4: Level/IC/T/P/E/G/M + number (FAANG-style) ───
  // Google: L3-L11, IC3-IC11, T3-T11
  // Meta: E3-E9, IC3-IC9
  // Apple: ICT2-ICT6
  // Amazon: L4-L12
  // Microsoft: Level 59-80 (handled separately)
  // Salesforce: P1-P5, M1-M5
  // Generic: G1-G15 (grade), Band 1-5
  const levelCodeMatch = title.match(/\b(?:l|ic|ict|t|p|e|g|m)(\d{1,2})\b/i)
  if (levelCodeMatch) {
    const num = parseInt(levelCodeMatch[1])
    if (num <= 2) return "Entry Level"
    if (num === 3) return "Middle Level"
    if (num === 4) return "Senior Level"
    if (num === 5) return "Lead"
    if (num <= 7) return "Principal"
    return "Principal" // L8+ = Distinguished/Fellow territory
  }

  // ─── Pattern 5: Microsoft-style levels (59-80) ───
  const msLevelMatch = title.match(/\blevel\s+(\d{2})\b/i)
  if (msLevelMatch) {
    const num = parseInt(msLevelMatch[1])
    if (num <= 60) return "Entry Level"
    if (num <= 62) return "Middle Level"
    if (num <= 64) return "Senior Level"
    if (num <= 67) return "Lead"
    if (num <= 70) return "Principal"
    return "Director" // 70+ = Director/VP at Microsoft
  }

  // ─── Pattern 6: Band/Grade/Tier + number ───
  const bandMatch = title.match(/\b(?:band|grade|tier)\s+(\d{1,2})\b/i)
  if (bandMatch) {
    const num = parseInt(bandMatch[1])
    if (num <= 2) return "Entry Level"
    if (num <= 4) return "Middle Level"
    if (num <= 6) return "Senior Level"
    if (num <= 8) return "Lead"
    return "Principal"
  }

  // ─── Pattern 7: "Level N" generic (Level 1, Level 2, etc.) ───
  const genericLevelMatch = title.match(/\blevel\s+(\d)\b/i)
  if (genericLevelMatch) {
    return numberToLevel(parseInt(genericLevelMatch[1]))
  }

  // ─── Pattern 8: Parenthetical level — "Engineer (L4)", "PM (IC5)" ───
  const parenMatch = title.match(/\(\s*(?:l|ic|ict|t|p|e|g)(\d{1,2})\s*\)/i)
  if (parenMatch) {
    const num = parseInt(parenMatch[1])
    if (num <= 2) return "Entry Level"
    if (num === 3) return "Middle Level"
    if (num === 4) return "Senior Level"
    if (num === 5) return "Lead"
    return "Principal"
  }

  return null
}

/** Map Roman numeral suffix to level */
function romanToLevel(roman: string): ExperienceLevel {
  const r = roman.toLowerCase()
  if (r === "i") return "Entry Level"
  if (r === "ii") return "Middle Level"
  if (r === "iii") return "Senior Level"
  if (r === "iv") return "Lead"
  if (r === "v" || r === "vi") return "Principal"
  return "Entry Level"
}

/** Map Arabic number suffix to level */
function numberToLevel(num: number): ExperienceLevel {
  if (num <= 1) return "Entry Level"
  if (num === 2) return "Middle Level"
  if (num === 3) return "Senior Level"
  if (num === 4) return "Lead"
  return "Principal" // 5+
}

/** Soft context patterns for experience year mentions */
const EXP_SOFT_CONTEXT = /(?:prefer(?:red|ably)?|nice[\s-]+to[\s-]+have|bonus|a\s+plus|ideal(?:ly)?|not\s+required|desired|optional)/i

/** Non-experience year patterns to exclude */
const NON_EXP_YEAR_CONTEXT = /(?:founded|established|company|vesting|warranty|ago|since|over\s+the\s+(?:past|last|next)|within\s+the|for\s+the\s+(?:past|last)|history|running|operating|serving|old)/i

/**
 * Check if a year mention at a given position is a soft/preferred mention
 */
function isExpSoftMention(text: string, matchIndex: number): boolean {
  const start = Math.max(0, matchIndex - 80)
  const end = Math.min(text.length, matchIndex + 80)
  const surrounding = text.slice(start, end)
  return EXP_SOFT_CONTEXT.test(surrounding)
}

/**
 * Check if a year mention is about something other than experience requirements
 */
function isNonExpMention(text: string, matchIndex: number): boolean {
  const start = Math.max(0, matchIndex - 60)
  const end = Math.min(text.length, matchIndex + 60)
  const surrounding = text.slice(start, end)
  return NON_EXP_YEAR_CONTEXT.test(surrounding)
}

/**
 * Extract the minimum year requirement from a requirements section.
 * isReqSection=true means higher confidence, so we use broader patterns.
 */
function extractMinYears(text: string, isReqSection: boolean): number | null {
  if (!text) return null

  // Ordered from most specific to least
  const patterns = [
    /(?:minimum|at\s+least|min\.?)\s+(\d+)\+?\s*years?/gi,
    /(\d+)\+?\s*years?\s+(?:of\s+)?(?:experience|professional|relevant|engineering|software|work|industry|hands[\s-]?on)/gi,
  ]

  // In req section, also allow bare "X+ years" but with non-exp filtering
  if (isReqSection) {
    patterns.push(/(\d+)\+?\s*years?/gi)
  }

  for (const pattern of patterns) {
    let match: RegExpExecArray | null
    const yearValues: number[] = []
    const regex = new RegExp(pattern.source, pattern.flags)
    while ((match = regex.exec(text)) !== null) {
      const years = parseInt(match[1])
      // Skip unreasonable values
      if (years <= 0 || years >= 30) continue
      // Skip soft mentions (preferred, nice to have)
      if (isExpSoftMention(text, match.index)) continue
      // For bare "X years" pattern, also skip non-experience mentions
      if (pattern === patterns[patterns.length - 1] && isReqSection && patterns.length === 3) {
        if (isNonExpMention(text, match.index)) continue
      }
      yearValues.push(years)
    }
    if (yearValues.length > 0) {
      return Math.min(...yearValues)
    }
  }

  return null
}

/**
 * Extract years from full text — stricter patterns only, skip soft and non-exp mentions.
 */
function extractMinYearsFromFullText(fullText: string): number | null {
  const patterns = [
    /(?:minimum|at\s+least|min\.?|require[ds]?)\s+(\d+)\+?\s*years?\s+(?:of\s+)?(?:experience|professional|relevant)/gi,
    /(\d+)\+?\s*years?\s+(?:of\s+)?(?:experience|professional|relevant|industry|engineering|software|work|hands[\s-]?on)/gi,
  ]

  for (const pattern of patterns) {
    let match: RegExpExecArray | null
    const yearValues: number[] = []
    const regex = new RegExp(pattern.source, pattern.flags)
    while ((match = regex.exec(fullText)) !== null) {
      const years = parseInt(match[1])
      if (years <= 0 || years >= 30) continue
      if (isExpSoftMention(fullText, match.index)) continue
      if (isNonExpMention(fullText, match.index)) continue
      yearValues.push(years)
    }
    if (yearValues.length > 0) {
      return Math.min(...yearValues)
    }
  }

  return null
}

/**
 * Cross-check a years-derived level against the title.
 * If the title clearly says "junior" but years say "Senior", trust the title.
 * If no title signal, trust the years.
 */
function sanitizeYearsLevel(yearsLevel: ExperienceLevel, lowerTitle: string): ExperienceLevel {
  // Title caps for low-level roles — years can't push above these
  if (/\bintern(?:ship)?\b|\bco[\s-]?op\b/.test(lowerTitle)) return "Internship"
  if (/\bentry[\s-]?level\b/.test(lowerTitle)) return "Entry Level"
  if (/\bjunior\b|\bjr\.?\b/.test(lowerTitle) && !/\bsenior\b/.test(lowerTitle)) {
    // Junior title — cap at Middle Level even if years say higher
    const rank = LEVEL_RANK[yearsLevel] ?? 2
    return rank > LEVEL_RANK["Middle Level"] ? "Middle Level" : yearsLevel
  }

  return yearsLevel
}

/** Rank map for experience levels (for comparison) */
const LEVEL_RANK: Record<string, number> = {
  "Internship": 0,
  "Entry Level": 1,
  "Middle Level": 2,
  "Senior Level": 3,
  "Lead": 4,
  "Principal": 5,
  "Director": 6,
  "VP": 7,
  "C-Level": 8,
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
 * Education extraction with sanity checks.
 * - In requirements section: extract normally but skip "preferred"/"nice to have" context
 * - In full text fallback: only match when paired with requirement language
 * - When multiple degrees found, return the LOWEST (actual minimum requirement)
 * - Cross-check against job title/experience to catch obvious mismatches
 */
function extractEducationSafe(reqSection: string, fullText: string, lowerTitle: string): string {
  // Try requirements section first (higher confidence)
  if (reqSection) {
    const edu = extractEducationFromSection(reqSection)
    if (edu) return edu
  }

  // Full text fallback: only match with strong requirement context
  return extractEducationFromFullText(fullText, lowerTitle)
}

/** Patterns that indicate a mention is NOT a hard requirement */
const SOFT_CONTEXT = /(?:prefer(?:red|ably)?|nice[\s-]+to[\s-]+have|bonus|a\s+plus|ideal(?:ly)?|not\s+required|or\s+equivalent\s+(?:experience|work)|in\s+lieu\s+of|desired|optional|welcome|advantageous)/i

/** Check if an education keyword at a given position is negated by soft context */
function isSoftMention(text: string, matchIndex: number): boolean {
  // Check ~80 chars around the match for softening language
  const start = Math.max(0, matchIndex - 80)
  const end = Math.min(text.length, matchIndex + 80)
  const surrounding = text.slice(start, end)
  return SOFT_CONTEXT.test(surrounding)
}

/** Education tiers ordered from lowest to highest */
const EDU_TIERS: { pattern: RegExp; label: string; rank: number }[] = [
  { pattern: /\bhigh\s+school\s+diploma\b|\bhs\s+diploma\b|\bged\b/i, label: "High School Diploma", rank: 1 },
  { pattern: /\bassociate(?:'?s)?\s+(?:degree|of|in)\b/i, label: "Associate's Degree", rank: 2 },
  { pattern: /\bbachelor(?:'?s)?\s+(?:degree|of|in)\b|\bb\.?s\.?\s+(?:in|degree)\b|\bb\.?a\.?\s+(?:in|degree)\b/i, label: "Bachelor's Degree", rank: 3 },
  { pattern: /\bbachelor(?:'?s)?\b/i, label: "Bachelor's Degree", rank: 3 },
  { pattern: /\bmaster(?:'?s)?\s+(?:degree|of|in)\b|\bm\.?s\.?\s+(?:in|degree)\b/i, label: "Master's Degree", rank: 4 },
  { pattern: /\bmba\b/i, label: "MBA", rank: 5 },
  { pattern: /\bphd\b|\bph\.?d\b|\bdoctorate\b|\bdoctoral\b/i, label: "PhD/Doctorate", rank: 6 },
]

/**
 * Extract from requirements section — higher confidence, but still skip soft mentions.
 * Returns the LOWEST degree found as a hard requirement.
 */
function extractEducationFromSection(section: string): string {
  let lowestMatch: { label: string; rank: number } | null = null

  for (const tier of EDU_TIERS) {
    const match = tier.pattern.exec(section)
    if (!match) continue

    // Skip if surrounded by "preferred", "nice to have", etc.
    if (isSoftMention(section, match.index)) continue

    // Skip "master" if it's actually a verb (mastering, mastered, mastery)
    if (tier.rank === 4 && /\bmaster(?:ing|ed|y|ful)\b/i.test(section)) {
      // Only skip if the verb form is the ONLY match
      const cleanSection = section.replace(/\bmaster(?:ing|ed|y|ful)\b/gi, "")
      if (!tier.pattern.test(cleanSection)) continue
    }

    if (!lowestMatch || tier.rank < lowestMatch.rank) {
      lowestMatch = { label: tier.label, rank: tier.rank }
    }
  }

  return lowestMatch?.label || ""
}

/**
 * Extract from full text — low confidence, so require strong requirement language nearby.
 * Also cross-checks against title for obvious mismatches.
 */
function extractEducationFromFullText(fullText: string, lowerTitle: string): string {
  // Require the education mention to be near requirement-like language
  const STRONG_REQ_CONTEXT = /(?:require[ds]?|must\s+have|minimum|mandatory|necessary|need[s]?)/i

  let lowestMatch: { label: string; rank: number } | null = null

  for (const tier of EDU_TIERS) {
    const match = tier.pattern.exec(fullText)
    if (!match) continue
    if (isSoftMention(fullText, match.index)) continue

    // Skip "master" verb forms
    if (tier.rank === 4 && /\bmaster(?:ing|ed|y|ful)\b/i.test(fullText)) {
      const cleanText = fullText.replace(/\bmaster(?:ing|ed|y|ful)\b/gi, "")
      if (!tier.pattern.test(cleanText)) continue
    }

    // In full text mode, require strong context nearby for advanced degrees
    if (tier.rank >= 4) {
      const start = Math.max(0, match.index - 120)
      const end = Math.min(fullText.length, match.index + 120)
      const nearby = fullText.slice(start, end)
      if (!STRONG_REQ_CONTEXT.test(nearby)) continue
    }

    if (!lowestMatch || tier.rank < lowestMatch.rank) {
      lowestMatch = { label: tier.label, rank: tier.rank }
    }
  }

  // Sanity check: PhD/Doctorate shouldn't appear on entry-level or intern roles
  if (lowestMatch && lowestMatch.rank >= 6) {
    if (/\bintern(?:ship)?\b|\bentry[\s-]?level\b|\bjunior\b|\bjr\.?\b|\bco[\s-]?op\b/.test(lowerTitle)) {
      return "Bachelor's Degree"
    }
  }

  return lowestMatch?.label || ""
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

/**
 * Map SmartRecruiters typeOfEmployment values to standard job types.
 */
export function mapSmartRecruitersEmploymentType(type: string): string {
  if (!type) return ""
  const lower = type.toLowerCase()
  if (lower.includes("full")) return "Full-time"
  if (lower.includes("part")) return "Part-time"
  if (lower.includes("contract") || lower.includes("contractor")) return "Contract"
  if (lower.includes("intern")) return "Internship"
  if (lower.includes("freelance")) return "Freelance"
  if (lower.includes("temp")) return "Contract"
  return type
}
