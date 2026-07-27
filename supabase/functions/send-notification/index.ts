import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { notifyDeveloper } from '../_shared/notify-developer.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { title, body, data, targetUserId, type } = await req.json()

    if (!title || !body) {
      return new Response(
        JSON.stringify({ error: 'title and body are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Save notification to DB
    const notifType = targetUserId ? 'user_specific' : (type || 'broadcast')
    const { data: notif, error: insertError } = await supabase
      .from('notifications')
      .insert({
        title,
        body,
        data: data || {},
        target_user_id: targetUserId || null,
        type: notifType,
      })
      .select('id')
      .single()

    if (insertError) console.error('Error saving notification:', insertError)

    // Get push tokens
    let query = supabase.from('user_push_tokens').select('push_token')
    if (targetUserId) {
      query = query.eq('user_id', targetUserId)
    }
    const { data: tokens, error: tokensError } = await query

    if (tokensError) throw tokensError
    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'Notification saved, no tokens to push to' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Send via Expo Push API
    const messages = tokens.map((t: any) => ({
      to: t.push_token,
      sound: 'default',
      title,
      body,
      data: { ...(data || {}), notificationId: notif?.id },
    }))

    // Expo accepts max 100 per request
    const chunks = []
    for (let i = 0; i < messages.length; i += 100) {
      chunks.push(messages.slice(i, i + 100))
    }

    const results = []
    for (const chunk of chunks) {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chunk),
      })
      results.push(await response.json())
    }

    // Mark as sent
    if (notif?.id) {
      await supabase
        .from('notifications')
        .update({ sent_at: new Date().toISOString() })
        .eq('id', notif.id)
    }

    return new Response(
      JSON.stringify({ success: true, tokenCount: tokens.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error:', error)
    await notifyDeveloper('send-notification', (error as Error).message || 'Push notification delivery failed', undefined, 'warning')
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
