import { google } from 'googleapis';
import { getGoogleAuth, withRetry } from './google-auth';
import { L2StudentRecord } from './types';
import { colIndexToLetter } from './l2-payment-gateway';

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
  return phone.replace(/\s+/g, '').replace(/[^0-9]/g, '');
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

  const res = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId: L2_TRACKER_SHEET_ID,
      range,
    })
  );

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

  // Invoice columns — detected by header (not hardcoded, survives column insertions)
  const invoiceNumColIdx = headers.findIndex(
    (h: string) => h === 'invoice number' || h === 'invoice no' || h === 'invoice #'
  );
  const invoiceDateColIdx = headers.findIndex(
    (h: string) => h === 'invoice date'
  );
  const invoiceAmtColIdx = headers.findIndex(
    (h: string) => h === 'invoice amount' || h === 'invoice amt'
  );

  // Payment start column — right after Invoice Amount column
  // Row 1 has merged headers ("Application Fees") and Row 2 has sub-headers ("Mode of"),
  // so we can't reliably detect "Mode of" from row 0. Instead, payment columns always
  // start immediately after the invoice amount column.
  const invoiceLastCol = Math.max(invoiceNumColIdx, invoiceDateColIdx, invoiceAmtColIdx);
  let paymentStartColIdx = invoiceLastCol >= 0 ? invoiceLastCol + 1 : -1;

  // Double-check: if row 0 has "application" at that position, it confirms the payment section
  if (paymentStartColIdx >= 0 && paymentStartColIdx < headers.length) {
    const h = headers[paymentStartColIdx];
    if (h && !h.includes('application') && !h.includes('mode') && !h.includes('payment') && h !== '') {
      // Header doesn't look like a payment column — might be a gap, try next columns
      for (let c = paymentStartColIdx; c < Math.min(paymentStartColIdx + 3, headers.length); c++) {
        const ch = headers[c];
        if (ch.includes('application') || ch.includes('mode') || ch === '') {
          paymentStartColIdx = c;
          break;
        }
      }
    }
  }

  console.log(`[L2] Column detection: invoiceNum=${invoiceNumColIdx}(${colIndexToLetter(invoiceNumColIdx)}), invoiceDate=${invoiceDateColIdx}(${colIndexToLetter(invoiceDateColIdx)}), invoiceAmt=${invoiceAmtColIdx}(${colIndexToLetter(invoiceAmtColIdx)}), paymentStart=${paymentStartColIdx}(${paymentStartColIdx >= 0 ? colIndexToLetter(paymentStartColIdx) : 'N/A'})`);

  const target = normalizePhone(phone);

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const cellPhone = normalizePhone(String(row[phoneColIdx] ?? ''));
    if (cellPhone !== target && cellPhone.slice(-10) !== target.slice(-10)) continue;

    return {
      name: String(row[nameColIdx] ?? '').trim() || 'Unknown',
      phone: String(row[phoneColIdx] ?? '').trim(),
      email: emailColIdx >= 0 ? String(row[emailColIdx] ?? '').trim() : '',
      address: addressColIdx >= 0 ? String(row[addressColIdx] ?? '').trim() : '',
      gstin: gstinColIdx >= 0 ? String(row[gstinColIdx] ?? '').trim() : '',
      batch,
      rowIndex: i,
      tabName,
      existingInvoiceNumber: invoiceNumColIdx >= 0 ? String(row[invoiceNumColIdx] ?? '').trim() : '',
      existingInvoiceDate: invoiceDateColIdx >= 0 ? String(row[invoiceDateColIdx] ?? '').trim() : '',
      existingInvoiceAmount: invoiceAmtColIdx >= 0 ? String(row[invoiceAmtColIdx] ?? '').trim() : '',
      invoiceNumColIdx,
      invoiceDateColIdx,
      invoiceAmtColIdx,
      paymentStartColIdx,
    };
  }

  return null;
}

// ─── Find L2 student (checks all category tabs in parallel) ─────────────────
export async function findL2Student(phone: string): Promise<L2StudentRecord | null> {
  const results = await Promise.allSettled(
    L2_TABS.map(tab => findStudentInTab(phone, tab.tabName, tab.batch))
  );

  // Return first successful match
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      return result.value;
    }
  }

  // Check if ALL failed with errors
  const errors = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map(r => r.reason?.message || 'Unknown error');

  if (errors.length === L2_TABS.length) {
    throw new Error(`All L2 tabs failed: ${errors.join('; ')}`);
  }

  return null;
}

