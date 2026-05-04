import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { renderToBuffer } from '@react-pdf/renderer';
import { InvoicePDFDocument } from '@/components/InvoicePDFDocument';
import { InvoiceData } from '@/lib/types';
import { uploadToDrive } from '@/lib/drive';
import { determineFolder, updateInvoiceUrl } from '@/lib/tracking-sheet';
import React from 'react';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const data: InvoiceData = await req.json();

  // Check service account is configured
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64) {
    return NextResponse.json(
      { error: 'Google Service Account not configured. Please add GOOGLE_SERVICE_ACCOUNT_JSON_B64 to environment variables.' },
      { status: 503 }
    );
  }

  // 1. Generate PDF
  let pdfBuffer: Buffer;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pdfBuffer = await renderToBuffer(React.createElement(InvoicePDFDocument, { data }) as any);
  } catch (err) {
    console.error('PDF render error:', err);
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 });
  }

  // 2. Determine correct Drive folder from tracking sheet
  let folderResult;
  try {
    folderResult = await determineFolder(data.phoneNo);
  } catch (err) {
    console.error('Folder determination error:', err);
    return NextResponse.json(
      { error: 'Failed to access tracking sheet: ' + (err as Error).message },
      { status: 500 }
    );
  }

  if (!folderResult) {
    return NextResponse.json(
      { error: `Phone number ${data.phoneNo} not found in Diamond or Gold tracking sheet. Please check the tracking sheet.` },
      { status: 404 }
    );
  }

  // 3. Upload PDF to Drive
  const filename = `${data.invoiceNumber.replace(/\//g, '-')}.pdf`;
  let fileUrl: string;
  try {
    fileUrl = await uploadToDrive(pdfBuffer, filename, folderResult.folderId);
  } catch (err) {
    console.error('Drive upload error:', err);
    return NextResponse.json(
      { error: 'Drive upload failed: ' + (err as Error).message },
      { status: 500 }
    );
  }

  // 4. Save URL back to tracking sheet (non-blocking on failure)
  try {
    await updateInvoiceUrl(folderResult, fileUrl);
  } catch (err) {
    console.warn('Sheet URL update failed (non-critical):', err);
    // Still return success — file is uploaded, URL saved is optional
  }

  return NextResponse.json({
    success: true,
    fileUrl,
    folder: folderResult.folderName,
    filename,
  });
}
