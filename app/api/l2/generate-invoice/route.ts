import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { renderToBuffer } from '@react-pdf/renderer';
import { InvoicePDFDocument } from '@/components/InvoicePDFDocument';
import { PaymentMatch } from '@/lib/types';
import { findL2Student, writeInvoiceToTracker, writeInvoiceUrlToSheet3, writePaymentsToTracker } from '@/lib/l2-tracker-sheet';
import { buildL2InvoiceData } from '@/lib/l2-invoice-calc';
import { writeL2InvoiceToTrackingSheet } from '@/lib/tracking-sheet';
import { uploadToDrive } from '@/lib/drive';
import React from 'react';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { phone, selectedPayment, allPayments, editInvoiceNumber, editInvoiceDate } = body as {
    phone: string;
    selectedPayment: PaymentMatch;
    allPayments?: PaymentMatch[];
    editInvoiceNumber?: string;
    editInvoiceDate?: string;
  };

  if (!phone || !selectedPayment) {
    return NextResponse.json({ error: 'Missing phone or selectedPayment' }, { status: 400 });
  }

  // 1. Find the student record
  const student = await findL2Student(phone);
  if (!student) {
    return NextResponse.json(
      { error: `Phone number ${phone} not found in L2 tracker` },
      { status: 404 }
    );
  }

  // 2. Get invoice number from sheet column M (or from edit override)
  const invoiceNumber = editInvoiceNumber?.trim() || student.existingInvoiceNumber?.trim();
  if (!invoiceNumber) {
    return NextResponse.json(
      { error: 'No invoice number found in column M of tracker sheet. Please add the invoice number to the sheet first.' },
      { status: 400 }
    );
  }

  // 3. Build invoice data (pass allPayments to split app fees + course fees)
  const invoiceData = buildL2InvoiceData(student, selectedPayment, invoiceNumber, allPayments, editInvoiceDate);

  // 5. Generate PDF
  let pdfBuffer: Buffer;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pdfBuffer = await renderToBuffer(React.createElement(InvoicePDFDocument, { data: invoiceData }) as any);
  } catch (err) {
    console.error('PDF render error:', err);
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 });
  }

  // 6. Determine correct Drive folder — use student's L2 batch directly
  //    (more reliable than checking main tracking sheet which may not have this student)
  const isGold = student.batch === 'Gold';
  const folderId = isGold
    ? process.env.DRIVE_FOLDER_GOLD_ID!
    : process.env.DRIVE_FOLDER_DIAMOND_ID!;
  const folderName = isGold ? 'Gold' : 'Diamond';

  // 7. Upload PDF to Drive
  const filename = `${invoiceNumber.replace(/\//g, '-')} - ${student.name}.pdf`;
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

  // 8. Write invoice details to Sheet 2 (cols M, N, O) — non-blocking on failure
  try {
    await writeInvoiceToTracker(
      student.tabName,
      student.rowIndex,
      invoiceNumber,
      invoiceData.invoiceDate,
      String(invoiceData.total)
    );
  } catch (err) {
    console.warn('Sheet 2 invoice write failed (non-critical):', err);
  }

  // 9. Write verified payments to tracker (cols P–AD) — non-blocking on failure
  if (allPayments && allPayments.length > 0) {
    try {
      await writePaymentsToTracker(
        student.tabName,
        student.rowIndex,
        allPayments.map(p => ({ gateway: p.gateway, date: p.date, amount: p.amount }))
      );
    } catch (err) {
      console.warn('Payment write-back failed (non-critical):', err);
    }
  }

  // 10. Write invoice URL to Sheet 3 (col P) — non-blocking on failure
  try {
    await writeInvoiceUrlToSheet3(phone, fileUrl);
  } catch (err) {
    console.warn('Sheet 3 URL write failed (non-critical):', err);
  }

  // 11. Write invoice URL + number + date to main Tracking Sheet — non-blocking
  try {
    await writeL2InvoiceToTrackingSheet(phone, fileUrl, invoiceNumber, invoiceData.invoiceDate);
  } catch (err) {
    console.warn('Tracking sheet invoice write failed (non-critical):', err);
  }

  return NextResponse.json({
    success: true,
    invoiceNumber,
    invoiceDate: invoiceData.invoiceDate,
    invoiceAmount: String(invoiceData.total),
    driveUrl: fileUrl,
    folder: folderName,
    invoiceData,
  });
}
