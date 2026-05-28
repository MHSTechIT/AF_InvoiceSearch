import { google } from 'googleapis';
import { getGoogleAuth } from './google-auth';
import { L2StudentRecord } from './types';
// colIndexToLetter available from './l2-payment-gateway' if needed

const L2_TRACKER_SHEET_ID = process.env.L2_TRACKER_SHEET_ID!;     // Student records + invoice write-back
const L2_CONFIRMATION_SHEET_ID = process.env.L2_CONFIRMATION_SHEET_ID!;

// ─── L2 student tabs in the Tracker sheet ──────────────────────────────────
interface L2TabConfig {
  tabName: string;
  batch: string;   // Display label for the student card badge
}

const L2_TABS: L2TabConfig[] = [
  { tabName: process.env.L2_TAB_DIAMOND || 'L2 Diamond Accounts', batch: 'Diamond' },
  { tabName: process.env.L2_TAB_GOLD || 'L2 Gold Accounts',      batch: 'Gold' },
];

// ─── Phone normalization (same as tracking-sheet.ts) ────────────────────────
function normalizePhone(phone: string): string {
  return phone.replace(/\s+/g, '').replace(/[^0-9]/g, '').slice(-10);
}

// ─── Find a student by phone in a specific tab ──────────────────────────────
async function findStudentInTab(
  phone: string,
  tabName: string,
  batch: string
): Promise<L2StudentRecord | null> {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const range = `'${tabName}'!A:Z`;
  console.log(`[L2] Searching tab "${tabName}" in sheet ${L2_TRACKER_SHEET_ID} for phone ${phone}`);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: L2_TRACKER_SHEET_ID,
    range,
  });

  const rows = res.data.values ?? [];
  console.log(`[L2] Tab "${tabName}": ${rows.length} rows found`);
  if (rows.length < 2) return null;

  const headers = rows[0].map((h: string) => h.trim().toLowerCase());
  console.log(`[L2] Tab "${tabName}" headers:`, rows[0]);

  // Find phone column by header, fallback to column F (index 5) if header is blank
  let phoneColIdx = headers.findIndex(
    (h: string) => h === 'phone number' || h === 'phone no' || h === 'phone' || h === 'mobile' || h === 'mobile number'
  );
  if (phoneColIdx === -1) {
    // Fallback: column F (index 5) is consistently the phone column in L2 tracker sheets
    phoneColIdx = 5;
    console.log(`[L2] Phone column header not found in tab "${tabName}", using fallback col F (index 5)`);
  } else {
    console.log(`[L2] Phone column found at index ${phoneColIdx} (header: "${rows[0][phoneColIdx]}")`);
  }

  // Find other columns by header
  const nameColIdx = headers.findIndex(
    (h: string) => h === 'client name' || h === 'name' || h === 'student name'
  );
  const emailColIdx = headers.findIndex(
    (h: string) => h === 'email' || h === 'email id' || h === 'email address'
  );
  const addressColIdx = headers.findIndex(
    (h: string) => h === 'address' || h === 'addr'
  );
  const gstinColIdx = headers.findIndex(
    (h: string) => h === 'gstin' || h === 'gst' || h === 'gst no'
  );

  // Invoice columns: M=12, N=13, O=14 (fixed positions)
  const invoiceNumColIdx = 12;  // Column M
  const invoiceDateColIdx = 13; // Column N
  const invoiceAmtColIdx = 14;  // Column O

  const target = normalizePhone(phone);

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const cellPhone = normalizePhone(String(row[phoneColIdx] ?? ''));
    if (cellPhone !== target) continue;

    return {
      name: String(row[nameColIdx] ?? '').trim() || 'Unknown',
      phone: String(row[phoneColIdx] ?? '').trim(),
      email: emailColIdx >= 0 ? String(row[emailColIdx] ?? '').trim() : '',
      address: addressColIdx >= 0 ? String(row[addressColIdx] ?? '').trim() : '',
      gstin: gstinColIdx >= 0 ? String(row[gstinColIdx] ?? '').trim() : '',
      batch,
      rowIndex: i,
      tabName,
      existingInvoiceNumber: String(row[invoiceNumColIdx] ?? '').trim(),
      existingInvoiceDate: String(row[invoiceDateColIdx] ?? '').trim(),
      existingInvoiceAmount: String(row[invoiceAmtColIdx] ?? '').trim(),
    };
  }

  return null;
}

