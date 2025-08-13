import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const timeoutData = await req.json()
    console.log('B2C timeout callback:', JSON.stringify(timeoutData, null, 2))

    const { Result } = timeoutData
    const conversationID = Result?.ConversationID

    if (conversationID) {
      // Find and rollback the timed-out transaction
      const { data: timedOutTx } = await supabase
        .from('mpesa_transactions')
        .select('id')
        .eq('conversation_id', conversationID)
        .single()

      if (timedOutTx) {
        await supabase.rpc('rollback_mpesa_withdrawal', { tx: timedOutTx.id })
        console.log('B2C withdrawal timed out and rolled back:', conversationID)
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('B2C timeout processing error:', error)
    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  }
})