// ─── Write verified payments to tracker (Application Fees + 1st–4th Payment) ─
// Payment columns layout (each block = Mode, Date, Amount) — 5 slots × 3 cols = 15 cells
export async function writePaymentsToTracker(
  tabName: string,
  rowIndex: number,
  payments: { gateway: string; date: string; amount: string }[],
  paymentStartColIdx: number
): Promise<void> {
  if (payments.length === 0 || paymentStartColIdx < 0) return;

  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const rowNum = rowIndex + 1; // 1-based

  // First payment (by date order) = Application Fees, rest = 1st–4th Payment
  const appFee = payments[0];
  const regularPayments = payments.slice(1);

  // Build 15 cells: [AppFee_Mode, AppFee_Date, AppFee_Amt, 1st_Mode, ...]
  const rowData: string[] = new Array(15).fill('');

  // Application Fees (first received payment)
  rowData[0] = appFee.gateway;
  rowData[1] = appFee.date;
  rowData[2] = appFee.amount.replace(/[^0-9.]/g, '');

  // 1st through 4th Payment (slots at offset 3, 6, 9, 12)
  for (let i = 0; i < Math.min(regularPayments.length, 4); i++) {
    const offset = 3 + i * 3;
    rowData[offset]     = regularPayments[i].gateway;
    rowData[offset + 1] = regularPayments[i].date;
    rowData[offset + 2] = regularPayments[i].amount.replace(/[^0-9.]/g, '');
  }

  const startCol = colIndexToLetter(paymentStartColIdx);
  const endCol = colIndexToLetter(paymentStartColIdx + 14);
  const cellRange = `'${tabName}'!${startCol}${rowNum}:${endCol}${rowNum}`;

  console.log(`[L2] Writing ${payments.length} payment(s) to "${tabName}" ${cellRange}`);
  console.log(`[L2] Payment data: [${rowData.join(', ')}]`);

  const writeRes = await sheets.spreadsheets.values.update({
    spreadsheetId: L2_TRACKER_SHEET_ID,
    range: cellRange,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [rowData],
    },
  });
  console.log(`[L2] Payment write result: ${writeRes.data.updatedCells} cells updated in ${writeRes.data.updatedRange}`);
}

// ─── Write invoice details to tracker (dynamic columns from header detection) ─
export async function writeInvoiceToTracker(
  tabName: string,
  rowIndex: number,
  invoiceNumber: string,
  invoiceDate: string,
  invoiceAmount: string,
  invoiceNumColIdx: number,
  invoiceDateColIdx: number,
  invoiceAmtColIdx: number
): Promise<void> {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const rowNum = rowIndex + 1; // 1-based for Sheets API
  const startCol = colIndexToLetter(Math.min(invoiceNumColIdx, invoiceDateColIdx, invoiceAmtColIdx));
  const endCol = colIndexToLetter(Math.max(invoiceNumColIdx, invoiceDateColIdx, invoiceAmtColIdx));
  const cellRange = `'${tabName}'!${startCol}${rowNum}:${endCol}${rowNum}`;

  // Build values array in correct column order
  const minIdx = Math.min(invoiceNumColIdx, invoiceDateColIdx, invoiceAmtColIdx);
  const span = Math.max(invoiceNumColIdx, invoiceDateColIdx, invoiceAmtColIdx) - minIdx + 1;
  const values = new Array(span).fill('');
  values[invoiceNumColIdx - minIdx] = invoiceNumber;
  values[invoiceDateColIdx - minIdx] = invoiceDate;
  values[invoiceAmtColIdx - minIdx] = invoiceAmount;

  console.log(`[L2] Writing invoice to "${tabName}" ${cellRange}: [${values.join(', ')}]`);

  const invoiceWriteRes = await sheets.spreadsheets.values.update({
    spreadsheetId: L2_TRACKER_SHEET_ID,
    range: cellRange,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [values],
    },
  });
  console.log(`[L2] Invoice write result: ${invoiceWriteRes.data.updatedCells} cells updated in ${invoiceWriteRes.data.updatedRange}`);
}

// ─── Get all data tabs from the confirmation sheet (skip "template") ────────
async function getConfirmationTabs(): Promise<{ title: string; rows: string[][] }[]> {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const meta = await sheets.spreadsheets.get({ spreadsheetId: L2_CONFIRMATION_SHEET_ID });
  const sheetList = meta.data.sheets ?? [];
  const tabNames = sheetList
    .map(s => s.properties?.title ?? '')
    .filter(t => t && !t.toLowerCase().includes('template'));

  if (tabNames.length === 0) return [];

  // batchGet all tabs in a single API call
  const ranges = tabNames.map(t => `'${t}'!A:Z`);
  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: L2_CONFIRMATION_SHEET_ID,
    ranges,
  });

  return (res.data.valueRanges ?? []).map((vr, i) => ({
    title: tabNames[i],
    rows: (vr.values ?? []) as string[][],
  }));
}

