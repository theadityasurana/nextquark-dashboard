/**
 * Parses job content to extract structured data
 */
export function parseJobContent(html: string) {
  if (!html) return {
    requirements: [],
    skills: [],
    benefits: [],
    responsibilities: [],
    jobType: "Full-time",
    experienceLevel: "",
    salaryMin: "",
    salaryMax: "",
    educationLevel: "",
    workAuthorization: "",
  }

  // Convert to lowercase for easier matching
  const lowerHtml = html.toLowerCase()
  
  const result = {
    requirements: [] as string[],
    skills: [] as string[],
    benefits: [] as string[],
    responsibilities: [] as string[],
    jobType: "Full-time",
    experienceLevel: "",
    salaryMin: "",
    salaryMax: "",
    educationLevel: "",
    workAuthorization: "",
  }

  // Helper function to extract list items from a section
  function extractListItems(content: string, startPattern: RegExp): string[] {
    const match = content.match(startPattern)
    if (!match) return []
    
    const startIndex = match.index! + match[0].length
    // Find the next heading or end of content
    const nextHeadingMatch = content.slice(startIndex).match(/<h[1-6]|<\/div>|<div class=/i)
    const endIndex = nextHeadingMatch ? startIndex + nextHeadingMatch.index! : content.length
    
    const sectionContent = content.slice(startIndex, endIndex)
    
    // Extract all <li> items
    const liMatches = sectionContent.matchAll(/<li[^>]*>(.*?)<\/li>/gi)
    const items: string[] = []
    
    for (const liMatch of liMatches) {
      const text = liMatch[1]
        .replace(/<[^>]*>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      
      if (text && text.length > 3) {
        items.push(text)
      }
    }
    
    return items
  }

  // Extract Requirements (Minimum requirements, Qualifications, Requirements)
  const reqPatterns = [
    /<h[1-6][^>]*>.*?(minimum\s+requirements|minimum\s+qualifications|qualifications|requirements|what\s+you'll\s+need|what\s+you\s+need|who\s+you\s+are|about\s+you).*?<\/h[1-6]>/i,
    /<strong>.*?(minimum\s+requirements|qualifications|requirements).*?<\/strong>/i,
    /<p>.*?<strong>.*?(minimum\s+requirements|qualifications|requirements).*?<\/strong>.*?<\/p>/i,
  ]
  
  for (const pattern of reqPatterns) {
    const items = extractListItems(html, pattern)
    if (items.length > 0) {
      result.requirements.push(...items)
      break
    }
  }

  // Extract Preferred Qualifications
  const prefPatterns = [
    /<h[1-6][^>]*>.*?(preferred\s+qualifications|preferred\s+requirements|nice\s+to\s+have|bonus\s+points|bonus|plus|ideal\s+candidate).*?<\/h[1-6]>/i,
  ]
  
  for (const pattern of prefPatterns) {
    const items = extractListItems(html, pattern)
    if (items.length > 0) {
      result.requirements.push(...items)
      break
    }
  }

  // Extract Responsibilities
  const respPatterns = [
    /<h[1-6][^>]*>.*?(responsibilities|what\s+you'll\s+do|what\s+you\s+will\s+do|your\s+role|the\s+role|day\s+to\s+day|duties).*?<\/h[1-6]>/i,
  ]
  
  for (const pattern of respPatterns) {
    const items = extractListItems(html, pattern)
    if (items.length > 0) {
      result.responsibilities.push(...items)
    }
  }

  // Extract Benefits
  const benefitPatterns = [
    /<h[1-6][^>]*>.*?(benefits|perks|what\s+we\s+offer|compensation|pay\s+and\s+benefits|our\s+benefits|why\s+join\s+us|package).*?<\/h[1-6]>/i,
  ]
  
  for (const pattern of benefitPatterns) {
    const items = extractListItems(html, pattern)
    if (items.length > 0) {
      result.benefits.push(...items)
    }
  }

  // Extract Skills from requirements (look for technical terms)
  const skillKeywords = [
    'react', 'node', 'python', 'java', 'javascript', 'typescript', 'aws', 'docker',
    'kubernetes', 'sql', 'nosql', 'mongodb', 'postgresql', 'redis', 'graphql',
    'rest', 'api', 'microservices', 'agile', 'scrum', 'git', 'ci/cd', 'jenkins',
    'terraform', 'ansible', 'linux', 'windows', 'macos', 'ios', 'android',
    'swift', 'kotlin', 'flutter', 'react native', 'vue', 'angular', 'django',
    'flask', 'spring', 'express', 'fastapi', 'go', 'rust', 'c++', 'c#',
    'ruby', 'rails', 'php', 'laravel', 'wordpress', 'shopify', 'salesforce',
    'tableau', 'power bi', 'excel', 'figma', 'sketch', 'photoshop', 'ai', 'ml',
    'machine learning', 'deep learning', 'nlp', 'computer vision', 'data science',
    'analytics', 'blockchain', 'crypto', 'web3', 'solidity', 'ethereum'
  ]

  const allText = html.toLowerCase()
  const foundSkills = new Set<string>()
  
  for (const skill of skillKeywords) {
    if (allText.includes(skill)) {
      // Capitalize first letter
      foundSkills.add(skill.charAt(0).toUpperCase() + skill.slice(1))
    }
  }
  
  result.skills = Array.from(foundSkills).slice(0, 10) // Limit to 10 skills

  // Extract Job Type
  if (lowerHtml.includes('full-time') || lowerHtml.includes('full time')) {
    result.jobType = "Full-time"
  } else if (lowerHtml.includes('part-time') || lowerHtml.includes('part time')) {
    result.jobType = "Part-time"
  } else if (lowerHtml.includes('contract')) {
    result.jobType = "Contract"
  } else if (lowerHtml.includes('internship') || lowerHtml.includes('intern')) {
    result.jobType = "Internship"
  } else if (lowerHtml.includes('freelance')) {
    result.jobType = "Freelance"
  }

  // Extract Experience Level
  if (lowerHtml.includes('entry level') || lowerHtml.includes('0-1 year') || lowerHtml.includes('junior')) {
    result.experienceLevel = "Entry Level (0-1 years)"
  } else if (lowerHtml.includes('1-3 year')) {
    result.experienceLevel = "Junior (1-3 years)"
  } else if (lowerHtml.includes('3-5 year') || lowerHtml.includes('mid-level') || lowerHtml.includes('mid level')) {
    result.experienceLevel = "Mid-Level (3-5 years)"
  } else if (lowerHtml.includes('5-8 year') || lowerHtml.includes('senior')) {
    result.experienceLevel = "Senior (5-8 years)"
  } else if (lowerHtml.includes('8+ year') || lowerHtml.includes('lead')) {
    result.experienceLevel = "Lead (8+ years)"
  } else if (lowerHtml.includes('10+ year') || lowerHtml.includes('principal') || lowerHtml.includes('staff')) {
    result.experienceLevel = "Principal/Staff (10+ years)"
  } else if (lowerHtml.match(/\d+\+?\s*years?/)) {
    // Try to extract "X+ years" or "X years"
    const match = lowerHtml.match(/(\d+)\+?\s*years?/)
    if (match) {
      const years = parseInt(match[1])
      if (years <= 1) result.experienceLevel = "Entry Level (0-1 years)"
      else if (years <= 3) result.experienceLevel = "Junior (1-3 years)"
      else if (years <= 5) result.experienceLevel = "Mid-Level (3-5 years)"
      else if (years <= 8) result.experienceLevel = "Senior (5-8 years)"
      else if (years <= 10) result.experienceLevel = "Lead (8+ years)"
      else result.experienceLevel = "Principal/Staff (10+ years)"
    }
  }

  // Extract Salary Range
  // Look for patterns like: $120,000 - $180,000 or $120k - $180k or 120000-180000
  const salaryPatterns = [
    /\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*[-–—to]+\s*\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/i,
    /\$(\d+)k\s*[-–—to]+\s*\$(\d+)k/i,
    /(\d{3,})\s*[-–—to]+\s*(\d{3,})/,
  ]
  
  for (const pattern of salaryPatterns) {
    const match = html.match(pattern)
    if (match) {
      let min = match[1].replace(/,/g, '')
      let max = match[2].replace(/,/g, '')
      
      // Handle 'k' notation (e.g., 120k = 120000)
      if (pattern.source.includes('k')) {
        min = (parseInt(min) * 1000).toString()
        max = (parseInt(max) * 1000).toString()
      }
      
      result.salaryMin = min
      result.salaryMax = max
      break
    }
  }

  // Extract Education Level
  if (lowerHtml.includes('high school') || lowerHtml.includes('hs diploma')) {
    result.educationLevel = "High School Diploma"
  } else if (lowerHtml.includes('associate') || lowerHtml.includes("associate's")) {
    result.educationLevel = "Associate's Degree"
  } else if (lowerHtml.includes('bachelor') || lowerHtml.includes("bachelor's") || lowerHtml.includes('bs') || lowerHtml.includes('ba ')) {
    result.educationLevel = "Bachelor's Degree"
  } else if (lowerHtml.includes('master') || lowerHtml.includes("master's") || lowerHtml.includes('ms') || lowerHtml.includes('ma ')) {
    result.educationLevel = "Master's Degree"
  } else if (lowerHtml.includes('phd') || lowerHtml.includes('ph.d') || lowerHtml.includes('doctorate')) {
    result.educationLevel = "PhD/Doctorate"
  } else if (lowerHtml.includes('mba')) {
    result.educationLevel = "MBA"
  }

  // Extract Work Authorization
  if (lowerHtml.includes('us citizen') || lowerHtml.includes('u.s. citizen')) {
    result.workAuthorization = "US Citizen or Green Card holder only"
  } else if (lowerHtml.includes('green card')) {
    result.workAuthorization = "US Citizen or Green Card holder only"
  } else if (lowerHtml.includes('no sponsorship') || lowerHtml.includes('not sponsor')) {
    result.workAuthorization = "Must be authorized to work (no sponsorship)"
  } else if (lowerHtml.includes('h1b') || lowerHtml.includes('h-1b') || lowerHtml.includes('visa sponsor')) {
    result.workAuthorization = "Will sponsor work visa (H1B, etc.)"
  } else if (lowerHtml.includes('authorized to work') || lowerHtml.includes('work authorization')) {
    result.workAuthorization = "Must be authorized to work (no sponsorship)"
  } else if (lowerHtml.includes('any work authorization') || lowerHtml.includes('all candidates')) {
    result.workAuthorization = "Open to all work authorization statuses"
  }

  return result
}
