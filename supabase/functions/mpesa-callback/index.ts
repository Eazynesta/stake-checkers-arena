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

    const callbackData = await req.json()
    console.log('M-Pesa callback received:', JSON.stringify(callbackData, null, 2))

    const { Body } = callbackData
    const { stkCallback } = Body

    const checkoutRequestID = stkCallback.CheckoutRequestID
    const resultCode = stkCallback.ResultCode
    const resultDesc = stkCallback.ResultDesc

    if (resultCode === 0) {
      // Payment successful
      const callbackMetadata = stkCallback.CallbackMetadata?.Item || []
      const receiptNumber = callbackMetadata.find((item: any) => item.Name === 'MpesaReceiptNumber')?.Value

      if (receiptNumber) {
        // Process the deposit using our database function
        const { error } = await supabase.rpc('process_mpesa_deposit_by_checkout', {
          checkout_id: checkoutRequestID,
          receipt_number: receiptNumber
        })

        if (error) {
          console.error('Error processing deposit:', error)
        } else {
          console.log('Deposit processed successfully for checkout:', checkoutRequestID)
        }
      }
    } else {
      // Payment failed or cancelled
      console.log('Payment failed/cancelled:', resultDesc)
      
      // Update transaction status
      await supabase
        .from('mpesa_transactions')
        .update({ 
          status: resultCode === 1032 ? 'cancelled' : 'failed',
          error_message: resultDesc 
        })
        .eq('checkout_request_id', checkoutRequestID)
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Callback processing error:', error)
    return new Response(
      JSON.stringify({ success: true }), // Always return success to M-Pesa
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  }
})