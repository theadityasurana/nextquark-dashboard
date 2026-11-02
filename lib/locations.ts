// Constants for job form dropdowns
// jobs.loc_cities / loc_countries (the app's "near me first" ordering and
// location filter) are filled by the database trigger jobs_set_loc from
// the free-text location, for every writer (this form, ATS sync,
// sync-companies). A new place here must also exist in the app repo's
// constants/location-mappings.ts (then run scripts/gen-location-aliases.ts
// and apply the seed), or it is stored with no country.

export const LOCATIONS = [
  "Remote",
  "San Francisco, CA",
  "New York, NY",
  "Seattle, WA",
  "Austin, TX",
  "Boston, MA",
  "Los Angeles, CA",
  "Chicago, IL",
  "Denver, CO",
  "Portland, OR",
  "Bangalore, India",
  "Mumbai, India",
  "Delhi, India",
  "Hyderabad, India",
  "London, UK",
  "Berlin, Germany",
  "Toronto, Canada",
  "Singapore",
]

export const EDUCATION_QUALIFICATIONS = [
  "High School",
  "Associate Degree",
  "Bachelor's Degree",
  "Master's Degree",
  "PhD",
  "MBA",
  "Not Required",
]

export const WORK_MODES = [
  "Remote",
  "Hybrid",
  "On-site",
]

export const WORK_AUTHORIZATION = [
  "No Visa Sponsorship",
  "Visa Sponsorship Available",
  "H1B Transfer Only",
  "Relocation Provided",
  "Relocation Not Provided",
  "US Citizen or Green Card Only",
  "Work Authorization Required",
  "Open to All",
]
