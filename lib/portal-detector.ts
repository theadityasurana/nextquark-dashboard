export interface PortalPattern {
  name: string
  urlPatterns: RegExp[]
  fieldMappings: {
    name?: string[]
    email?: string[]
    phone?: string[]
    location?: string[]
    resume?: string[]
    coverLetter?: string[]
    experience?: string[]
    education?: string[]
    skills?: string[]
  }
  instructions: string
}

export const PORTAL_PATTERNS: PortalPattern[] = [
  {
    name: "Greenhouse",
    urlPatterns: [/greenhouse\.io/, /boards\.greenhouse\.io/],
    fieldMappings: {
      name: ["#first_name", "#last_name", "input[name*='name']"],
      email: ["#email", "input[type='email']"],
      phone: ["#phone", "input[type='tel']"],
      location: ["#location", "input[name*='location']"],
      resume: ["input[type='file'][name*='resume']", "input[type='file']"],
      coverLetter: ["textarea[name*='cover']", "#cover_letter"],
    },
    instructions: "Greenhouse portal detected. Fill fields in order: name, email, phone, location. Upload resume to file input. Submit form.",
  },
  {
    name: "Lever",
    urlPatterns: [/lever\.co/, /jobs\.lever\.co/],
    fieldMappings: {
      name: ["input[name='name']", ".application-name input"],
      email: ["input[name='email']", "input[type='email']"],
      phone: ["input[name='phone']", "input[type='tel']"],
      resume: ["input[type='file']", ".resume-upload input"],
    },
    instructions: "Lever portal detected. Fill: name, email, phone. Upload resume. Click 'Submit application' button.",
  },
  {
    name: "Workday",
    urlPatterns: [/myworkdayjobs\.com/, /workday\.com/],
    fieldMappings: {
      name: ["input[data-automation-id*='legalNameSection']", "input[aria-label*='name']"],
      email: ["input[data-automation-id*='email']", "input[type='email']"],
      phone: ["input[data-automation-id*='phone']", "input[type='tel']"],
      location: ["input[data-automation-id*='location']", "input[data-automation-id*='address']"],
      resume: ["input[type='file']", "input[data-automation-id*='resume']"],
    },
    instructions: "Workday portal detected. Navigate through multi-step form. Fill each section completely before clicking 'Next'. Upload resume when prompted.",
  },
  {
    name: "LinkedIn",
    urlPatterns: [/linkedin\.com\/jobs/],
    fieldMappings: {
      phone: ["input[id*='phone']", "input[type='tel']"],
      resume: ["input[type='file']", ".jobs-document-upload input"],
    },
    instructions: "LinkedIn Easy Apply detected. Most fields auto-filled. Add phone if requested. Upload resume if needed. Click through multi-step form.",
  },
  {
    name: "iCIMS",
    urlPatterns: [/icims\.com/, /\.icims\.com/],
    fieldMappings: {
      name: ["input[id*='firstname']", "input[id*='lastname']"],
      email: ["input[id*='email']", "input[type='email']"],
      phone: ["input[id*='phone']", "input[type='tel']"],
      resume: ["input[type='file'][id*='resume']", "input[type='file']"],
    },
    instructions: "iCIMS portal detected. Fill all required fields marked with asterisk. Upload resume. Complete all form pages before submitting.",
  },
  {
    name: "Jobvite",
    urlPatterns: [/jobvite\.com/, /\.jobvite\.com/],
    fieldMappings: {
      name: ["#name", "input[name*='name']"],
      email: ["#email", "input[type='email']"],
      phone: ["#phone", "input[type='tel']"],
      resume: ["input[type='file']", "#resume"],
    },
    instructions: "Jobvite portal detected. Fill standard fields. Upload resume. Answer any additional questions. Submit application.",
  },
  {
    name: "SmartRecruiters",
    urlPatterns: [/smartrecruiters\.com/],
    fieldMappings: {
      name: ["input[name='firstName']", "input[name='lastName']"],
      email: ["input[name='email']", "input[type='email']"],
      phone: ["input[name='phoneNumber']", "input[type='tel']"],
      location: ["input[name='location']"],
      resume: ["input[type='file']"],
    },
    instructions: "SmartRecruiters portal detected. Fill personal info section. Upload resume. Complete experience section if required. Submit.",
  },
  {
    name: "BambooHR",
    urlPatterns: [/bamboohr\.com/],
    fieldMappings: {
      name: ["#firstName", "#lastName"],
      email: ["#email", "input[type='email']"],
      phone: ["#phone", "input[type='tel']"],
      resume: ["input[type='file']"],
    },
    instructions: "BambooHR portal detected. Fill basic info fields. Upload resume. Answer custom questions if present. Submit application.",
  },
];

