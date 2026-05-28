/**
 * Google OAuth2 Refresh Token Generator
 *
 * Usage:  node scripts/get-refresh-token.js
 *
 * 1. Opens a browser URL — sign in with the Google account that owns Drive folders
 * 2. Grant permission → Google redirects back with a code
 * 3. Script exchanges the code for a refresh token
 * 4. Copy the refresh token to .env.local and Vercel
 */

const http = require('http');
const { google } = require('googleapis');

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in .env.local first');
  process.exit(1);
}
const PORT = 3333;
const REDIRECT_URI = `http://localhost:${PORT}`;

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/drive'],
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    console.error('\n❌ Authorization denied:', error);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h2>Authorization denied. Please try again.</h2>');
    setTimeout(() => process.exit(1), 500);
    return;
  }

  if (!code) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<p>Waiting for authorization...</p>');
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log('\n✅ SUCCESS!\n');
    console.log('=== NEW REFRESH TOKEN ===');
    console.log(tokens.refresh_token);
    console.log('=========================\n');
    console.log('Update GOOGLE_OAUTH_REFRESH_TOKEN in:');
    console.log('  1. .env.local (local dev)');
    console.log('  2. Vercel Environment Variables (production)\n');

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <html><body style="font-family:sans-serif;text-align:center;padding:40px">
        <h2 style="color:green">✅ Refresh Token Generated!</h2>
        <p>Check your terminal for the token.</p>
        <p style="color:gray">You can close this tab.</p>
      </body></html>
    `);
  } catch (err) {
    console.error('\n❌ Token exchange failed:', err.message);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h2>Token exchange failed: ' + err.message + '</h2>');
  }

  setTimeout(() => { server.close(); process.exit(0); }, 1000);
});

server.listen(PORT, () => {
  console.log('\n🔑 Google OAuth2 Refresh Token Generator');
  console.log('=========================================\n');
  console.log('Opening browser for authorization...\n');
  console.log('If the browser does not open, visit this URL:\n');
  console.log(authUrl);
  console.log('\nSign in with the Google account that owns the Drive folders.');
  console.log(`Waiting for callback on http://localhost:${PORT} ...\n`);

  // Open in default browser (Windows)
  const { exec } = require('child_process');
  exec(`start "" "${authUrl}"`);
});
