// Form definitions for every remote config section, taken from §6 of
// remote-config.md. Labels and help text mirror the doc; allowed values come
// from ALLOWED in core.ts.

import { ALLOWED, type Path, type SectionKey } from './core'

export interface Option { value: string; label: string }

export type FieldDef = {
  path: Path
  label: string
  help: string
} & (
  | { kind: 'boolean' }
  | { kind: 'number'; min?: number; max?: number; step?: number; integer?: boolean; unit?: string }
  | { kind: 'text'; multiline?: boolean; preview?: boolean; charCount?: 'x' }
  | { kind: 'textList'; itemLabel: string }
  | { kind: 'orderedSet'; options: Option[] }
  | { kind: 'hiddenSet'; options: Option[] }
  | { kind: 'select'; options: Option[] }
  | { kind: 'objectList'; columns: ColumnDef[]; itemLabel: string }
  | { kind: 'levels' }
  | { kind: 'planFeatures' }
)

export type ColumnDef =
  | { key: string; label: string; type: 'text'; multiline?: boolean; width?: string }
  | { key: string; label: string; type: 'select'; options: Option[]; width?: string }
  | { key: string; label: string; type: 'included'; width?: string }

export interface SectionDef {
  key: SectionKey
  name: string
  blurb: string
  highImpact?: boolean
  /** Which mock preview to render next to the form. */
  preview?: 'free_swipes' | 'out_of_swipes' | 'job_card' | 'share'
  groups: { title?: string; note?: string; fields: FieldDef[] }[]
}

const opts = (xs: readonly string[], labels: Record<string, string> = {}): Option[] =>
  xs.map(v => ({ value: v, label: labels[v] ?? v }))

const CHIP_LABELS: Record<string, string> = {
  industry: 'industry: company industry',
  company_type: 'company_type: startup/enterprise',
  employment_type: 'employment_type: full-time etc.',
  location_type: 'location_type: remote/hybrid/onsite',
  experience: 'experience: experience banner',
  posted: 'posted: "2d ago"',
  salary: 'salary: salary range',
  level: 'level: job level',
  requirements: 'requirements: short requirement tags',
  education: 'education: education level',
  work_authorization: 'work_authorization: visa/authorization',
}
const SECTION_LABELS: Record<string, string> = {
  requirements: 'requirements',
  fit_writeup: 'fit_writeup ("Why This Fits You")',
  skills: 'skills',
  benefits: 'benefits',
  about: 'about ("About the Role" fallback)',
}
const PLAN_LABELS: Record<string, string> = { starter: 'Starter', pro: 'Pro', ultra: 'Ultra' }

const text = (path: Path, label: string, help: string, extra: Partial<{ multiline: boolean; preview: boolean }> = {}): FieldDef => ({
  path, label, help, kind: 'text', preview: true, ...extra,
})
const count = (path: Path, label: string, help: string, unit?: string): FieldDef => ({
  path, label, help, kind: 'number', min: 0, step: 1, integer: true, unit,
})

