// The Iris website sections of this dashboard (A/B experiments, referrals, user actions).
// No password in the dashboard itself. The server talks to irisjobs.live's referral admin API
// with REFERRAL_ADMIN_KEY (same value as the Cloudflare secret on the website).
export const IRIS_ORIGIN = 'https://irisjobs.live'

export const irisAdminKey = () => process.env.REFERRAL_ADMIN_KEY || ''
