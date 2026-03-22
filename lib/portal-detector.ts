export interface PortalPattern {
  name: string
  urlPatterns: RegExp[]
  supportsDirectApi: boolean
  getApplyUrl: (url: string) => string
}

export const PORTAL_PATTERNS: PortalPattern[] = [
  {
    name: "Lever",
    urlPatterns: [/lever\.co/, /jobs\.lever\.co/],
    supportsDirectApi: true,
    getApplyUrl: (url) => url.replace(/\/?$/, "").replace(/\/apply$/, "") + "/apply",
  },
  {
    name: "Greenhouse",
    urlPatterns: [/greenhouse\.io/, /boards\.greenhouse\.io/],
    supportsDirectApi: true,
    getApplyUrl: (url) => url.replace(/#.*$/, "") + "#app",
  },
  {
    name: "Ashby",
    urlPatterns: [/ashbyhq\.com/, /jobs\.ashbyhq\.com/],
    supportsDirectApi: true,
    getApplyUrl: (url) => url,
  },
  {
    name: "SmartRecruiters",
    urlPatterns: [/smartrecruiters\.com/],
    supportsDirectApi: false,
    getApplyUrl: (url) => url,
  },
  {
    name: "BambooHR",
    urlPatterns: [/bamboohr\.com/],
    supportsDirectApi: false,
    getApplyUrl: (url) => url,
  },
  {
    name: "Jobvite",
    urlPatterns: [/jobvite\.com/, /\.jobvite\.com/],
    supportsDirectApi: false,
    getApplyUrl: (url) => url,
  },
  {
    name: "Workday",
    urlPatterns: [/myworkdayjobs\.com/, /workday\.com/],
    supportsDirectApi: false,
    getApplyUrl: (url) => url,
  },
  {
    name: "iCIMS",
    urlPatterns: [/icims\.com/, /\.icims\.com/],
    supportsDirectApi: false,
    getApplyUrl: (url) => url,
  },
  {
    name: "LinkedIn",
    urlPatterns: [/linkedin\.com\/jobs/],
    supportsDirectApi: false,
    getApplyUrl: (url) => url,
  },
]

export function detectPortal(url: string): PortalPattern | null {
  for (const pattern of PORTAL_PATTERNS) {
    if (pattern.urlPatterns.some((regex) => regex.test(url))) {
      return pattern
    }
  }
  return null
}