// ─── Check if invoice URL already exists in any confirmation tab ────────────
export async function findExistingInvoiceUrl(phone: string): Promise<string | null> {
  try {
    const tabs = await getConfirmationTabs();
    const target = normalizePhone(phone);

    for (const { rows } of tabs) {
      if (rows.length < 2) continue;
      const headers = rows[0].map((h: string) => h.trim().toLowerCase());
      const phoneColIdx = headers.findIndex(
        (h: string) => h === 'phone number' || h === 'phone no' || h === 'phone' || h === 'mobile'
      );
      const urlColIdx = headers.findIndex(
        (h: string) => h === 'invoice url' || h === 'invoice link' || h === 'url'
      );
      if (phoneColIdx === -1 || urlColIdx === -1) continue;

      for (let i = 1; i < rows.length; i++) {
        const cellPhone = normalizePhone(String(rows[i][phoneColIdx] ?? ''));
        if (cellPhone === target || cellPhone.slice(-10) === target.slice(-10)) {
          const url = String(rows[i][urlColIdx] ?? '').trim();
          return url || null;
        }
      }
    }
  } catch (err) {
    console.warn('Failed to check existing invoice URL:', (err as Error).message);
  }

  return null;
}

// ─── Write invoice URL to confirmation sheet (searches all tabs) ────────────
export async function writeInvoiceUrlToSheet3(
  phone: string,
  invoiceUrl: string
): Promise<void> {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const tabs = await getConfirmationTabs();
  const target = normalizePhone(phone);

  for (const { title, rows } of tabs) {
    if (rows.length < 2) continue;
    const headers = rows[0].map((h: string) => h.trim().toLowerCase());
    const phoneColIdx = headers.findIndex(
      (h: string) => h === 'phone number' || h === 'phone no' || h === 'phone' || h === 'mobile'
    );
    if (phoneColIdx === -1) continue;

    const urlColIdx = headers.findIndex(
      (h: string) => h === 'invoice url' || h === 'invoice link' || h === 'url'
    );
    const urlCol = urlColIdx >= 0 ? colIndexToLetter(urlColIdx) : 'P';

    for (let i = 1; i < rows.length; i++) {
      const cellPhone = normalizePhone(String(rows[i][phoneColIdx] ?? ''));
      if (cellPhone === target || cellPhone.slice(-10) === target.slice(-10)) {
        const rowNum = i + 1;
        const cellRange = `'${title}'!${urlCol}${rowNum}`;
        console.log(`[L2] Writing invoice URL to confirmation sheet: ${cellRange}`);
        await sheets.spreadsheets.values.update({
          spreadsheetId: L2_CONFIRMATION_SHEET_ID,
          range: cellRange,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[invoiceUrl]] },
        });
        return;
      }
    }
  }

  console.warn(`Phone ${phone} not found in any confirmation sheet tab for URL write-back`);
}

// ─── Get next L2 invoice number (auto-increment MHS/DD/XXX) ────────────────
export async function getNextL2InvoiceNumber(): Promise<string> {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  let maxNum = 0;

  // Dynamically detect the Invoice Number column from headers, then read it
  for (const { tabName } of L2_TABS) {
    try {
      // Step 1: Read header row to detect Invoice Number column
      const headerRes = await sheets.spreadsheets.values.get({
        spreadsheetId: L2_TRACKER_SHEET_ID,
        range: `'${tabName}'!1:1`,
      });

      const headers = (headerRes.data.values?.[0] ?? []).map((h: string) => h.trim().toLowerCase());
      const invoiceNumColIdx = headers.findIndex(
        (h: string) => h === 'invoice number' || h === 'invoice no' || h === 'invoice #'
      );

      if (invoiceNumColIdx === -1) {
        console.warn(`[L2] Invoice Number column not found in "${tabName}" headers, skipping`);
        continue;
      }

      const colLetter = colIndexToLetter(invoiceNumColIdx);
      console.log(`[L2] getNextL2InvoiceNumber: "${tabName}" Invoice Number column = ${colLetter} (index ${invoiceNumColIdx})`);

      // Step 2: Read just that column
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: L2_TRACKER_SHEET_ID,
        range: `'${tabName}'!${colLetter}:${colLetter}`,
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