export function detectPortal(url: string): PortalPattern | null {
  for (const pattern of PORTAL_PATTERNS) {
    if (pattern.urlPatterns.some(regex => regex.test(url))) {
      return pattern;
    }
  }
  return null;
}

export function buildOptimizedPrompt(
  portalUrl: string,
  userData: any,
  resumeUploaded: string | null
): string {
  const portal = detectPortal(portalUrl);

  // Build comprehensive user data string
  const userDataLines = [
    `Name: ${userData.name || ''}`,
    `Email: ${userData.email || ''}`,
    `Phone: ${userData.phone || ''}`,
    `Location: ${userData.location || ''}`,
  ];

  if (userData.linkedinUrl) userDataLines.push(`LinkedIn: ${userData.linkedinUrl}`);
  if (userData.githubUrl) userDataLines.push(`GitHub: ${userData.githubUrl}`);
  if (userData.gender) userDataLines.push(`Gender: ${userData.gender}`);
  if (userData.ethnicity) userDataLines.push(`Ethnicity: ${userData.ethnicity}`);
  if (userData.disabilityStatus) userDataLines.push(`Disability Status: ${userData.disabilityStatus}`);
  if (userData.veteranStatus) userDataLines.push(`Veteran Status: ${userData.veteranStatus}`);
  if (userData.workAuthorization) userDataLines.push(`Work Authorization: ${userData.workAuthorization}`);
  if (resumeUploaded) userDataLines.push(`Resume: resume.pdf (uploaded to session)`);
  if (userData.coverLetter) userDataLines.push(`Cover Letter: ${userData.coverLetter}`);
  if (userData.experience) userDataLines.push(`\nWork Experience:\n${userData.experience}`);
  if (userData.education) userDataLines.push(`\nEducation:\n${userData.education}`);
  if (userData.certifications) userDataLines.push(`\nCertifications:\n${userData.certifications}`);
  if (userData.achievements) userDataLines.push(`\nAchievements:\n${userData.achievements}`);
  if (userData.skills && userData.skills.length > 0) userDataLines.push(`\nSkills: ${userData.skills.join(", ")}`);
  if (userData.salaryMin || userData.salaryMax) {
    userDataLines.push(`Salary Expectation: ${userData.salaryCurrency || 'USD'} ${userData.salaryMin || 0} - ${userData.salaryMax || 0}`);
  }

  if (portal) {
    const resumeInstruction = resumeUploaded 
      ? "IMPORTANT: A resume file named 'resume.pdf' is already uploaded and available in this session. When you find a resume upload field, select this existing 'resume.pdf' file - DO NOT create a new resume file."
      : "Skip resume upload if no file is available.";
    
    return `Navigate to ${portalUrl} and complete the job application.

PORTAL: ${portal.name}
${portal.instructions}

${resumeInstruction}

USER DATA:
${userDataLines.join("\n")}

FIELD SELECTORS (try these first):
${Object.entries(portal.fieldMappings)
  .map(([field, selectors]) => `- ${field}: ${selectors.join(" OR ")}`)
  .join("\n")}

TASK: Use the provided selectors to fill fields efficiently. If selector doesn't work, find the field visually. For file uploads, use the pre-uploaded files. Submit when complete.`;
  }

  // Fallback for unknown portals
  const resumeInstruction = resumeUploaded 
    ? "IMPORTANT: A resume file named 'resume.pdf' is already uploaded and available in this session. When you find a resume upload field, select this existing 'resume.pdf' file - DO NOT create a new resume file."
    : "Skip resume upload if no file is available.";
  
  return `Navigate to ${portalUrl} and fill out the job application form.

${resumeInstruction}

USER DATA:
${userDataLines.join("\n")}

TASK: Identify form fields, fill with matching data. For file uploads, use the pre-uploaded files. Submit when complete.`;
}
