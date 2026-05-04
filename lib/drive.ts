import { google } from 'googleapis';
import { Readable } from 'stream';
import { getGoogleAuth } from './google-auth';

export async function uploadToDrive(
  pdfBuffer: Buffer,
  filename: string,
  folderId: string
): Promise<string> {
  const auth = getGoogleAuth();
  const drive = google.drive({ version: 'v3', auth });

  // Convert buffer to readable stream
  const stream = new Readable();
  stream.push(pdfBuffer);
  stream.push(null);

  // Upload file
  const uploadRes = await drive.files.create({
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
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  });

  return `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
}
