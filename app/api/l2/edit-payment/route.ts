import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/google-auth';

const L2_ACCOUNTS_SHEET_ID = process.env.L2_ACCOUNTS_SHEET_ID!;

// Column letter → 0-based index
function colLetterToIndex(col: string): number {
  let idx = 0;
  for (let i = 0; i < col.length; i++) {
    idx = idx * 26 + (col.charCodeAt(i) - 64);
  }
  return idx - 1;
}

// 0-based index → A1 notation letter
function colIndexToLetter(idx: number): string {
  let result = '';
  let n = idx + 1;
  while (n > 0) {
    n--;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

// Gateway column mapping — must match l2-payment-gateway.ts
const GATEWAY_COLUMNS: Record<string, { tabName: string; amountCol: number; dateCol: number }> = {
  'ICICI':    { tabName: 'ICICI',        amountCol: colLetterToIndex('I'),  dateCol: colLetterToIndex('L')  },
  'Razorpay': { tabName: 'Razorpay',     amountCol: colLetterToIndex('E'),  dateCol: colLetterToIndex('V')  },
  'Tagmango': { tabName: 'Tagmamgo',     amountCol: colLetterToIndex('Z'),  dateCol: colLetterToIndex('BB') },
  'Savein':   { tabName: 'Savein',       amountCol: colLetterToIndex('P'),  dateCol: colLetterToIndex('K')  },
  'Bajaj':    { tabName: 'Bajaj Sheet',  amountCol: colLetterToIndex('AN'), dateCol: colLetterToIndex('AS') },
  'Jodo':     { tabName: 'Jodo',         amountCol: colLetterToIndex('K'),  dateCol: colLetterToIndex('M')  },
  'Phonepay': { tabName: 'Phonepay',     amountCol: colLetterToIndex('M'),  dateCol: colLetterToIndex('T')  },
};

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { gateway, rowIndex, newAmount, newDate } = body as {
    gateway: string;
    rowIndex: number;  // 1-based row number (as displayed)
    newAmount?: string;
    newDate?: string;
  };

  if (!gateway || !rowIndex) {
    return NextResponse.json({ error: 'Missing gateway or rowIndex' }, { status: 400 });
  }

  const config = GATEWAY_COLUMNS[gateway];
  if (!config) {
    return NextResponse.json({ error: `Unknown gateway: ${gateway}` }, { status: 400 });
  }

  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const updates: { range: string; values: string[][] }[] = [];

  if (newAmount !== undefined) {
    const amountCell = `'${config.tabName}'!${colIndexToLetter(config.amountCol)}${rowIndex}`;
    updates.push({ range: amountCell, values: [[newAmount]] });
  }

  if (newDate !== undefined) {
    const dateCell = `'${config.tabName}'!${colIndexToLetter(config.dateCol)}${rowIndex}`;
    updates.push({ range: dateCell, values: [[newDate]] });
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: 'No changes to update' }, { status: 400 });
  }

  try {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: L2_ACCOUNTS_SHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: updates,
      },
    });

    console.log(`[L2] Payment edited: ${gateway} row ${rowIndex} — amount=${newAmount}, date=${newDate}`);

    return NextResponse.json({
      success: true,
      message: `Payment updated in ${gateway} row ${rowIndex}`,
    });
  } catch (err) {
    console.error('Payment edit error:', err);
    return NextResponse.json(
      { error: 'Failed to update payment: ' + (err as Error).message },
      { status: 500 }
    );
  }
}
