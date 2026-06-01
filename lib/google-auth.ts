import { google } from 'googleapis';

let cachedAuth: InstanceType<typeof google.auth.GoogleAuth> | null = null;

export function getGoogleAuth() {
  if (cachedAuth) return cachedAuth;

  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64;
  if (!b64) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON_B64 env var is not set');

  const credentials = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));

  cachedAuth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/spreadsheets',
    ],
  });

  return cachedAuth;
}

// ─── Retry wrapper for Google API calls (handles quota/rate limits) ─────────
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const message = (err as Error)?.message || '';
      const isQuotaError = message.includes('Quota exceeded') || message.includes('RATE_LIMIT') || message.includes('rate limit');
      if (!isQuotaError || attempt === maxRetries) throw err;
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
      console.warn(`[Retry] Quota exceeded, waiting ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Unreachable');
}
