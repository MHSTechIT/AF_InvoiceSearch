import { getGoogleAuth } from './google-auth';

// Use Service Account for Drive uploads (never expires, unlike OAuth2 refresh tokens).
// The service account already has drive scope configured in google-auth.ts.
// The target Drive folders must be shared with the service account email.

export function getDriveOAuthClient() {
  return getGoogleAuth();
}