// ─── Find L2 student (checks all category tabs in order) ──────────────────
export async function findL2Student(phone: string): Promise<L2StudentRecord | null> {
  const errors: string[] = [];
  for (const tab of L2_TABS) {
    try {
      const student = await findStudentInTab(phone, tab.tabName, tab.batch);
      if (student) return student;
    } catch (err) {
      const msg = (err as Error).message;
      console.warn(`Failed to search tab "${tab.tabName}":`, msg);
      errors.push(`${tab.tabName}: ${msg}`);
    }
  }
  // If ALL tabs failed with errors, throw so caller can return 500 instead of 404
  if (errors.length === L2_TABS.length) {
    throw new Error(`All L2 tabs failed: ${errors.join('; ')}`);
  }
  return null;
}

// ─── Write verified payments to tracker (Application Fees + 1st–4th Payment) ─
// Payment columns layout (each block = Mode, Date, Amount):
//   P,Q,R  = Application Fees
//   S,T,U  = 1st Payment
//   V,W,X  = 2nd Payment
//   Y,Z,AA = 3rd Payment
//   AB,AC,AD = 4th Payment
export async function writePaymentsToTracker(
  tabName: string,
  rowIndex: number,
  payments: { gateway: string; date: string; amount: string }[]
): Promise<void> {
  if (payments.length === 0) return;

  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const rowNum = rowIndex + 1; // 1-based

  // Separate application fees (₹999) from regular payments
  const appFeePayments: typeof payments = [];
  const regularPayments: typeof payments = [];

  for (const p of payments) {
    const numericAmt = parseFloat(p.amount.replace(/[^0-9.]/g, ''));
    if (numericAmt === 999) {
      appFeePayments.push(p);
    } else {
      regularPayments.push(p);
    }
  }

  // Build the row data: P through AD (15 cells)
  // [AppFee_Mode, AppFee_Date, AppFee_Amt, 1st_Mode, 1st_Date, 1st_Amt, 2nd_Mode, 2nd_Date, 2nd_Amt, 3rd_Mode, 3rd_Date, 3rd_Amt, 4th_Mode, 4th_Date, 4th_Amt]
  const rowData: string[] = new Array(15).fill('');

  // Application Fees (first ₹999 payment)
  if (appFeePayments.length > 0) {
    const af = appFeePayments[0];
    rowData[0] = af.gateway;   // P: Mode
    rowData[1] = af.date;      // Q: Date
    rowData[2] = af.amount.replace(/[^0-9.]/g, ''); // R: Amount
  }

  // 1st through 4th Payment (slots at offset 3, 6, 9, 12)
  for (let i = 0; i < Math.min(regularPayments.length, 4); i++) {
    const offset = 3 + i * 3;
    rowData[offset]     = regularPayments[i].gateway;                           // Mode
    rowData[offset + 1] = regularPayments[i].date;                              // Date
    rowData[offset + 2] = regularPayments[i].amount.replace(/[^0-9.]/g, '');    // Amount
  }

  const cellRange = `'${tabName}'!P${rowNum}:AD${rowNum}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId: L2_TRACKER_SHEET_ID,
    range: cellRange,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [rowData],
    },
  });

  console.log(`[L2] Wrote ${payments.length} payment(s) to "${tabName}" row ${rowNum} (${appFeePayments.length} app fees, ${regularPayments.length} regular)`);
}

// ─── Write invoice details to Sheet 2 (cols M, N, O) ───────────────────────
export async function writeInvoiceToTracker(
  tabName: string,
  rowIndex: number,
  invoiceNumber: string,
  invoiceDate: string,
  invoiceAmount: string
): Promise<void> {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const rowNum = rowIndex + 1; // 1-based for Sheets API
  // Columns M=13, N=14, O=15 in A1 notation (1-based), M is column index 12 (0-based)
  const cellRange = `'${tabName}'!M${rowNum}:O${rowNum}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId: L2_TRACKER_SHEET_ID,
    range: cellRange,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[invoiceNumber, invoiceDate, invoiceAmount]],
    },
  });
}

