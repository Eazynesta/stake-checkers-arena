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

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !user) {
      throw new Error('Unauthorized')
    }

    const { amount, phone_number } = await req.json()
    
    if (!amount || !phone_number) {
      throw new Error('Amount and phone_number are required')
    }

    // Process withdrawal (this debits user account immediately)
    const { data: transactionId, error: withdrawalError } = await supabase.rpc('process_mpesa_withdrawal', {
      user_id_param: user.id,
      amount_param: parseFloat(amount),
      phone_param: phone_number.replace(/^\+254/, '254')
    })

    if (withdrawalError) {
      console.error('Withdrawal processing failed:', withdrawalError)
      throw new Error(withdrawalError.message)
    }

    // Get access token
    const tokenResponse = await fetch('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
      headers: {
        'Authorization': `Basic ${btoa(`${Deno.env.get('DARAJA_CONSUMER_KEY')}:${Deno.env.get('DARAJA_CONSUMER_SECRET')}`)}`,
      },
    })

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    // Generate security credential (for production, use actual certificate)
    const securityCredential = 'BfB1VJIyQiEeSWu6fg/dC9Q2r5WiNgXZ0eQj2eKCgVxcQf77X4zMG6KW/VtYF7lGZrq'

    // B2C request
    const b2cData = {
      InitiatorName: 'testapi',
      SecurityCredential: securityCredential,
      CommandID: 'BusinessPayment',
      Amount: parseInt(amount),
      PartyA: Deno.env.get('DARAJA_SHORTCODE'),
      PartyB: phone_number.replace(/^\+254/, '254'),
      Remarks: 'Game withdrawal',
      QueueTimeOutURL: `${Deno.env.get('SUPABASE_URL')}/functions/v1/mpesa-b2c-timeout`,
      ResultURL: `${Deno.env.get('SUPABASE_URL')}/functions/v1/mpesa-b2c-result`,
      Occasion: `WITHDRAWAL_${transactionId}`
    }

    console.log('B2C request data:', b2cData)

    const b2cResponse = await fetch('https://sandbox.safaricom.co.ke/mpesa/b2c/v1/paymentrequest', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(b2cData),
    })

    const b2cResult = await b2cResponse.json()
    console.log('B2C response:', b2cResult)

    if (b2cResult.ResponseCode === '0') {
      // Update transaction with conversation ID
      await supabase
        .from('mpesa_transactions')
        .update({
          conversation_id: b2cResult.ConversationID,
          originator_conversation_id: b2cResult.OriginatorConversationID
        })
        .eq('id', transactionId)

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Withdrawal initiated successfully',
          conversation_id: b2cResult.ConversationID
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    } else {
      // Rollback the withdrawal
      await supabase.rpc('rollback_mpesa_withdrawal', { tx: transactionId })
      
      throw new Error(b2cResult.errorMessage || 'B2C request failed')
    }

  } catch (error) {
    console.error('B2C error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})