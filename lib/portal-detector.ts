export interface PortalPattern {
  name: string
  urlPatterns: RegExp[]
  engine: "skyvern-1.0" | "skyvern-2.0"
  supportsDirectApi: boolean
  getApplyUrl: (url: string) => string
}

export const PORTAL_PATTERNS: PortalPattern[] = [
  {
    name: "Lever",
    urlPatterns: [/lever\.co/, /jobs\.lever\.co/],
    engine: "skyvern-1.0",
    supportsDirectApi: true,
    getApplyUrl: (url) => url.replace(/\/?$/, "").replace(/\/apply$/, "") + "/apply",
  },
  {
    name: "Greenhouse",
    urlPatterns: [/greenhouse\.io/, /boards\.greenhouse\.io/],
    engine: "skyvern-1.0",
    supportsDirectApi: true,
    getApplyUrl: (url) => url.replace(/#.*$/, "") + "#app",
  },
  {
    name: "Ashby",
    urlPatterns: [/ashbyhq\.com/, /jobs\.ashbyhq\.com/],
    engine: "skyvern-1.0",
    supportsDirectApi: true,
    getApplyUrl: (url) => url,
  },
  {
    name: "SmartRecruiters",
    urlPatterns: [/smartrecruiters\.com/],
    engine: "skyvern-1.0",
    supportsDirectApi: false,
    getApplyUrl: (url) => url,
  },
  {
    name: "BambooHR",
    urlPatterns: [/bamboohr\.com/],
    engine: "skyvern-1.0",
    supportsDirectApi: false,
    getApplyUrl: (url) => url,
  },
  {
    name: "Jobvite",
    urlPatterns: [/jobvite\.com/, /\.jobvite\.com/],
    engine: "skyvern-1.0",
    supportsDirectApi: false,
    getApplyUrl: (url) => url,
  },
  {
    name: "Workday",
    urlPatterns: [/myworkdayjobs\.com/, /workday\.com/],
    engine: "skyvern-2.0",
    supportsDirectApi: false,
    getApplyUrl: (url) => url,
  },
  {
    name: "iCIMS",
    urlPatterns: [/icims\.com/, /\.icims\.com/],
    engine: "skyvern-2.0",
    supportsDirectApi: false,
    getApplyUrl: (url) => url,
  },
  {
    name: "LinkedIn",
    urlPatterns: [/linkedin\.com\/jobs/],
    engine: "skyvern-2.0",
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
