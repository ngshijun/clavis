import Stripe from 'stripe'

export const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2026-02-25.clover',
  httpClient: Stripe.createFetchHttpClient(),
})

export const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!

// APP_URL is required for both CORS allowed-origin and redirect URL construction.
// Fail fast at module load if it is unset, instead of degrading to an empty
// allowed-origin string that produces opaque browser CORS failures across the
// subscription UI.
const allowedOrigin = Deno.env.get('APP_URL')
if (!allowedOrigin) {
  throw new Error('Missing required env APP_URL')
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Create a sanitized error JSON response.
 * Logs the full error server-side but returns a generic message to the client.
 */
export function errorResponse(
  message: string,
  status: number,
  error?: unknown
): Response {
  if (error) {
    console.error(message, error)
  }
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
