import { google } from 'googleapis';
import { getGoogleAuth, withRetry } from './google-auth';
import { PaymentMatch } from './types';

const L2_ACCOUNTS_SHEET_ID = process.env.L2_ACCOUNTS_SHEET_ID!;

// ─── Column letter → 0-based index conversion ──────────────────────────────
// A=0, B=1, ..., Z=25, AA=26, AB=27, ..., AZ=51, BA=52, BB=53, ...
function colLetterToIndex(col: string): number {
  let idx = 0;
  for (let i = 0; i < col.length; i++) {
    idx = idx * 26 + (col.charCodeAt(i) - 64); // A=65
  }
  return idx - 1; // 0-based
}

// 0-based index → A1 notation letter
function colIndexToLetter(idx: number): string {
  let result = '';
  let n = idx + 1; // 1-based
  while (n > 0) {
    n--;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

// ─── Gateway Configuration ──────────────────────────────────────────────────
interface GatewayConfig {
  tabName: string;
  phoneCols: number[];   // 0-based column indices
  amountCol: number;     // 0-based
  dateCol: number;       // 0-based
  categoryCol: number;   // 0-based — "Category" column for L2 filtering
  label: string;         // Display name
}

// L2 category prefixes to include (002=Application, 003=Diamond, 004=Gold, 005=EMI)
const L2_CATEGORY_PREFIXES = ['002', '003', '004', '005'];

const GATEWAYS: GatewayConfig[] = [
  {
    label: 'ICICI',
    tabName: 'ICICI',
    phoneCols: [colLetterToIndex('J'), colLetterToIndex('N')],   // J=9, N=13
    amountCol: colLetterToIndex('I'),                             // I=8
    dateCol: colLetterToIndex('L'),                               // L=11
    categoryCol: colLetterToIndex('K'),                           // K=10
  },
  {
    label: 'Razorpay',
    tabName: 'Razorpay',
    phoneCols: [colLetterToIndex('Q')],                           // Q=16
    amountCol: colLetterToIndex('E'),                             // E=4
    dateCol: colLetterToIndex('V'),                               // V=21
    categoryCol: colLetterToIndex('N'),                           // N=13
  },
  {
    label: 'Tagmango',
    tabName: 'Tagmamgo',
    phoneCols: [colLetterToIndex('C')],                           // C=2
    amountCol: colLetterToIndex('Z'),                             // Z=25
    dateCol: colLetterToIndex('BB'),                              // BB=53
    categoryCol: colLetterToIndex('AZ'),                          // AZ=51
  },
  {
    label: 'Savein',
    tabName: 'Savein',
    phoneCols: [colLetterToIndex('R'), colLetterToIndex('T')],   // R=17, T=19
    amountCol: colLetterToIndex('P'),                             // P=15
    dateCol: colLetterToIndex('K'),                               // K=10
    categoryCol: colLetterToIndex('Q'),                           // Q=16
  },
  {
    label: 'Bajaj',
    tabName: 'Bajaj Sheet',
    phoneCols: [colLetterToIndex('BU'), colLetterToIndex('BW')], // BU=72, BW=74
    amountCol: colLetterToIndex('AN'),                            // AN=39
    dateCol: colLetterToIndex('AS'),                              // AS=44
    categoryCol: colLetterToIndex('BV'),                          // BV=73
  },
  {
    label: 'Jodo',
    tabName: 'Jodo',
    phoneCols: [colLetterToIndex('F'), colLetterToIndex('S')],   // F=5, S=18
    amountCol: colLetterToIndex('K'),                             // K=10
    dateCol: colLetterToIndex('M'),                               // M=12
    categoryCol: colLetterToIndex('L'),                           // L=11
  },
  {
    label: 'Phonepay',
    tabName: 'Phonepay',
    phoneCols: [colLetterToIndex('R')],                           // R=17
    amountCol: colLetterToIndex('M'),                             // M=12
    dateCol: colLetterToIndex('T'),                               // T=19
    categoryCol: colLetterToIndex('S'),                           // S=18
  },
  {
    label: 'Pine Labs',
    tabName: 'Pine Labs',
    phoneCols: [colLetterToIndex('X'), colLetterToIndex('Y')],   // X=23 (Phone No), Y=24 (Alter No)
    amountCol: colLetterToIndex('V'),                             // V=21
    dateCol: colLetterToIndex('AB'),                              // AB=27 (Date)
    categoryCol: colLetterToIndex('W'),                           // W=22
  },
  {
    label: 'Paytm',
    tabName: 'Paytm',
    phoneCols: [colLetterToIndex('M'), colLetterToIndex('Q'), colLetterToIndex('R')], // M=12, Q=16, R=17
    amountCol: colLetterToIndex('O'),                             // O=14
    dateCol: colLetterToIndex('E'),                               // E=4 (Transaction_Date)
    categoryCol: colLetterToIndex('P'),                           // P=15
  },
  {
    label: 'Easebuzz',
    tabName: 'Easebuzz',
    phoneCols: [colLetterToIndex('E')],                           // E=4 (Customer Phone)
    amountCol: colLetterToIndex('B'),                             // B=1
    dateCol: colLetterToIndex('F'),                               // F=5 (Date of Transaction)
    categoryCol: colLetterToIndex('G'),                           // G=6
  },
];

// ─── Phone normalization (same as tracking-sheet.ts) ────────────────────────
function normalizePhone(phone: string): string {
  return phone.replace(/\s+/g, '').replace(/[^0-9]/g, '');
}

// ─── Normalize date to "DD MMM YYYY" format ────────────────────────────────
function normalizeDate(raw: string): string {
  if (!raw || !raw.trim()) return '';

  // Strip time component if present (e.g. "26/05/2026 00:00:00" → "26/05/2026")
  const trimmed = raw.trim().replace(/\s+\d{1,2}:\d{2}(:\d{2})?.*$/, '').trim();

  let d: Date | null = null;

  // Handle "12April2026" or "12 April 2026" — day + month name + year
  const noSepMatch = trimmed.match(/^(\d{1,2})\s*([A-Za-z]+)\s*(\d{4})$/);
  if (noSepMatch) {
    d = new Date(`${noSepMatch[2]} ${noSepMatch[1]}, ${noSepMatch[3]}`);
  }

  // Handle DD-MM-YYYY or DD/MM/YYYY
  if (!d || isNaN(d.getTime())) {
    const dmy = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmy) {
      d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    }
  }

  // Handle YYYY-MM-DD
  if (!d || isNaN(d.getTime())) {
    const ymd = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (ymd) {
      d = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
    }
  }

  // Fallback: let JS parse it
  if (!d || isNaN(d.getTime())) {
    d = new Date(trimmed);
  }

  if (!d || isNaN(d.getTime())) return raw.trim(); // return original if unparseable

  // Format as "DD MMM YYYY" (e.g. "28 May 2026")
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleDateString('en-IN', { month: 'short' });
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

// ─── Check if a category value is an L2 category ───────────────────────────
function isL2Category(category: string): boolean {
  const trimmed = category.trim();
  return L2_CATEGORY_PREFIXES.some(prefix => trimmed.startsWith(prefix));
}

// ─── Search a single gateway tab ────────────────────────────────────────────
async function searchGatewayTab(
  gateway: GatewayConfig,
  targetPhone: string
): Promise<PaymentMatch[]> {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  // Determine the widest column we need to read (include category column)
  const allCols = [...gateway.phoneCols, gateway.amountCol, gateway.dateCol, gateway.categoryCol];
  const maxCol = Math.max(...allCols);
  const endColLetter = colIndexToLetter(maxCol);

  const range = `'${gateway.tabName}'!A1:${endColLetter}`;

  let rows: string[][];
  try {
    const res = await withRetry(() =>
      sheets.spreadsheets.values.get({
        spreadsheetId: L2_ACCOUNTS_SHEET_ID,
        range,
      })
    );
    rows = (res.data.values ?? []) as string[][];
  } catch (err) {
    console.warn(`⚠ Failed to read gateway tab "${gateway.tabName}":`, (err as Error).message);
    return [];
  }

  if (rows.length < 2) return []; // no data rows

  const matches: PaymentMatch[] = [];
  const target = normalizePhone(targetPhone);

  // Start from row 1 (skip header row 0)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    // Filter by L2 category — skip rows that are not L2 (002/003/004/005)
    const category = String(row[gateway.categoryCol] ?? '').trim();
    if (!category || !isL2Category(category)) continue;

    // Check all phone columns for a match
    const phoneMatched = gateway.phoneCols.some(colIdx => {
      const cellValue = String(row[colIdx] ?? '').trim();
      if (!cellValue) return false;
      const cellNorm = normalizePhone(cellValue);
      return cellNorm === target || cellNorm.slice(-10) === target.slice(-10);
    });

    if (!phoneMatched) continue;

    // Extract amount and date
    const amount = String(row[gateway.amountCol] ?? '').trim();
    const date = normalizeDate(String(row[gateway.dateCol] ?? ''));

    // Skip rows where amount is empty or zero
    const numericAmount = parseFloat(amount.replace(/[^0-9.]/g, ''));
    if (!amount || isNaN(numericAmount) || numericAmount <= 0) continue;

    // Find the matched phone value for display
    let matchedPhone = '';
    for (const colIdx of gateway.phoneCols) {
      const cell = String(row[colIdx] ?? '').trim();
      if (cell && (normalizePhone(cell) === target || normalizePhone(cell).slice(-10) === target.slice(-10))) {
        matchedPhone = cell;
        break;
      }
    }

    matches.push({
      gateway: gateway.label,
      amount,
      date,
      phone: matchedPhone,
      rowIndex: i + 1, // 1-based for user display
    });
  }

  return matches;
}

// ─── Search gateways in batches (avoid API quota limits) ───────────────────
export async function searchPaymentsByPhone(phone: string): Promise<PaymentMatch[]> {
  const target = normalizePhone(phone);
  if (target.length < 10 || target.length > 12) return [];

  // Search in batches of 5 to avoid hitting Sheets API quota (60 reads/min)
  const BATCH_SIZE = 5;
  const allResults: PromiseSettledResult<PaymentMatch[]>[] = [];
  for (let i = 0; i < GATEWAYS.length; i += BATCH_SIZE) {
    const batch = GATEWAYS.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(gw => searchGatewayTab(gw, target))
    );
    allResults.push(...batchResults);
  }

  const allMatches: PaymentMatch[] = [];
  for (let i = 0; i < allResults.length; i++) {
    const result = allResults[i];
    if (result.status === 'fulfilled') {
      allMatches.push(...result.value);
    } else {
      console.warn(`⚠ Gateway "${GATEWAYS[i].label}" search failed:`, result.reason);
    }
  }

  // Sort by date (newest first)
  const MONTHS: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const parseDate = (s: string): number => {
    if (!s) return 0;
    // Dates are normalized to "DD MMM YYYY" (e.g. "12 Apr 2026")
    const m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
    if (m) {
      const mon = MONTHS[m[2].toLowerCase().slice(0, 3)];
      if (mon !== undefined) return new Date(Number(m[3]), mon, Number(m[1])).getTime();
    }
    // Fallback
    const d = new Date(s);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  };
  // Primary: oldest date first. Secondary: lowest amount first (so app fees come before course fees on same date)
  allMatches.sort((a, b) => {
    const dateDiff = parseDate(a.date) - parseDate(b.date);
    if (dateDiff !== 0) return dateDiff;
    const amtA = parseFloat(a.amount.replace(/[^0-9.]/g, '')) || 0;
    const amtB = parseFloat(b.amount.replace(/[^0-9.]/g, '')) || 0;
    return amtA - amtB;
  });

  return allMatches;
}

export { GATEWAYS, colLetterToIndex, colIndexToLetter };