export const SECTIONS: SectionDef[] = [
  {
    key: 'limits',
    name: 'Limits & rewards',
    blurb: 'What users get. Enforced by the database for every app version.',
    highImpact: true,
    groups: [
      {
        note: 'Whole numbers ≥ 0. Changes are not retroactive: existing balances and current cycles aren\'t touched; a new allowance applies from each user\'s next reset. Paid plan credits come from the store subscription and aren\'t controlled here.',
        fields: [
          count(['free_swipes_per_cycle'], 'Free swipes per cycle', 'Free right-swipes (applications) per cycle for free users. Also the starting balance of new accounts and the "of N" on the paywall\'s free box.', 'swipes'),
          count(['free_cycle_days'], 'Free cycle length', 'Length of a free cycle. A cycle starts at a user\'s first swipe after a reset.', 'days'),
          count(['referral_reward_referrer'], 'Referral reward: code owner', 'Swipes the code owner gets when someone signs up with their code. Also caps what older app builds can grant.', 'swipes'),
          count(['referral_reward_referee'], 'Referral reward: new user', 'Swipes the new user gets for using a code. Also the value of {referral_reward}.', 'swipes'),
          count(['social_follow_reward'], 'Follow reward', 'Swipes per follow claim (Instagram, X, LinkedIn; each once). Also the value of {follow_reward}.', 'swipes'),
          count(['new_user_application_credits'], 'New user application credits', 'Starting applications_remaining / applications_limit for new accounts.', 'credits'),
        ],
      },
    ],
  },
  {
    key: 'features',
    name: 'Feature switches',
    blurb: 'AI role filter, splash duration, share buttons, social follow, feed source.',
    groups: [
      {
        fields: [
          { path: ['ai_role_filter_enabled'], label: 'AI role filter', help: 'Runs an AI pass that removes off-role jobs from the first deck of each session. Turned off because it removed valid roles, added about 2s and used AI quota.', kind: 'boolean' },
          { path: ['splash_min_ms'], label: 'Minimum splash time', help: 'Minimum time the launch splash ("Tinder for jobs") stays up. Range 0–5000. Applies on the next launch.', kind: 'number', min: 0, max: 5000, step: 100, integer: true, unit: 'ms' },
          { path: ['share_targets'], label: 'Share buttons', help: 'Share buttons in the Free Swipes sheet, in this order. Untick all to hide the row.', kind: 'orderedSet', options: opts(ALLOWED.share_targets, { story: 'story (Instagram Story)', x: 'x (Post on X)', whatsapp: 'whatsapp' }) },
          { path: ['show_more_share_options'], label: '"More ways to share" link', help: 'Shows the system share sheet link. Always shown when no share buttons are selected.', kind: 'boolean' },
          { path: ['social_follow_enabled'], label: 'Follow for free swipes', help: 'Shows "Follow us for free swipes" in the Free Swipes sheet and "Follow Iris" in the out-of-swipes sheet.', kind: 'boolean' },
          { path: ['feed_source'], label: 'Feed source', help: '"client": the phone builds the job feed. "server": the get-feed function builds it. If the function fails, the app quietly falls back to client.', kind: 'select', options: opts(ALLOWED.feed_source, { client: 'client (on the phone)', server: 'server (get-feed function)' }) },
        ],
      },
    ],
  },
  {
    key: 'social',
    name: 'Social links',
    blurb: 'Social profile links and the "Follow us" rows in the Free Swipes sheet.',
    groups: [
      {
        title: 'Links',
        fields: [
          { path: ['links', 'instagram'], label: 'Instagram', help: 'Profile opened by the Instagram follow row.', kind: 'text' },
          { path: ['links', 'twitter'], label: 'Twitter / X', help: 'Profile opened by the Twitter follow row.', kind: 'text' },
          { path: ['links', 'linkedin'], label: 'LinkedIn', help: 'Page opened by the LinkedIn follow row.', kind: 'text' },
        ],
      },
      {
        title: 'Follow rows',
        fields: [
          {
            path: ['follow_items'], label: 'Follow rows', itemLabel: 'row',
            help: 'Which follow rows appear, in what order and with what label. Remove a row to hide it.',
            kind: 'objectList',
            columns: [
              { key: 'platform', label: 'Platform', type: 'select', options: opts(ALLOWED.platforms), width: 'w-36' },
              { key: 'label', label: 'Label', type: 'text' },
            ],
          },
        ],
      },
    ],
  },
  {
    key: 'copy.share',
    name: 'Share messages',
    blurb: 'Messages users send when sharing invites or jobs.',
    preview: 'share',
    groups: [
      {
        fields: [
          { path: ['invite_link_base'], label: 'Invite link base', help: 'Start of every invite link; the code is appended. Must keep the nextquark.in domain.', kind: 'text' },
          { path: ['x'], label: 'Post on X', help: '"Post on X" button. Keep {code} and {link}; stay under about 250 characters.', kind: 'text', multiline: true, preview: true, charCount: 'x' },
          text(['whatsapp'], 'WhatsApp', 'WhatsApp button. *text* shows as bold in WhatsApp.', { multiline: true }),
          text(['story'], 'Instagram Story', 'Copied to the clipboard for an Instagram Story text sticker.', { multiline: true }),
          text(['image_caption'], 'Image caption', '"More ways to share": copied next to the invite image.', { multiline: true }),
          text(['invite_message'], 'Invite message', 'Share invite from Profile, Explore and the home fallback.', { multiline: true }),
          text(['job_share'], 'Job share', 'Share button on a job card. {link} is the job\'s link here.', { multiline: true }),
        ],
      },
    ],
  },
  {
    key: 'copy.free_swipes',
    name: 'Free Swipes sheet',
    blurb: 'All text in the Free Swipes (referral) sheet.',
    preview: 'free_swipes',
    groups: [
      {
        title: 'Header & code',
        fields: [
          text(['title'], 'Title', 'Sheet title.'),
          text(['subtitle'], 'Subtitle', 'Under the title.'),
          text(['code_label'], 'Code label', 'Above the referral code.'),
          text(['code_generating'], 'Code loading text', 'Shown while the code is generated.'),
          text(['copy_button'], 'Copy button', 'Button that copies the code.'),
          text(['stat_friends'], 'Friends stat', 'Label of the friends-joined stat.'),
          text(['stat_swipes'], 'Swipes stat', 'Label of the swipes-earned stat.'),
        ],
      },
      {
        title: 'How it works',
        fields: [
          text(['how_title'], 'Heading', '"How it works" heading.'),
          { path: ['steps'], label: 'Steps', help: 'Any number of steps; up to 8 animate in. Icons are fixed (send, add person, gift); steps beyond the third reuse the gift icon.', kind: 'textList', itemLabel: 'step' },
        ],
      },
      {
        title: 'Follow',
        fields: [
          text(['follow_title'], 'Follow title', 'Follow section heading.'),
          text(['follow_subtitle'], 'Follow subtitle', 'Under the follow heading.'),
          text(['follow_badge'], 'Follow badge', 'Badge on each unclaimed follow row.'),
          text(['follow_claimed'], 'Claimed label', 'Shown on claimed follow rows.'),
        ],
      },
      {
        title: 'Share buttons & toasts',
        fields: [
          text(['share_story'], 'Story button', 'Instagram Story share button.'),
          text(['share_x'], 'X button', 'Post on X share button.'),
          text(['share_whatsapp'], 'WhatsApp button', 'WhatsApp share button.'),
          text(['more_share'], 'More ways to share', 'System share sheet link.'),
          text(['toast_caption_copied'], 'Toast: caption copied', 'After "More ways to share".'),
          text(['toast_story_opened'], 'Toast: story opened', 'When Instagram Story opens directly.'),
          text(['toast_story_sheet'], 'Toast: story via sheet', 'When the story goes through the share sheet.'),
        ],
      },
    ],
  },
  {
    key: 'copy.out_of_swipes',
    name: 'Out-of-swipes sheet',
    blurb: 'All text in the "You\'re out of swipes" sheet.',
    preview: 'out_of_swipes',
    groups: [
      {
        title: 'Header',
        fields: [
          text(['title'], 'Title', 'Sheet title.'),
          text(['reset_countdown'], 'Reset countdown', 'Reset pill. {countdown} becomes e.g. "3d 4h".'),
          text(['reset_soon'], 'Reset soon', 'Used when the reset time is unknown.'),
          text(['body'], 'Body', 'Text under the title.', { multiline: true }),
        ],
      },
      {
        title: 'Premium card',
        note: 'Keep the benefits true to the cheapest visible plan (see Paywall → feature rows).',
        fields: [
          text(['premium_title'], 'Premium title', 'Title of the dark premium card.'),
          text(['premium_badge'], 'Premium badge', 'Badge on the premium card. Empty text hides the badge.'),
          { path: ['premium_benefits'], label: 'Benefits', help: 'Bullet list on the premium card.', kind: 'textList', itemLabel: 'benefit' },
          text(['premium_cta'], 'Upgrade button', 'Opens the paywall.'),
        ],
      },
      {
        title: 'Earn free swipes',
        fields: [
          text(['free_title'], 'Section title', 'Shown in capitals.'),
          text(['invite_title'], 'Invite title', 'Invite friends row.'),
          text(['invite_body'], 'Invite body', 'Under the invite title.'),
          text(['follow_title'], 'Follow title', 'Follow Iris row.'),
          text(['follow_body'], 'Follow body', 'Under the follow title.'),
          text(['later'], 'Dismiss', 'Dismiss button at the bottom.'),
        ],
      },
    ],
  },
  {
    key: 'job_card',
    name: 'Job card',
    blurb: 'Header items, chip order/visibility, section order/visibility/titles, buttons.',
    preview: 'job_card',
    groups: [
      {
        title: 'Header',
        note: 'Config can reorder and hide parts of the card. New kinds of content need an app update.',
        fields: [
          { path: ['header', 'show_match_badge'], label: 'Match badge', help: 'Allows the match-score badge. Off hides it everywhere (the swipe deck already hides it).', kind: 'boolean' },
          { path: ['header', 'show_location'], label: 'Location line', help: 'Location under the job title. Kept in sync with the old app_config flag, so older app versions follow it too.', kind: 'boolean' },
          { path: ['header', 'show_linkedin'], label: 'LinkedIn icon', help: 'LinkedIn icon next to the company name.', kind: 'boolean' },
        ],
      },
      {
        title: 'Chips',
        note: 'A chip with no data for a job isn\'t shown for that job, whatever the config says.',
        fields: [
          { path: ['chips', 'order'], label: 'Chip order', help: 'Order of the coloured chips. An unticked chip isn\'t shown.', kind: 'orderedSet', options: opts(ALLOWED.chips, CHIP_LABELS) },
          { path: ['chips', 'hidden'], label: 'Hidden chips', help: 'Chips to hide.', kind: 'hiddenSet', options: opts(ALLOWED.chips, CHIP_LABELS) },
        ],
      },
      {
        title: 'Sections',
        fields: [
          { path: ['sections', 'order'], label: 'Section order', help: 'Order of the sections below the chips. fit_writeup only appears where the screen asks for it.', kind: 'orderedSet', options: opts(ALLOWED.sections, SECTION_LABELS) },
          { path: ['sections', 'hidden'], label: 'Hidden sections', help: '"about" hides the "About the Role" fallback (shown only when a job has no requirements, skills or benefits).', kind: 'hiddenSet', options: opts(ALLOWED.hidden_sections, SECTION_LABELS) },
          { path: ['sections', 'requirements_limit'], label: 'Requirement bullets', help: 'Maximum requirement bullets on the front of the card.', kind: 'number', min: 0, step: 1, integer: true },
          text(['sections', 'titles', 'requirements'], 'Title: requirements', 'Section heading.'),
          text(['sections', 'titles', 'fit_writeup'], 'Title: fit_writeup', 'Section heading.'),
          text(['sections', 'titles', 'skills'], 'Title: skills', 'Section heading.'),
          text(['sections', 'titles', 'benefits'], 'Title: benefits', 'Section heading.'),
          text(['sections', 'titles', 'about'], 'Title: about', 'Heading of the fallback section.'),
        ],
      },
      {
        title: 'Footer & buttons',
        fields: [
          text(['hint_text'], 'Hint bar', 'Bar at the bottom of the card.'),
          { path: ['show_link_button'], label: 'Link button', help: 'Blue globe button that opens the job\'s web page.', kind: 'boolean' },
          { path: ['show_share_button'], label: 'Share button', help: 'Share button on the front of the card.', kind: 'boolean' },
        ],
      },
    ],
  },
  {
    key: 'paywall',
    name: 'Paywall',
    blurb: 'Plan order, hidden plans, highlighted plan, defaults, feature rows, how-it-works.',
    highImpact: true,
    groups: [
      {
        title: 'Plans',
        note: 'Prices can\'t be changed here: they come from the App Store and Google Play. A new plan needs new store products and an app update.',
        fields: [
          { path: ['plan_order'], label: 'Plan order', help: 'Order of the plan cards.', kind: 'orderedSet', options: opts(ALLOWED.plans, PLAN_LABELS) },
          { path: ['hidden_plans'], label: 'Hidden plans', help: 'Plans not offered. If you hide everything, all plans show.', kind: 'hiddenSet', options: opts(ALLOWED.plans, PLAN_LABELS) },
          { path: ['highlighted_plan'], label: 'Highlighted plan', help: 'Plan that gets the badge. "none" shows no badge.', kind: 'select', options: [...opts(ALLOWED.plans, PLAN_LABELS), { value: 'none', label: 'none (no badge)' }] },
          text(['highlight_badge'], 'Badge text', 'Text of the highlight badge.', { preview: false }),
          { path: ['default_plan'], label: 'Default plan', help: 'Plan selected when the screen opens.', kind: 'select', options: opts(ALLOWED.plans, PLAN_LABELS) },
          { path: ['default_billing_period'], label: 'Default billing period', help: 'Billing period selected when the screen opens.', kind: 'select', options: opts(ALLOWED.billing_period) },
        ],
      },
      {
        title: 'Feature rows',
        fields: [
          { path: ['features'], label: 'Feature rows per plan', help: '"yes" shows a check, "no" a cross, any other text is shown as-is (e.g. "75"). The free entry isn\'t shown on the paywall today.', kind: 'planFeatures' },
        ],
      },
      {
        title: 'How it works',
        fields: [
          {
            path: ['how_it_works'], label: 'How it works grid', help: 'The "How it works" grid on the paywall.', itemLabel: 'step', kind: 'objectList',
            columns: [
              { key: 'n', label: 'No.', type: 'text', width: 'w-16' },
              { key: 'title', label: 'Title', type: 'text' },
              { key: 'body', label: 'Body', type: 'text', multiline: true },
            ],
          },
        ],
      },
    ],
  },
  {
    key: 'logos',
    name: 'Company logos',
    blurb: 'Order of company logo sources.',
    groups: [
      {
        note: 'To fix one company\'s logo, set companies.logo_url to a direct image URL and keep "company" first. To fix a wrong domain, correct companies.website.',
        fields: [
          {
            path: ['providers'], label: 'Logo sources', help: 'Tried in order until one loads; after the last, the app shows a letter badge.', kind: 'orderedSet',
            options: opts(ALLOWED.providers, {
              company: 'company: companies.logo_url (internet URLs only)',
              logo_dev: 'logo_dev: logo.dev (needs EXPO_PUBLIC_LOGO_DEV_TOKEN in the build)',
              google: 'google: Google favicon service, 256px',
              duckduckgo: 'duckduckgo: DuckDuckGo icon service',
            }),
          },
        ],
      },
    ],
  },
  {
    key: 'feed',
    name: 'Feed tuning',
    blurb: 'Keyword caps, timeouts, company caps, related-role share, starting levels, generic words.',
    groups: [
      {
        note: 'Applies to the on-phone feed and the get-feed function. Change in small steps and watch results.',
        fields: [
          count(['title_keywords_cap'], 'Title keywords cap', 'Most role keywords sent per search. Higher is broader, but slower.'),
          count(['exclude_ids_cap'], 'Excluded ids cap', 'How many recently swiped job ids are excluded from results.'),
          count(['rpc_timeout_ms'], 'Search timeout', 'Time allowed per search before falling back to a cheaper query.', 'ms'),
          count(['default_company_cap'], 'Jobs per company (other tabs)', 'Most jobs per company in one page.'),
          count(['home_company_cap'], 'Jobs per company (home)', 'Most jobs per company in one page of the home feed.'),
          count(['fallback_keyword_count'], 'Fallback keywords', 'Keywords kept on the second, cheaper attempt after a slow search.'),
          { path: ['adjacent_share'], label: 'Related-role share', help: 'Share of a page given to related ("transferable") roles. 0 turns them off; 0.5 means up to half.', kind: 'number', min: 0, max: 1, step: 0.05 },
          count(['adjacent_keywords_cap'], 'Related-role keywords', 'Keywords for the related-roles query.'),
          count(['adjacent_core_ratio'], 'Core jobs per related job', 'At most one related-role job per this many core jobs.'),
          count(['interleave_every'], 'Interleave every', 'One related-role card after every N−1 core cards.'),
        ],
      },
      {
        title: 'Starting levels',
        fields: [
          { path: ['starting_levels'], label: 'Starting levels by experience', help: 'Job levels a user starts with. The feed widens one rung at a time when it runs out.', kind: 'levels' },
        ],
      },
      {
        title: 'Generic words',
        fields: [
          { path: ['generic_single_words'], label: 'Generic single words', help: 'Words too broad to match on alone ("developer" matched "Developer Advocate"). Dropped from expanded keywords; a role the user typed is always kept.', kind: 'textList', itemLabel: 'word' },
        ],
      },
    ],
  },
]

export const LEVEL_RUNGS = ['0 Internship', '1 Entry', '2 Mid', '3 Senior', '4 Lead/Principal', '5 Director/VP/C-level']

export function sectionDef(key: string): SectionDef | undefined {
  return SECTIONS.find(s => s.key === key)
}

export function allFields(def: SectionDef): FieldDef[] {
  return def.groups.flatMap(g => g.fields)
}

/** §9 — shown on the help panel. */
export const CANT_CHANGE = {
  ota: [
    'New screens, new card components or sections, new kinds of chips',
    'Visual design: colours, fonts, spacing, animations',
    'Copy that isn\'t listed in these sections (e.g. the FAQ)',
    'New config fields',
  ],
  store: [
    'New native libraries or permissions',
    'App icon, native splash, app name',
    'Expo or React Native upgrades',
  ],
  elsewhere: [
    'Prices and plans: App Store Connect / Google Play Console',
    'AI models and prompts: edge functions (supabase/functions/_shared/llm.ts), deployed with the Supabase CLI',
    'Emails: the send-email and resend-inbound functions',
    'The existing settings table (system-down banner, automation provider keys) on the Settings page',
  ],
}
