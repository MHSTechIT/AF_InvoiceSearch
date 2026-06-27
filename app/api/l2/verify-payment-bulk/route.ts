import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { L2StudentRecord, PaymentMatch } from '@/lib/types';
import { findL2StudentsForPhones, findExistingInvoiceUrlsForPhones } from '@/lib/l2-tracker-sheet';
import { searchPaymentsForPhones } from '@/lib/l2-payment-gateway';

interface BulkResult {
  phone: string;                     // normalized phone as searched
  student: L2StudentRecord | null;
  payments: PaymentMatch[];
  existingInvoiceUrl: string | null;
  error?: string;
}

function normalizePhone(phone: string): string {
  return phone.replace(/\s+/g, '').replace(/[^0-9]/g, '');
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const rawPhones = (body?.phones ?? []) as string[];
  if (!Array.isArray(rawPhones) || rawPhones.length === 0) {
    return NextResponse.json({ error: 'No phone numbers provided' }, { status: 400 });
  }

  // Normalize, validate (10–12 digits), dedupe — preserve first-seen order
  const seen = new Set<string>();
  const phones: string[] = [];
  const invalid: string[] = [];
  for (const raw of rawPhones) {
    const p = normalizePhone(String(raw));
    if (p.length < 10 || p.length > 12) { invalid.push(String(raw)); continue; }
    if (seen.has(p)) continue;
    seen.add(p);
    phones.push(p);
  }

  if (phones.length === 0) {
    return NextResponse.json(
      { error: 'No valid 10–12 digit phone numbers found in the file', invalid },
      { status: 400 }
    );
  }

  // Fetch each data source ONCE, match all phones in memory
  let studentsMap: Map<string, L2StudentRecord>;
  let paymentsMap: Map<string, PaymentMatch[]>;
  let urlsMap: Map<string, string>;
  try {
    [studentsMap, paymentsMap, urlsMap] = await Promise.all([
      findL2StudentsForPhones(phones),
      searchPaymentsForPhones(phones),
      findExistingInvoiceUrlsForPhones(phones),
    ]);
  } catch (err) {
    console.error('Bulk verify error:', err);
    return NextResponse.json(
      { error: 'Failed to search sheets: ' + (err as Error).message },
      { status: 500 }
    );
  }

  const results: BulkResult[] = phones.map(phone => {
    const student = studentsMap.get(phone) ?? null;
    const payments = paymentsMap.get(phone) ?? [];
    const existingInvoiceUrl = urlsMap.get(phone) ?? null;
    const error = !student && payments.length === 0 ? 'Not found in tracker and no payments' : undefined;
    return { phone, student, payments, existingInvoiceUrl, error };
  });

  return NextResponse.json({ results, invalidCount: invalid.length, total: phones.length });
}
