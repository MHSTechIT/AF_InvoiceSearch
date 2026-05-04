import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { renderToBuffer } from '@react-pdf/renderer';
import { InvoicePDFDocument } from '@/components/InvoicePDFDocument';
import { InvoiceData } from '@/lib/types';
import React from 'react';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const data: InvoiceData = await req.json();

  let buffer: Buffer;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    buffer = await renderToBuffer(React.createElement(InvoicePDFDocument, { data }) as any);
  } catch (err) {
    console.error('PDF render error:', err);
    return NextResponse.json({ error: 'PDF generation failed: ' + (err as Error).message }, { status: 500 });
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${data.invoiceNumber.replace(/\//g, '-')}.pdf"`,
    },
  });
}
