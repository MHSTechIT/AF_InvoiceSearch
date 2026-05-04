import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { findByInvoiceNumber, findByPhoneNumber, toSummary } from '@/lib/sheets';
import { buildInvoiceData } from '@/lib/invoice-calc';

function isPhoneNumber(query: string): boolean {
  return /^\d{10}$/.test(query.trim());
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const query = req.nextUrl.searchParams.get('query') ?? req.nextUrl.searchParams.get('number') ?? '';
  if (!query) return NextResponse.json({ error: 'Search query required' }, { status: 400 });

  // Phone number search → may return multiple invoices
  if (isPhoneNumber(query)) {
    const rows = await findByPhoneNumber(query);
    if (rows.length === 0)
      return NextResponse.json({ error: 'No invoices found for this mobile number' }, { status: 404 });

    if (rows.length === 1) {
      // Single result — return invoice directly
      return NextResponse.json({ type: 'single', data: buildInvoiceData(rows[0]) });
    }

    // Multiple results — return summary list for grid
    return NextResponse.json({ type: 'multiple', results: rows.map(toSummary) });
  }

  // Invoice number search → direct lookup
  const row = await findByInvoiceNumber(query);
  if (!row) return NextResponse.json({ error: 'Invoice not found for number: ' + query }, { status: 404 });

  return NextResponse.json({ type: 'single', data: buildInvoiceData(row) });
}
