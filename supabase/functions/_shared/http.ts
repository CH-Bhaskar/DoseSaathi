/* Small HTTP response helpers for the Edge Functions. Pure — the
 * Response constructor is available in Deno and in Node 18+. */

export function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function twimlResponse(twiml: string): Response {
  return new Response(twiml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}

/** Parse a Twilio webhook body (application/x-www-form-urlencoded). */
export async function parseTwilioBody(req: Request): Promise<URLSearchParams> {
  const text = await req.text()
  return new URLSearchParams(text)
}
