import '@supabase/functions-js/edge-runtime.d.ts'
import { getAuthenticatedUser } from '../_shared/auth.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM_EMAIL = 'Clavis <noreply@clavis.com.my>'
const TO_EMAIL = 'support@clavis.com.my'

// Restrict CORS to the app origin (no wildcard). Both the landing page and the
// in-app form are served from APP_URL, so a single allowed origin covers both.
const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_URL') ?? '',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Cloudflare Turnstile secret for verifying the public (landing) path.
// When unset, the landing path is rejected outright rather than left as an open relay.
const TURNSTILE_SECRET_KEY = Deno.env.get('TURNSTILE_SECRET_KEY')
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

// Best-effort per-IP rate limiting (in-memory, per edge instance). Limits abusive
// bursts of submissions from a single source without requiring a DB round-trip.
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 3
const rateLimitHits = new Map<string, number[]>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const windowStart = now - RATE_LIMIT_WINDOW_MS
  const recent = (rateLimitHits.get(ip) ?? []).filter((ts) => ts > windowStart)
  recent.push(now)
  rateLimitHits.set(ip, recent)
  return recent.length > RATE_LIMIT_MAX
}

function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'unknown'
}

/** Verify a Cloudflare Turnstile token against the siteverify endpoint. */
async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  if (!TURNSTILE_SECRET_KEY) return false
  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: ip,
      }),
    })
    const data = (await res.json()) as { success?: boolean }
    return data.success === true
  } catch (err) {
    console.error('Turnstile verification error:', err)
    return false
  }
}

interface ContactBody {
  name: string
  email: string
  subject: string
  message: string
  source?: 'landing' | 'app'
  priority?: boolean
  turnstileToken?: string
}

