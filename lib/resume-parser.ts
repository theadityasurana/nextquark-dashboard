// Dynamic import to avoid pdf-parse loading test files at build time
async function parsePdf(buffer: Buffer): Promise<{ text: string }> {
  const pdf = (await import("pdf-parse")).default
  return pdf(buffer)
}

export interface ParsedResume {
  full_name: string | null
  first_name: string | null
  last_name: string | null
  gender: string | null
  phone: string | null
  country_code: string | null
  location: string | null
  headline: string | null
  bio: string | null
  linkedin_url: string | null
  github_url: string | null
  skills: string[]
  top_skills: string[]
  experience: any[]
  education: any[]
  certifications: any[]
  achievements: any[]
}

// ─── Section Detection ───

const SECTION_HEADERS: Record<string, RegExp> = {
  experience: /^(?:work\s*)?experience|employment\s*history|professional\s*experience|work\s*history/i,
  education: /^education(?:al)?\s*(?:background|history|qualifications)?/i,
  skills: /^(?:technical\s*)?skills|technologies|competencies|proficiencies|tech\s*stack/i,
  certifications: /^certifications?|licenses?(?:\s*(?:&|and)\s*certifications?)?/i,
  achievements: /^achievements?|awards?|honors?|accomplishments?/i,
  projects: /^projects?|personal\s*projects?|key\s*projects?/i,
  summary: /^(?:professional\s*)?summary|(?:career\s*)?objective|about\s*me|profile/i,
}

function detectSection(line: string): string | null {
  const cleaned = line.replace(/[:\-–—|]/g, "").trim()
  if (cleaned.length > 50 || cleaned.length < 3) return null
  for (const [section, regex] of Object.entries(SECTION_HEADERS)) {
    if (regex.test(cleaned)) return section
  }
  return null
}

function splitIntoSections(text: string): Record<string, string> {
  const lines = text.split("\n")
  const sections: Record<string, string> = { header: "" }
  let currentSection = "header"

  for (const line of lines) {
    const detected = detectSection(line)
    if (detected) {
      currentSection = detected
      if (!sections[currentSection]) sections[currentSection] = ""
    } else {
      sections[currentSection] = (sections[currentSection] || "") + line + "\n"
    }
  }

  return sections
}

// ─── Field Extractors ───

function extractLinkedIn(text: string): string | null {
  const match = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w\-%.]+/i)
  return match ? match[0] : null
}

function extractGitHub(text: string): string | null {
  const match = text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[\w\-]+/i)
  return match ? match[0] : null
}

function extractPhone(text: string): { phone: string; countryCode: string | null } | null {
  // Match international formats: +1-xxx-xxx-xxxx, +91 xxxxx xxxxx, (xxx) xxx-xxxx, etc.
  const patterns = [
    /(\+\d{1,3})[\s.\-]?\(?(\d{1,4})\)?[\s.\-]?(\d{2,5})[\s.\-]?(\d{2,5})[\s.\-]?(\d{0,5})/,
    /\((\d{3})\)\s*(\d{3})[\s.\-]?(\d{4})/,
    /(\d{3})[\s.\-](\d{3})[\s.\-](\d{4})/,
    /(\d{10,12})/,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      const full = match[0].replace(/[\s.\-()]/g, "")
      // Check if starts with country code
      const ccMatch = full.match(/^(\+\d{1,3})(.+)/)
      if (ccMatch) {
        return { phone: ccMatch[2], countryCode: ccMatch[1] }
      }
      // 10+ digit number without country code
      if (/^\d{10,}$/.test(full)) {
        return { phone: full, countryCode: null }
      }
    }
  }
  return null
}

function extractEmail(text: string): string | null {
  const match = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/i)
  return match ? match[0] : null
}

