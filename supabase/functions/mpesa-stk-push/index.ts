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

    // Get Daraja access token
    const tokenResponse = await fetch('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
      headers: {
        'Authorization': `Basic ${btoa(`${Deno.env.get('DARAJA_CONSUMER_KEY')}:${Deno.env.get('DARAJA_CONSUMER_SECRET')}`)}`,
      },
    })

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    // Generate timestamp
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)
    
    // Generate password
    const password = btoa(`${Deno.env.get('DARAJA_SHORTCODE')}${Deno.env.get('DARAJA_PASSKEY')}${timestamp}`)

    // Create transaction record first
    const { data: transaction, error: txError } = await supabase
      .from('mpesa_transactions')
      .insert({
        user_id: user.id,
        transaction_type: 'deposit',
        amount: parseFloat(amount),
        phone_number: phone_number.replace(/^\+254/, '254'),
        status: 'pending'
      })
      .select()
      .single()

    if (txError) {
      console.error('Failed to create transaction:', txError)
      throw new Error('Failed to create transaction record')
    }

    // STK Push request
    const stkPushData = {
      BusinessShortCode: Deno.env.get('DARAJA_SHORTCODE'),
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: parseInt(amount),
      PartyA: phone_number.replace(/^\+254/, '254'),
      PartyB: Deno.env.get('DARAJA_SHORTCODE'),
      PhoneNumber: phone_number.replace(/^\+254/, '254'),
      CallBackURL: `${Deno.env.get('SUPABASE_URL')}/functions/v1/mpesa-callback`,
      AccountReference: `DEPOSIT_${transaction.id}`,
      TransactionDesc: 'Game deposit'
    }

    console.log('STK Push data:', stkPushData)

    const stkResponse = await fetch('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(stkPushData),
    })

    const stkResult = await stkResponse.json()
    console.log('STK Push response:', stkResult)

    if (stkResult.ResponseCode === '0') {
      // Update transaction with checkout request ID
      await supabase
        .from('mpesa_transactions')
        .update({
          checkout_request_id: stkResult.CheckoutRequestID,
          merchant_request_id: stkResult.MerchantRequestID
        })
        .eq('id', transaction.id)

      return new Response(
        JSON.stringify({
          success: true,
          message: 'STK push sent successfully',
          checkout_request_id: stkResult.CheckoutRequestID
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    } else {
      // Update transaction as failed
      await supabase
        .from('mpesa_transactions')
        .update({ status: 'failed', error_message: stkResult.errorMessage })
        .eq('id', transaction.id)

      throw new Error(stkResult.errorMessage || 'STK push failed')
    }

  } catch (error) {
    console.error('STK Push error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})