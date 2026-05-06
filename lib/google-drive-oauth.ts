import { google } from 'googleapis';

let cachedClient: ReturnType<typeof google.auth.fromClient> | null = null;

export function getDriveOAuthClient() {
  if (cachedClient) return cachedClient;

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
  });

  cachedClient = oauth2Client;
  return cachedClient;
}
