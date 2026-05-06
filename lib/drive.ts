import { google } from 'googleapis';
import { Readable } from 'stream';
import { getDriveOAuthClient } from './google-drive-oauth';

export async function uploadToDrive(
  pdfBuffer: Buffer,
  filename: string,
  folderId: string
): Promise<string> {
  const auth = getDriveOAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  // Convert buffer to readable stream
  const stream = new Readable();
  stream.push(pdfBuffer);
  stream.push(null);

  // Upload file — supportsAllDrives required for Shared Drives
  const uploadRes = await drive.files.create({
    supportsAllDrives: true,
    requestBody: {
      name: filename,
      mimeType: 'application/pdf',
      parents: [folderId],
    },
    media: {
      mimeType: 'application/pdf',
      body: stream,
    },
    fields: 'id',
  });

  const fileId = uploadRes.data.id;
  if (!fileId) throw new Error('Drive upload failed: no file ID returned');

  // Make file publicly viewable
  await drive.permissions.create({
    fileId,
    supportsAllDrives: true,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  });

  return `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
}