// ─── Check if invoice URL already exists in Sheet 3 (col P) ────────────────
export async function findExistingInvoiceUrl(phone: string): Promise<string | null> {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: L2_CONFIRMATION_SHEET_ID });
    const sheetList = meta.data.sheets ?? [];
    if (sheetList.length === 0) return null;

    const tabTitle = sheetList[0]?.properties?.title ?? 'Sheet1';
    const range = `'${tabTitle}'!A:Z`;

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: L2_CONFIRMATION_SHEET_ID,
      range,
    });

    const rows = res.data.values ?? [];
    if (rows.length < 2) return null;

    const headers = rows[0].map((h: string) => h.trim().toLowerCase());
    const phoneColIdx = headers.findIndex(
      (h: string) => h === 'phone number' || h === 'phone no' || h === 'phone' || h === 'mobile'
    );
    const urlColIdx = headers.findIndex(
      (h: string) => h === 'invoice url' || h === 'invoice link' || h === 'url'
    );

    if (phoneColIdx === -1 || urlColIdx === -1) return null;

    const target = normalizePhone(phone);
    for (let i = 1; i < rows.length; i++) {
      const cellPhone = normalizePhone(String(rows[i][phoneColIdx] ?? ''));
      if (cellPhone === target) {
        const url = String(rows[i][urlColIdx] ?? '').trim();
        return url || null;  // null if empty
      }
    }
  } catch (err) {
    console.warn('Failed to check existing invoice URL:', (err as Error).message);
  }

  return null;
}

// ─── Write invoice URL to Sheet 3 (col P) ──────────────────────────────────
export async function writeInvoiceUrlToSheet3(
  phone: string,
  invoiceUrl: string
): Promise<void> {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  // First, find the student row in Sheet 3 by phone number
  // Read all data to find the phone column and row
  const meta = await sheets.spreadsheets.get({ spreadsheetId: L2_CONFIRMATION_SHEET_ID });
  const sheetList = meta.data.sheets ?? [];
  if (sheetList.length === 0) {
    console.warn('Sheet 3 has no tabs');
    return;
  }

  // Use the first tab
  const tabTitle = sheetList[0]?.properties?.title ?? 'Sheet1';
  const range = `'${tabTitle}'!A:Z`;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: L2_CONFIRMATION_SHEET_ID,
    range,
  });

  const rows = res.data.values ?? [];
  if (rows.length < 2) return;

  const headers = rows[0].map((h: string) => h.trim().toLowerCase());
  const phoneColIdx = headers.findIndex(
    (h: string) => h === 'phone number' || h === 'phone no' || h === 'phone' || h === 'mobile'
  );

  if (phoneColIdx === -1) {
    console.warn('Phone column not found in Sheet 3. Headers:', rows[0]);
    return;
  }

  const target = normalizePhone(phone);
  for (let i = 1; i < rows.length; i++) {
    const cellPhone = normalizePhone(String(rows[i][phoneColIdx] ?? ''));
    if (cellPhone === target) {
      // Column P = index 15, 1-based row = i + 1
      const rowNum = i + 1;
      const cellRange = `'${tabTitle}'!P${rowNum}`;

      await sheets.spreadsheets.values.update({
        spreadsheetId: L2_CONFIRMATION_SHEET_ID,
        range: cellRange,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[invoiceUrl]] },
      });
      return;
    }
  }

  console.warn(`Phone ${phone} not found in Sheet 3 for URL write-back`);
}

// ─── Get next L2 invoice number (auto-increment MHS/DD/XXX) ────────────────
export async function getNextL2InvoiceNumber(): Promise<string> {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  let maxNum = 0;

  // Read column M from all 4 L2 category tabs
  for (const { tabName } of L2_TABS) {
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: L2_TRACKER_SHEET_ID,
        range: `'${tabName}'!M:M`,
      });

      const values = res.data.values ?? [];
      for (const row of values) {
        const cell = String(row[0] ?? '').trim();
        // Parse MHS/DD/XXX format
        const match = cell.match(/MHS\/DD\/(\d+)/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
    } catch (err) {
      console.warn(`Failed to read invoice numbers from "${tabName}":`, (err as Error).message);
    }
  }

  // Also check the main invoice source sheet for the global max
  try {
    const mainSheetId = process.env.SHEET_ID;
    const mainSheetGid = process.env.SHEET_GID;
    if (mainSheetId) {
      // Fetch via CSV to check existing invoice numbers
      const url = `https://docs.google.com/spreadsheets/d/${mainSheetId}/export?format=csv&gid=${mainSheetGid}`;
      const csvRes = await fetch(url, { redirect: 'follow', cache: 'no-store' });
      if (csvRes.ok) {
        const csv = await csvRes.text();
        const matches = Array.from(csv.matchAll(/MHS\/DD\/(\d+)/gi));
        for (const m of matches) {
          const num = parseInt(m[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
    }
  } catch {
    // Non-critical: if main sheet fails, still use L2 tracker max
  }

  const nextNum = maxNum + 1;
  return `MHS/DD/${String(nextNum).padStart(3, '0')}`;
}
