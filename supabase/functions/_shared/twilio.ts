/* Minimal typed Twilio client, built on fetch.
 *
 * Credentials come ONLY from server environment variables
 * (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER) and
 * are never logged, never returned, and never reach frontend code.
 * When credentials are absent, createCall() returns an honest
 * `provider_not_configured` error — the system never fakes a call. */

export interface TwilioConfig {
  accountSid: string
  authToken: string
  fromNumber: string
}

export interface TwilioCallResult {
  ok: boolean
  /** Twilio Call SID, when a call was actually created. */
  callSid: string | null
  error: string | null
}

/** Read the Twilio config from the function environment. Returns null
 * when any credential is missing. */
export function twilioConfigFromEnv(
  getEnv: (key: string) => string | undefined,
): TwilioConfig | null {
  const accountSid = getEnv('TWILIO_ACCOUNT_SID')
  const authToken = getEnv('TWILIO_AUTH_TOKEN')
  const fromNumber = getEnv('TWILIO_PHONE_NUMBER')
  if (!accountSid || !authToken || !fromNumber) return null
  return { accountSid, authToken, fromNumber }
}

/** Create an outbound call. MachineDetection is enabled so voicemail
 * can be told apart from a human answer (call-status maps AnsweredBy
 * to the 'voicemail' status). */
export async function createTwilioCall(
  config: TwilioConfig,
  input: {
    toNumber: string
    twimlUrl: string
    statusCallbackUrl: string
  },
): Promise<TwilioCallResult> {
  const url =
    `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Calls.json`
  const body = new URLSearchParams({
    To: input.toNumber,
    From: config.fromNumber,
    Url: input.twimlUrl,
    StatusCallback: input.statusCallbackUrl,
    StatusCallbackEvent: 'initiated ringing answered completed',
    MachineDetection: 'DetectMessageEnd',
    AsyncAmd: 'true',
  })
  const credentials = btoa(`${config.accountSid}:${config.authToken}`)
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    })
  } catch (error) {
    return {
      ok: false,
      callSid: null,
      error: error instanceof Error ? error.message : 'network_error',
    }
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    return {
      ok: false,
      callSid: null,
      error: `twilio_${response.status}: ${text.slice(0, 200)}`,
    }
  }
  const data = (await response.json()) as { sid?: unknown }
  if (typeof data.sid !== 'string' || data.sid.length === 0) {
    return { ok: false, callSid: null, error: 'twilio_no_sid' }
  }
  return { ok: true, callSid: data.sid, error: null }
}