function validateBody(
  body: unknown,
): { valid: true; data: ContactBody } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') return { valid: false, error: 'Invalid request body' }
  const { name, email, subject, message } = body as Record<string, unknown>

  if (typeof name !== 'string' || name.trim().length === 0 || name.length > 100)
    return { valid: false, error: 'Invalid name' }
  if (
    typeof email !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254
  )
    return { valid: false, error: 'Invalid email' }
  if (typeof subject !== 'string' || subject.trim().length === 0 || subject.length > 200)
    return { valid: false, error: 'Invalid subject' }
  if (typeof message !== 'string' || message.trim().length === 0 || message.length > 5000)
    return { valid: false, error: 'Invalid message' }

  const { source, priority, turnstileToken } = body as Record<string, unknown>

  return {
    valid: true,
    data: {
      name: name.trim(),
      email: email.trim(),
      subject: subject.trim(),
      message: message.trim(),
      source: source === 'app' ? 'app' : 'landing',
      priority: priority === true,
      turnstileToken: typeof turnstileToken === 'string' ? turnstileToken : undefined,
    },
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"

function buildAdminEmail(
  name: string,
  email: string,
  subject: string,
  message: string,
  source: 'landing' | 'app',
  priority: boolean,
): string {
  const sourceLabel = source === 'app' ? 'In-App' : 'Landing Page'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <title>New Contact Form Submission</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;">
  <div style="display:none;font-size:1px;color:#f3f4f6;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${priority ? 'Priority: Yes | ' : ''}Source: ${sourceLabel} |
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;border-radius:8px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background-color:#7c3aed;padding:24px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-family:${FONT_STACK};font-size:20px;font-weight:700;color:#ffffff;">
                    <!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle"><![endif]-->
                    <img src="https://clavis.com.my/favicon-192.png" alt="" width="28" height="28" style="display:inline-block;vertical-align:middle;margin-right:8px;">
                    <!--[if mso]></td><td valign="middle"><![endif]-->
                    <span style="vertical-align:middle;">Clavis</span>
                    <!--[if mso]></td></tr></table><![endif]-->
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;padding:32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-family:${FONT_STACK};font-size:18px;font-weight:600;color:#1f2937;padding-bottom:24px;">
                    New Contact Form Submission
                  </td>
                </tr>
                <!-- Name -->
                <tr>
                  <td style="padding-bottom:16px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-family:${FONT_STACK};font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;padding-bottom:4px;">
                          Name
                        </td>
                      </tr>
                      <tr>
                        <td style="font-family:${FONT_STACK};font-size:16px;color:#1f2937;">
                          ${escapeHtml(name)}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- Email -->
                <tr>
                  <td style="padding-bottom:16px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-family:${FONT_STACK};font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;padding-bottom:4px;">
                          Email
                        </td>
                      </tr>
                      <tr>
                        <td style="font-family:${FONT_STACK};font-size:16px;color:#1f2937;">
                          <a href="mailto:${escapeHtml(email)}" style="color:#7c3aed;text-decoration:none;">${escapeHtml(email)}</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- Subject -->
                <tr>
                  <td style="padding-bottom:16px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-family:${FONT_STACK};font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;padding-bottom:4px;">
                          Subject
                        </td>
                      </tr>
                      <tr>
                        <td style="font-family:${FONT_STACK};font-size:16px;color:#1f2937;">
                          ${escapeHtml(subject)}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- Divider -->
                <tr>
                  <td style="padding:8px 0 24px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr><td style="border-top:1px solid #e5e7eb;font-size:0;line-height:0;">&nbsp;</td></tr>
                    </table>
                  </td>
                </tr>
                <!-- Message -->
                <tr>
                  <td style="padding-bottom:8px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-family:${FONT_STACK};font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;padding-bottom:4px;">
                          Message
                        </td>
                      </tr>
                      <tr>
                        <td style="font-family:${FONT_STACK};font-size:16px;color:#1f2937;line-height:1.6;">
                          ${escapeHtml(message).replace(/\n/g, '<br>')}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-family:${FONT_STACK};font-size:13px;color:#9ca3af;padding-bottom:4px;">
                    You can reply directly to this email to respond to ${escapeHtml(name)}.
                  </td>
                </tr>
                <tr>
                  <td style="font-family:${FONT_STACK};font-size:12px;color:#d1d5db;">
                    Clavis &mdash; Where Learning Feels Like Play
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function buildConfirmationEmail(
  name: string,
  subject: string,
  message: string,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <title>We've received your message</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;">
  <div style="display:none;font-size:1px;color:#f3f4f6;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    Thanks for reaching out! We'll get back to you as soon as possible.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;border-radius:8px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background-color:#7c3aed;padding:32px;text-align:center;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="font-family:${FONT_STACK};font-size:24px;font-weight:700;color:#ffffff;padding-bottom:8px;">
                    <!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle"><![endif]-->
                    <img src="https://clavis.com.my/favicon-192.png" alt="" width="32" height="32" style="display:inline-block;vertical-align:middle;margin-right:8px;">
                    <!--[if mso]></td><td valign="middle"><![endif]-->
                    <span style="vertical-align:middle;">Clavis</span>
                    <!--[if mso]></td></tr></table><![endif]-->
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-family:${FONT_STACK};font-size:14px;color:#e9d5ff;">
                    Where Learning Feels Like Play
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;padding:32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-family:${FONT_STACK};font-size:18px;font-weight:600;color:#1f2937;padding-bottom:16px;">
                    Hi ${escapeHtml(name)},
                  </td>
                </tr>
                <tr>
                  <td style="font-family:${FONT_STACK};font-size:16px;color:#374151;line-height:1.6;padding-bottom:16px;">
                    Thank you for reaching out to us! We've received your message and will get back to you as soon as possible.
                  </td>
                </tr>
                <!-- Divider -->
                <tr>
                  <td style="padding-bottom:24px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr><td style="border-top:1px solid #e5e7eb;font-size:0;line-height:0;">&nbsp;</td></tr>
                    </table>
                  </td>
                </tr>
                <!-- Subject -->
                <tr>
                  <td style="padding-bottom:16px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-family:${FONT_STACK};font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;padding-bottom:4px;">
                          Subject
                        </td>
                      </tr>
                      <tr>
                        <td style="font-family:${FONT_STACK};font-size:16px;color:#1f2937;">
                          ${escapeHtml(subject)}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- Divider -->
                <tr>
                  <td style="padding:8px 0 24px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr><td style="border-top:1px solid #e5e7eb;font-size:0;line-height:0;">&nbsp;</td></tr>
                    </table>
                  </td>
                </tr>
                <!-- Message -->
                <tr>
                  <td style="padding-bottom:24px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-family:${FONT_STACK};font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;padding-bottom:4px;">
                          Message
                        </td>
                      </tr>
                      <tr>
                        <td style="font-family:${FONT_STACK};font-size:16px;color:#1f2937;line-height:1.6;">
                          ${escapeHtml(message).replace(/\n/g, '<br>')}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb;padding:24px 32px;border-top:1px solid #e5e7eb;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="font-family:${FONT_STACK};font-size:13px;color:#9ca3af;padding-bottom:4px;">
                    Clavis &mdash; Where Learning Feels Like Play
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-family:${FONT_STACK};font-size:12px;color:#d1d5db;">
                    This is an automated confirmation. Please do not reply to this email.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  try {
    // Per-IP rate limit (abuse control) before any work or outbound email.
    const clientIp = getClientIp(req)
    if (isRateLimited(clientIp)) {
      return errorResponse('Too many requests. Please try again later.', 429)
    }

    const rawBody = await req.json()
    const validation = validateBody(rawBody)
    if (!validation.valid) {
      return new Response(JSON.stringify({ error: validation.error }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { name, email, subject, message, source, priority, turnstileToken } = validation.data

    // Abuse-control gate. The in-app path requires an authenticated user and uses
    // their verified email. The public landing path is protected primarily by the
    // per-IP rate limit above; a Cloudflare Turnstile token is verified WHEN PRESENT
    // (and rejected if invalid), but is not yet mandatory because the landing form
    // does not render the widget. To fully close the open-relay vector, add the
    // Turnstile widget to ContactSection.vue + VITE_TURNSTILE_SITE_KEY, set
    // TURNSTILE_SECRET_KEY here, then make a token required for source==='landing'.
    let recipientEmail = email
    if (source === 'app') {
      const user = await getAuthenticatedUser(req)
      if (user.email) {
        recipientEmail = user.email
      }
    } else if (turnstileToken) {
      const verified = await verifyTurnstile(turnstileToken, clientIp)
      if (!verified) {
        return errorResponse('Verification failed', 403)
      }
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [TO_EMAIL],
        reply_to: recipientEmail,
        subject: `[${name}] ${subject}`,
        html: buildAdminEmail(name, recipientEmail, subject, message, source, priority),
      }),
    })

    if (!res.ok) {
      const errorData = await res.json().catch(() => null)
      console.error('Resend API error:', res.status, errorData)
      return new Response(JSON.stringify({ error: 'Failed to send message' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const data = await res.json()

    // Send confirmation email to the verified recipient (non-blocking).
    // `recipientEmail` is either the authenticated user's verified email (app path)
    // or a CAPTCHA-gated submitted email (landing path) — never an arbitrary,
    // unverified address, so this is no longer an open relay.
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [recipientEmail],
        subject: `We've received your message — ${subject}`,
        html: buildConfirmationEmail(name, subject, message),
      }),
    }).catch((err) => console.error('Confirmation email error:', err))

    return new Response(JSON.stringify({ success: true, id: data.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    // getAuthenticatedUser throws a Response (e.g. 401) — propagate it as-is.
    if (error instanceof Response) return error
    console.error('send-contact-email error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
