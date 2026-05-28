import { google } from 'googleapis';
import { Readable } from 'stream';
import { getGoogleAuth } from './google-auth';

/**
 * Search for an existing file by name in a folder.
 * Returns the file ID if found, null otherwise.
 */
async function findExistingFile(
  drive: ReturnType<typeof google.drive>,
  filename: string,
  folderId: string
): Promise<string | null> {
  try {
    const res = await drive.files.list({
      q: `name='${filename.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`,
      fields: 'files(id)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    const files = res.data.files ?? [];
    return files.length > 0 ? files[0].id! : null;
  } catch (err) {
    console.warn('Drive file search failed, will create new:', (err as Error).message);
    return null;
  }
}

export async function uploadToDrive(
  pdfBuffer: Buffer,
  filename: string,
  folderId: string
): Promise<string> {
  const auth = getGoogleAuth();
  const drive = google.drive({ version: 'v3', auth });

  // Check if file with same name already exists in the folder
  const existingFileId = await findExistingFile(drive, filename, folderId);

  let fileId: string;

  if (existingFileId) {
    // UPDATE existing file content (no duplicate)
    const stream = new Readable();
    stream.push(pdfBuffer);
    stream.push(null);

    const updateRes = await drive.files.update({
      fileId: existingFileId,
      supportsAllDrives: true,
      media: {
        mimeType: 'application/pdf',
        body: stream,
      },
      fields: 'id',
    });

    fileId = updateRes.data.id!;
    console.log(`[Drive] Updated existing file ${fileId} (${filename})`);
  } else {
    // CREATE new file
    const stream = new Readable();
    stream.push(pdfBuffer);
    stream.push(null);

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

    fileId = uploadRes.data.id!;
    if (!fileId) throw new Error('Drive upload failed: no file ID returned');

    // Make file publicly viewable (only for new files)
    await drive.permissions.create({
      fileId,
      supportsAllDrives: true,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    console.log(`[Drive] Created new file ${fileId} (${filename})`);
  }

  return `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
}
