import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { renderToBuffer } from '@react-pdf/renderer';
import { InvoicePDFDocument } from '@/components/InvoicePDFDocument';
import { InvoiceData } from '@/lib/types';
import { uploadToDrive } from '@/lib/drive';
import { determineFolder, updateInvoiceUrl, writeL2InvoiceToTrackingSheet } from '@/lib/tracking-sheet';
import { writeInvoiceUrlToSheet3 } from '@/lib/l2-tracker-sheet';
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
  let folderId: string;
  let folderName: string;
  let folderResult;

  try {
    folderResult = await determineFolder(data.phoneNo);
    if (folderResult) {
      folderId = folderResult.folderId;
      folderName = folderResult.folderName;
    } else {
      // Fallback: use batch from invoice data to pick folder
      const isGold = (data.batch || '').toLowerCase().includes('gold');
      folderId = isGold
        ? process.env.DRIVE_FOLDER_GOLD_ID!
        : process.env.DRIVE_FOLDER_DIAMOND_ID!;
      folderName = isGold ? 'Gold' : 'Diamond';
    }
  } catch (err) {
    console.warn('Folder determination error, using fallback:', (err as Error).message);
    // Fallback: use batch from invoice data
    const isGold = (data.batch || '').toLowerCase().includes('gold');
    folderId = isGold
      ? process.env.DRIVE_FOLDER_GOLD_ID!
      : process.env.DRIVE_FOLDER_DIAMOND_ID!;
    folderName = isGold ? 'Gold' : 'Diamond';
  }

  // 3. Upload PDF to Drive
  const filename = `${data.invoiceNumber.replace(/\//g, '-')} - ${data.clientName}.pdf`;
  let fileUrl: string;
  try {
    fileUrl = await uploadToDrive(pdfBuffer, filename, folderId);
  } catch (err) {
    console.error('Drive upload error:', err);
    return NextResponse.json(
      { error: 'Drive upload failed: ' + (err as Error).message },
      { status: 500 }
    );
  }

  // 4. Save URL back to tracking sheet(s) — non-blocking on failure
  let urlSaved = false;

  // Try main tracking sheet first
  if (folderResult) {
    try {
      await updateInvoiceUrl(folderResult, fileUrl);
      urlSaved = true;
    } catch (err) {
      console.warn('Main tracking sheet URL update failed:', err);
    }
  }

  // Also try L2 confirmation sheet (Sheet 3) and L2 tracking sheet
  try {
    await writeInvoiceUrlToSheet3(data.phoneNo, fileUrl);
    urlSaved = true;
  } catch (err) {
    console.warn('L2 Sheet 3 URL write failed:', err);
  }

  try {
    await writeL2InvoiceToTrackingSheet(data.phoneNo, fileUrl, data.invoiceNumber, data.invoiceDate);
    urlSaved = true;
  } catch (err) {
    console.warn('L2 tracking sheet URL write failed:', err);
  }

  return NextResponse.json({
    success: true,
    fileUrl,
    folder: folderName,
    filename,
    urlSaved,
  });
}
