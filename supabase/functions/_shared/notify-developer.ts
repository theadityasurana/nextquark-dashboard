/**
 * Developer Notification via Telegram Bot.
 * 
 * Setup (one-time):
 * 1. Message @BotFather on Telegram → /newbot → get your BOT_TOKEN
 * 2. Message your bot, then visit: https://api.telegram.org/bot<BOT_TOKEN>/getUpdates
 *    to find your chat_id
 * 3. Set these as Supabase secrets:
 *    supabase secrets set DEV_TELEGRAM_BOT_TOKEN=<your_bot_token>
 *    supabase secrets set DEV_TELEGRAM_CHAT_ID=<your_chat_id>
 * 
 * Also logs errors to `edge_function_errors` table for historical tracking.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type AlertLevel = 'critical' | 'error' | 'warning' | 'info'

const EMOJI: Record<AlertLevel, string> = {
  critical: '🚨',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
}

export async function notifyDeveloper(
  functionName: string,
  errorMessage: string,
  metadata?: Record<string, any>,
  level: AlertLevel = 'error'
): Promise<void> {
  try {
    const botToken = Deno.env.get('DEV_TELEGRAM_BOT_TOKEN') ?? ''
    const chatId = Deno.env.get('DEV_TELEGRAM_CHAT_ID') ?? ''
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    // Log to database
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey)
      await supabase.from('edge_function_errors').insert({
        function_name: functionName,
        error_message: errorMessage,
        metadata: { ...metadata, level },
      })
    }

    // Send Telegram message
    if (!botToken || !chatId) {
      console.log('[notifyDeveloper] Telegram not configured, skipping push')
      return
    }

    const emoji = EMOJI[level]
    const time = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    const metaStr = metadata ? Object.entries(metadata).map(([k, v]) => `• ${k}: ${v}`).join('\n') : ''

    const text = `${emoji} *${functionName}*\n\n${errorMessage}\n${metaStr ? '\n' + metaStr : ''}\n\n🕐 ${time}`

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        disable_notification: level === 'info',
      }),
    })
  } catch (e) {
    // Silent fail — never let notification errors break the function
    console.error('[notifyDeveloper] Failed:', e)
  }
}

/**
 * Notify developer about successful critical operations (activity monitoring).
 * Use sparingly — only for things you want to track.
 */
export async function notifyActivity(
  functionName: string,
  message: string,
  metadata?: Record<string, any>
): Promise<void> {
  await notifyDeveloper(functionName, message, metadata, 'info')
}
