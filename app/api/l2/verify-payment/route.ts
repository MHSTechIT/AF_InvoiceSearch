import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { findL2Student, findExistingInvoiceUrl } from '@/lib/l2-tracker-sheet';
import { searchPaymentsByPhone } from '@/lib/l2-payment-gateway';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const phone = req.nextUrl.searchParams.get('phone') ?? '';
  if (!/^\d{10,12}$/.test(phone.trim())) {
    return NextResponse.json(
      { error: 'Please enter a valid 10 to 12-digit phone number' },
      { status: 400 }
    );
  }

  // Search student record, gateway payments, and existing invoice URL in parallel
  let student, payments, existingInvoiceUrl;
  try {
    [student, payments, existingInvoiceUrl] = await Promise.all([
      findL2Student(phone.trim()),
      searchPaymentsByPhone(phone.trim()),
      findExistingInvoiceUrl(phone.trim()),
    ]);
  } catch (err) {
    console.error('L2 verify-payment error:', err);
    return NextResponse.json(
      { error: 'Failed to search sheets: ' + (err as Error).message },
      { status: 500 }
    );
  }

  // If student not found AND no payments found, return 404
  if (!student && (!payments || payments.length === 0)) {
    return NextResponse.json(
      { error: `Phone number ${phone} not found in L2 Diamond or Gold Accounts and no payment records found` },
      { status: 404 }
    );
  }

  return NextResponse.json({
    student: student || null,   // null if not in tracker
    payments,
    existingInvoiceUrl,   // null if no invoice generated yet
  });
}