function extractLocation(text: string): string | null {
  // Look for common location patterns in the header area
  const lines = text.split("\n").slice(0, 10)

  for (const line of lines) {
    // City, State/Country patterns
    const locMatch = line.match(
      /(?:^|\||\•|·|,)\s*([A-Z][a-zA-Z\s]+,\s*(?:[A-Z]{2}|[A-Z][a-zA-Z\s]+))\s*(?:\||\•|·|,|$)/
    )
    if (locMatch) return locMatch[1].trim()

    // "Location: City, State" pattern
    const labelMatch = line.match(/(?:location|address|based\s*in)[:\s]+(.+)/i)
    if (labelMatch) return labelMatch[1].trim().split(/[|\•·]/)[0].trim()
  }

  // Fallback: look for known city/state patterns in first 10 lines
  for (const line of lines) {
    const cityState = line.match(
      /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)*),\s*([A-Z]{2})\b/
    )
    if (cityState) return `${cityState[1]}, ${cityState[2]}`
  }

  return null
}

function extractName(headerText: string, fullText: string): { full: string | null; first: string | null; last: string | null } {
  const lines = headerText.split("\n").map(l => l.trim()).filter(Boolean)

  // The name is almost always the first non-empty line
  // Filter out lines that look like contact info, URLs, or section headers
  for (const line of lines.slice(0, 5)) {
    if (line.match(/@|http|linkedin|github|phone|email|address|\d{5,}|resume|curriculum/i)) continue
    if (line.length > 60 || line.length < 2) continue

    // Clean up the line
    const cleaned = line.replace(/[|•·,]/g, " ").replace(/\s+/g, " ").trim()
    const words = cleaned.split(" ").filter(w => w.length > 0 && /^[A-Za-z\-'.]+$/.test(w))

    if (words.length >= 2 && words.length <= 5) {
      const full = words.join(" ")
      return { full, first: words[0], last: words[words.length - 1] }
    }
  }

  return { full: null, first: null, last: null }
}

// ─── Section Parsers ───

function parseSkills(skillsText: string): string[] {
  if (!skillsText.trim()) return []

  const skills: Set<string> = new Set()

  // Split by common delimiters
  const tokens = skillsText
    .split(/[,|•·\n\t]/)
    .map(s => s.replace(/^[\s\-–—:*]+/, "").trim())
    .filter(s => s.length > 0 && s.length < 40 && !/^[\d.]+$/.test(s))

  for (const token of tokens) {
    // Skip section-header-like lines
    if (detectSection(token)) continue
    // Skip lines that look like sentences (too many words)
    if (token.split(" ").length > 5) continue
    skills.add(token)
  }

  return Array.from(skills)
}

function parseExperience(expText: string): any[] {
  if (!expText.trim()) return []

  const entries: any[] = []
  const lines = expText.split("\n").filter(l => l.trim())

  let current: any = null

  for (const line of lines) {
    const trimmed = line.trim()

    // Detect date ranges: "Jan 2021 - Present", "2019 – 2021", "Mar 2018 - Dec 2020"
    const dateMatch = trimmed.match(
      /(?:(\w+\.?\s*\d{4})\s*[-–—to]+\s*(\w+\.?\s*\d{4}|[Pp]resent|[Cc]urrent))/
    )

    // Detect "Title at Company" or "Title, Company" or "Company | Title"
    const titleCompanyMatch = trimmed.match(
      /^(.+?)\s+(?:at|@)\s+(.+?)(?:\s*[-–—|]\s*|$)/i
    ) || trimmed.match(
      /^(.+?)\s*[|]\s*(.+?)(?:\s*[-–—]\s*|$)/
    )

    if (dateMatch && (current || titleCompanyMatch)) {
      if (titleCompanyMatch && !current) {
        current = {
          id: String(Date.now() + entries.length),
          title: titleCompanyMatch[1].trim(),
          company: titleCompanyMatch[2].trim(),
          startDate: dateMatch[1],
          endDate: /present|current/i.test(dateMatch[2]) ? null : dateMatch[2],
          isCurrent: /present|current/i.test(dateMatch[2]),
          description: "",
          skills: [],
          employmentType: "Full-time",
        }
      } else if (current && !current.startDate) {
        current.startDate = dateMatch[1]
        current.endDate = /present|current/i.test(dateMatch[2]) ? null : dateMatch[2]
        current.isCurrent = /present|current/i.test(dateMatch[2])
      }
    } else if (titleCompanyMatch && !dateMatch) {
      // New entry without date on same line
      if (current) entries.push(current)
      current = {
        id: String(Date.now() + entries.length),
        title: titleCompanyMatch[1].trim(),
        company: titleCompanyMatch[2].trim(),
        startDate: "",
        endDate: null,
        isCurrent: false,
        description: "",
        skills: [],
        employmentType: "Full-time",
      }
    } else if (
      !current &&
      trimmed.length < 60 &&
      trimmed.length > 2 &&
      !trimmed.startsWith("•") &&
      !trimmed.startsWith("-") &&
      !trimmed.startsWith("*")
    ) {
      // Could be a company name or title on its own line
      // Check if next lines have dates
      if (current) entries.push(current)
      current = {
        id: String(Date.now() + entries.length),
        title: trimmed,
        company: "",
        startDate: "",
        endDate: null,
        isCurrent: false,
        description: "",
        skills: [],
        employmentType: "Full-time",
      }
    } else if (current) {
      // Bullet point or description line
      const bullet = trimmed.replace(/^[•\-–—*]\s*/, "")
      if (bullet.length > 5) {
        current.description += (current.description ? " " : "") + bullet
      }
      // If the line has a date range and current has no dates
      if (!current.startDate && dateMatch) {
        current.startDate = dateMatch[1]
        current.endDate = /present|current/i.test(dateMatch[2]) ? null : dateMatch[2]
        current.isCurrent = /present|current/i.test(dateMatch[2])
      }
      // If line looks like company name and current has no company
      if (!current.company && !trimmed.startsWith("•") && !trimmed.startsWith("-") && trimmed.length < 50) {
        current.company = trimmed
      }
    }
  }

  if (current) entries.push(current)
  return entries
}

function parseEducation(eduText: string): any[] {
  if (!eduText.trim()) return []

  const entries: any[] = []
  const lines = eduText.split("\n").filter(l => l.trim())

  let current: any = null

  const degreePattern = /\b(Bachelor'?s?|Master'?s?|B\.?S\.?|M\.?S\.?|B\.?A\.?|M\.?A\.?|B\.?Tech|M\.?Tech|Ph\.?D\.?|MBA|Associate'?s?|Diploma)\b/i

  for (const line of lines) {
    const trimmed = line.trim()
    const hasDegree = degreePattern.test(trimmed)
    const dateMatch = trimmed.match(/(\d{4})\s*[-–—to]+\s*(\d{4}|[Pp]resent|[Cc]urrent)/)
    const yearMatch = trimmed.match(/\b(20\d{2}|19\d{2})\b/g)

    if (hasDegree || (trimmed.length < 80 && trimmed.length > 5 && !trimmed.startsWith("•") && !trimmed.startsWith("-"))) {
      if (current && (hasDegree || (!current.degree && !trimmed.startsWith("•")))) {
        if (current.institution || current.degree) entries.push(current)
        current = null
      }

      if (!current) {
        current = {
          id: String(Date.now() + entries.length),
          institution: "",
          degree: "",
          field: "",
          startDate: "",
          endDate: "",
        }
      }

      const degreeMatch = trimmed.match(degreePattern)
      if (degreeMatch) {
        current.degree = degreeMatch[1]
        // Try to extract field of study: "B.S. in Computer Science"
        const fieldMatch = trimmed.match(/(?:in|of)\s+(.+?)(?:\s*[-–—|,]|$)/i)
        if (fieldMatch) current.field = fieldMatch[1].trim()
      }

      if (dateMatch) {
        current.startDate = dateMatch[1]
        current.endDate = /present|current/i.test(dateMatch[2]) ? "Present" : dateMatch[2]
      } else if (yearMatch) {
        if (yearMatch.length >= 2) {
          current.startDate = yearMatch[0]
          current.endDate = yearMatch[1]
        } else {
          current.endDate = yearMatch[0]
        }
      }

      // If no degree found, this line is likely the institution name
      if (!degreeMatch && !current.institution) {
        current.institution = trimmed.replace(/\s*[-–—|]\s*\d{4}.*/, "").trim()
      }
    } else if (current) {
      // Additional info line
      if (!current.institution && trimmed.length < 60) {
        current.institution = trimmed.replace(/\s*[-–—|]\s*\d{4}.*/, "").trim()
      }
    }
  }

  if (current && (current.institution || current.degree)) entries.push(current)
  return entries
}

function parseCertifications(certText: string): any[] {
  if (!certText.trim()) return []

  const entries: any[] = []
  const lines = certText.split("\n").map(l => l.trim()).filter(Boolean)

  for (const line of lines) {
    const cleaned = line.replace(/^[•\-–—*]\s*/, "").trim()
    if (cleaned.length < 3 || cleaned.length > 120) continue
    if (detectSection(cleaned)) continue

    // "Cert Name - Issuer" or "Cert Name, Issuer" or "Cert Name by Issuer"
    const parts = cleaned.split(/\s*[-–—,]\s*|\s+by\s+/i)
    entries.push({
      id: String(Date.now() + entries.length),
      name: parts[0]?.trim() || cleaned,
      issuingOrganization: parts[1]?.trim() || "",
      skills: [],
      credentialUrl: "",
    })
  }

  return entries
}

function parseAchievements(achText: string): any[] {
  if (!achText.trim()) return []

  const entries: any[] = []
  const lines = achText.split("\n").map(l => l.trim()).filter(Boolean)

  for (const line of lines) {
    const cleaned = line.replace(/^[•\-–—*]\s*/, "").trim()
    if (cleaned.length < 3 || cleaned.length > 200) continue
    if (detectSection(cleaned)) continue

    const yearMatch = cleaned.match(/\b(20\d{2}|19\d{2})\b/)
    entries.push({
      id: String(Date.now() + entries.length),
      title: cleaned.replace(/\s*\(?\d{4}\)?\s*/, "").trim(),
      date: yearMatch?.[1] || "",
      issuer: "",
      description: cleaned,
    })
  }

  return entries
}

function generateHeadline(experience: any[]): string | null {
  if (experience.length === 0) return null
  // Use the most recent (first) job title
  const recent = experience[0]
  if (recent.title && recent.company) return `${recent.title} at ${recent.company}`
  if (recent.title) return recent.title
  return null
}

function generateBio(name: string | null, experience: any[], skills: string[], education: any[]): string | null {
  const parts: string[] = []

  if (name && experience.length > 0) {
    const recent = experience[0]
    parts.push(`${recent.title || "Professional"}${recent.company ? ` at ${recent.company}` : ""}`)
  }

  if (skills.length > 0) {
    parts.push(`Skilled in ${skills.slice(0, 5).join(", ")}`)
  }

  if (education.length > 0) {
    const edu = education[0]
    if (edu.degree && edu.institution) {
      parts.push(`${edu.degree}${edu.field ? ` in ${edu.field}` : ""} from ${edu.institution}`)
    }
  }

  return parts.length > 0 ? parts.join(". ") + "." : null
}

// ─── Main Parser ───

export async function parseResume(pdfBuffer: Buffer): Promise<ParsedResume> {
  const data = await parsePdf(pdfBuffer)
  const text = data.text
  const sections = splitIntoSections(text)

  const headerText = sections.header || text.split("\n").slice(0, 15).join("\n")

  // Extract fields
  const { full, first, last } = extractName(headerText, text)
  const linkedin = extractLinkedIn(text)
  const github = extractGitHub(text)
  const phoneData = extractPhone(headerText)
  const location = extractLocation(headerText)

  // Parse sections
  const skills = parseSkills(sections.skills || "")
  const experience = parseExperience(sections.experience || "")
  const education = parseEducation(sections.education || "")
  const certifications = parseCertifications(sections.certifications || "")
  const achievements = parseAchievements(sections.achievements || "")

  const headline = generateHeadline(experience)
  const bio = generateBio(full, experience, skills, education)

  return {
    full_name: full,
    first_name: first,
    last_name: last,
    gender: null, // Cannot reliably determine from text
    phone: phoneData?.phone || null,
    country_code: phoneData?.countryCode || null,
    location,
    headline,
    bio,
    linkedin_url: linkedin,
    github_url: github,
    skills,
    top_skills: skills.slice(0, 5),
    experience,
    education,
    certifications,
    achievements,
  }
}
