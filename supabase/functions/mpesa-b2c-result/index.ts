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

    const resultData = await req.json()
    console.log('B2C result callback:', JSON.stringify(resultData, null, 2))

    const { Result } = resultData
    const conversationID = Result.ConversationID
    const resultCode = Result.ResultCode
    const resultDesc = Result.ResultDesc

    if (resultCode === 0) {
      // Payment successful
      const resultParameters = Result.ResultParameters?.ResultParameter || []
      const receiptNumber = resultParameters.find((param: any) => param.Key === 'TransactionReceipt')?.Value

      await supabase
        .from('mpesa_transactions')
        .update({ 
          status: 'success',
          mpesa_receipt_number: receiptNumber || null
        })
        .eq('conversation_id', conversationID)

      console.log('B2C withdrawal completed successfully:', conversationID)
    } else {
      // Payment failed - rollback by finding the transaction and reversing it
      const { data: failedTx } = await supabase
        .from('mpesa_transactions') 
        .select('id')
        .eq('conversation_id', conversationID)
        .single()

      if (failedTx) {
        await supabase.rpc('rollback_mpesa_withdrawal', { tx: failedTx.id })
        console.log('B2C withdrawal failed and rolled back:', conversationID, resultDesc)
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
    console.error('B2C result processing error:', error)
    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  }
})