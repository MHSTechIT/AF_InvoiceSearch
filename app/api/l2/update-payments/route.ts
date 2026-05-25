import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { PaymentMatch } from '@/lib/types';
import { findL2Student, writePaymentsToTracker } from '@/lib/l2-tracker-sheet';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { phone, payments } = body as {
    phone: string;
    payments: PaymentMatch[];
  };

  if (!phone || !payments || payments.length === 0) {
    return NextResponse.json({ error: 'Missing phone or payments' }, { status: 400 });
  }

  // 1. Find the student record to get tab + row
  const student = await findL2Student(phone);
  if (!student) {
    return NextResponse.json(
      { error: `Phone number ${phone} not found in L2 tracker` },
      { status: 404 }
    );
  }

  // 2. Write all payments to tracker sheet (cols P–AD)
  try {
    await writePaymentsToTracker(
      student.tabName,
      student.rowIndex,
      payments.map(p => ({ gateway: p.gateway, date: p.date, amount: p.amount }))
    );
  } catch (err) {
    console.error('Payment write-back error:', err);
    return NextResponse.json(
      { error: 'Failed to update payments: ' + (err as Error).message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    message: `${payments.length} payment(s) updated to ${student.tabName} row ${student.rowIndex + 1}`,
    studentName: student.name,
    tab: student.tabName,
  });
}
