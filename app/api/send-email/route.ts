import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { renderToBuffer } from '@react-pdf/renderer';
import { InvoicePDFDocument } from '@/components/InvoicePDFDocument';
import { InvoiceData } from '@/lib/types';
import nodemailer from 'nodemailer';
import React from 'react';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const data: InvoiceData = await req.json();

  if (!data.email) {
    return NextResponse.json({ error: 'No email address found for this student' }, { status: 400 });
  }

  let pdfBuffer: Buffer;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pdfBuffer = await renderToBuffer(React.createElement(InvoicePDFDocument, { data }) as any);
  } catch (err) {
    console.error('PDF render error:', err);
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 });
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  const filename = `${data.invoiceNumber.replace(/\//g, '-')}.pdf`;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: data.email,
      subject: `Invoice ${data.invoiceNumber} - My Health School`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <p>Dear <strong>${data.clientName}</strong>,</p>
          <p>Please find attached your invoice <strong>${data.invoiceNumber}</strong> from My Health School.</p>
          <p>Invoice Details:</p>
          <ul>
            <li>Invoice Number: ${data.invoiceNumber}</li>
            <li>Invoice Date: ${data.invoiceDate}</li>
            <li>Amount: ₹${data.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</li>
          </ul>
          <p>Thank you for choosing My Health School.</p>
          <br/>
          <p>Regards,<br/>
          <strong>My Health School Team</strong><br/>
          📞 9524444664<br/>
          ✉️ support@myhealthschool.in</p>
        </div>
      `,
      attachments: [{ filename, content: pdfBuffer, contentType: 'application/pdf' }],
    });
  } catch (err) {
    console.error('Email send error:', err);
    return NextResponse.json({ error: 'Failed to send email: ' + (err as Error).message }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: `Invoice sent to ${data.email}` });
}
