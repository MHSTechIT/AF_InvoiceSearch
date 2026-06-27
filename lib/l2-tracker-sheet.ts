import { google } from 'googleapis';
import { getGoogleAuth, withRetry } from './google-auth';
import { L2StudentRecord } from './types';
import { colIndexToLetter, pickApplicationFeeIndex } from './l2-payment-gateway';

const L2_TRACKER_SHEET_ID = process.env.L2_TRACKER_SHEET_ID!;     // Student records + invoice write-back
const L2_CONFIRMATION_SHEET_ID = process.env.L2_CONFIRMATION_SHEET_ID!;
const L2_TAB_DIAMOND_ACCESS = process.env.L2_TAB_DIAMOND_ACCESS || 'DIAMOND ACCESS';

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

// ─── Detected column indices for an L2 tracker tab ──────────────────────────
interface TabColumns {
  phoneColIdx: number;
  nameColIdx: number;
  emailColIdx: number;
  addressColIdx: number;
  gstinColIdx: number;
  invoiceNumColIdx: number;
  invoiceDateColIdx: number;
  invoiceAmtColIdx: number;
  paymentStartColIdx: number;
}

// ─── Read all rows of a tab (A:Z) ───────────────────────────────────────────
async function readTabRows(tabName: string): Promise<string[][]> {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId: L2_TRACKER_SHEET_ID,
      range: `'${tabName}'!A:Z`,
    })
  );
  return (res.data.values ?? []) as string[][];
}

// ─── Detect tracker columns from the header row (survives column insertions) ─
function detectTabColumns(rows: string[][], tabName: string): TabColumns | null {
  if (rows.length < 2) return null;
  const headers = rows[0].map((h: string) => h.trim().toLowerCase());

  // Phone column by header, fallback to column F (index 5)
  let phoneColIdx = headers.findIndex(
    (h: string) => h === 'phone number' || h === 'phone no' || h === 'phone' || h === 'mobile' || h === 'mobile number'
  );
  if (phoneColIdx === -1) phoneColIdx = 5;

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

  const invoiceNumColIdx = headers.findIndex(
    (h: string) => h === 'invoice number' || h === 'invoice no' || h === 'invoice #'
  );
  const invoiceDateColIdx = headers.findIndex(
    (h: string) => h === 'invoice date'
  );
  const invoiceAmtColIdx = headers.findIndex(
    (h: string) => h === 'invoice amount' || h === 'invoice amt'
  );

  // Payment columns start right after the Invoice Amount column (see header note)
  const invoiceLastCol = Math.max(invoiceNumColIdx, invoiceDateColIdx, invoiceAmtColIdx);
  let paymentStartColIdx = invoiceLastCol >= 0 ? invoiceLastCol + 1 : -1;
  if (paymentStartColIdx >= 0 && paymentStartColIdx < headers.length) {
    const h = headers[paymentStartColIdx];
    if (h && !h.includes('application') && !h.includes('mode') && !h.includes('payment') && h !== '') {
      for (let c = paymentStartColIdx; c < Math.min(paymentStartColIdx + 3, headers.length); c++) {
        const ch = headers[c];
        if (ch.includes('application') || ch.includes('mode') || ch === '') {
          paymentStartColIdx = c;
          break;
        }
      }
    }
  }

  console.log(`[L2] "${tabName}" columns: phone=${colIndexToLetter(phoneColIdx)}, invoiceNum=${colIndexToLetter(invoiceNumColIdx)}, paymentStart=${paymentStartColIdx >= 0 ? colIndexToLetter(paymentStartColIdx) : 'N/A'}`);

  return {
    phoneColIdx, nameColIdx, emailColIdx, addressColIdx, gstinColIdx,
    invoiceNumColIdx, invoiceDateColIdx, invoiceAmtColIdx, paymentStartColIdx,
  };
}

// ─── Build an L2StudentRecord from a matched row ────────────────────────────
function buildStudentRecord(
  row: string[], rowIndex: number, tabName: string, batch: string, c: TabColumns
): L2StudentRecord {
  return {
    name: String(row[c.nameColIdx] ?? '').trim() || 'Unknown',
    phone: String(row[c.phoneColIdx] ?? '').trim(),
    email: c.emailColIdx >= 0 ? String(row[c.emailColIdx] ?? '').trim() : '',
    address: c.addressColIdx >= 0 ? String(row[c.addressColIdx] ?? '').trim() : '',
    gstin: c.gstinColIdx >= 0 ? String(row[c.gstinColIdx] ?? '').trim() : '',
    batch,
    rowIndex,
    tabName,
    existingInvoiceNumber: c.invoiceNumColIdx >= 0 ? String(row[c.invoiceNumColIdx] ?? '').trim() : '',
    existingInvoiceDate: c.invoiceDateColIdx >= 0 ? String(row[c.invoiceDateColIdx] ?? '').trim() : '',
    existingInvoiceAmount: c.invoiceAmtColIdx >= 0 ? String(row[c.invoiceAmtColIdx] ?? '').trim() : '',
    invoiceNumColIdx: c.invoiceNumColIdx,
    invoiceDateColIdx: c.invoiceDateColIdx,
    invoiceAmtColIdx: c.invoiceAmtColIdx,
    paymentStartColIdx: c.paymentStartColIdx,
  };
}

// ─── Find a student by phone in a specific tab ──────────────────────────────
async function findStudentInTab(
  phone: string,
  tabName: string,
  batch: string
): Promise<L2StudentRecord | null> {
  console.log(`[L2] Searching tab "${tabName}" for phone ${phone}`);
  const rows = await readTabRows(tabName);
  const cols = detectTabColumns(rows, tabName);
  if (!cols) return null;

  const target = normalizePhone(phone);
  for (let i = 1; i < rows.length; i++) {
    const cellPhone = normalizePhone(String(rows[i][cols.phoneColIdx] ?? ''));
    if (cellPhone !== target && cellPhone.slice(-10) !== target.slice(-10)) continue;
    return buildStudentRecord(rows[i], i, tabName, batch, cols);
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

// ─── Bulk: find MANY students with ONE batchGet of both tabs ────────────────
// Reads Diamond + Gold once, then matches all phones in memory (Diamond wins).
export async function findL2StudentsForPhones(
  phones: string[]
): Promise<Map<string, L2StudentRecord>> {
  const result = new Map<string, L2StudentRecord>();
  const targets = phones
    .map(p => normalizePhone(p))
    .filter(p => p.length >= 10 && p.length <= 12);
  if (targets.length === 0) return result;

  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const ranges = L2_TABS.map(t => `'${t.tabName}'!A:Z`);

  const res = await withRetry(() =>
    sheets.spreadsheets.values.batchGet({
      spreadsheetId: L2_TRACKER_SHEET_ID,
      ranges,
    })
  );
  const valueRanges = (res.data.valueRanges ?? []) as { values?: string[][] }[];

  for (let t = 0; t < L2_TABS.length; t++) {
    const { tabName, batch } = L2_TABS[t];
    const rows = (valueRanges[t]?.values ?? []) as string[][];
    const cols = detectTabColumns(rows, tabName);
    if (!cols) continue;

    for (const target of targets) {
      if (result.has(target)) continue; // Diamond (first tab) wins over Gold
      for (let i = 1; i < rows.length; i++) {
        const cellPhone = normalizePhone(String(rows[i][cols.phoneColIdx] ?? ''));
        if (cellPhone === target || cellPhone.slice(-10) === target.slice(-10)) {
          result.set(target, buildStudentRecord(rows[i], i, tabName, batch, cols));
          break;
        }
      }
    }
  }

  return result;
}

// ─── Sync phone into column F of L2 Diamond Accounts (format-safe) ──────────
// The L2 Diamond Accounts sheet has lookup formulas keyed on column F that pull
// values from the DIAMOND ACCESS tab. Those lookups need an EXACT type match —
// text "9842…" ≠ number 9842…. This reads the phone's stored value from the
// DIAMOND ACCESS tab (preserving its number/text type) and writes that exact
// value into F of the given row with RAW, so the formulas resolve.
// Returns true if F was (re)written. Non-fatal: callers may ignore failures.
export async function syncDiamondAccessPhoneToF(
  tabName: string,
  rowIndex: number,
  phone: string
): Promise<boolean> {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const target = normalizePhone(phone);

  // Read DIAMOND ACCESS with UNFORMATTED_VALUE so numbers stay numbers, text stays text
  let rows: (string | number)[][];
  try {
    const res = await withRetry(() =>
      sheets.spreadsheets.values.get({
        spreadsheetId: L2_TRACKER_SHEET_ID,
        range: `'${L2_TAB_DIAMOND_ACCESS}'!A:Z`,
        valueRenderOption: 'UNFORMATTED_VALUE',
      })
    );
    rows = (res.data.values ?? []) as (string | number)[][];
  } catch (err) {
    console.warn(`[L2] Could not read "${L2_TAB_DIAMOND_ACCESS}" tab:`, (err as Error).message);
    return false;
  }
  if (rows.length < 2) return false;

  // Detect phone column in DIAMOND ACCESS (header, fallback to col F)
  const headers = rows[0].map(h => String(h ?? '').trim().toLowerCase());
  let phoneColIdx = headers.findIndex(
    h => h === 'phone number' || h === 'phone no' || h === 'phone' || h === 'mobile' || h === 'mobile number'
  );
  if (phoneColIdx === -1) phoneColIdx = 5;

  // Find the row whose phone matches; capture its RAW typed value
  let rawValue: string | number | null = null;
  for (let i = 1; i < rows.length; i++) {
    const cell = rows[i][phoneColIdx];
    if (cell === undefined || cell === null || cell === '') continue;
    const cellNorm = normalizePhone(String(cell));
    if (cellNorm === target || cellNorm.slice(-10) === target.slice(-10)) {
      rawValue = cell;
      break;
    }
  }

  if (rawValue === null) {
    console.log(`[L2] Phone ${phone} not found in "${L2_TAB_DIAMOND_ACCESS}" — skipping F sync`);
    return false;
  }

  // Write the exact typed value into F with RAW (preserves number vs text)
  const cellRange = `'${tabName}'!F${rowIndex + 1}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: L2_TRACKER_SHEET_ID,
    range: cellRange,
    valueInputOption: 'RAW',
    requestBody: { values: [[rawValue]] },
  });
  console.log(`[L2] Synced ${L2_TAB_DIAMOND_ACCESS} phone (${typeof rawValue}) → ${cellRange}`);
  return true;
}

// ─── Write verified payments to tracker (Application Fees + 1st–10th Payment) ─
// Payment columns layout (each block = Mode, Date, Amount) — 11 slots × 3 cols = 33 cells
const MAX_REGULAR_PAYMENTS = 10;        // 1st–10th Payment
const PAYMENT_BLOCK_CELLS = (MAX_REGULAR_PAYMENTS + 1) * 3; // 33 (incl. Application Fees)
export async function writePaymentsToTracker(
  tabName: string,
  rowIndex: number,
  payments: { gateway: string; date: string; amount: string; category?: string }[],
  paymentStartColIdx: number
): Promise<void> {
  if (payments.length === 0 || paymentStartColIdx < 0) return;

  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const rowNum = rowIndex + 1; // 1-based

  // Application Fees = the payment whose category starts with "002" (L2 Application);
  // falls back to the first (oldest) payment when no 002 category is present.
  // The remaining payments keep their date order for the 1st–10th slots.
  const appFeeIdx = pickApplicationFeeIndex(payments);
  const appFee = payments[appFeeIdx];
  const regularPayments = payments.filter((_, i) => i !== appFeeIdx);

  // Build 33 cells: [AppFee_Mode, AppFee_Date, AppFee_Amt, 1st_Mode, ...]
  const rowData: string[] = new Array(PAYMENT_BLOCK_CELLS).fill('');

  // Application Fees block
  rowData[0] = appFee.gateway;
  rowData[1] = appFee.date;
  rowData[2] = appFee.amount.replace(/[^0-9.]/g, '');

  // 1st through 10th Payment (slots at offset 3, 6, 9, … , 30)
  for (let i = 0; i < Math.min(regularPayments.length, MAX_REGULAR_PAYMENTS); i++) {
    const offset = 3 + i * 3;
    rowData[offset]     = regularPayments[i].gateway;
    rowData[offset + 1] = regularPayments[i].date;
    rowData[offset + 2] = regularPayments[i].amount.replace(/[^0-9.]/g, '');
  }

  const startCol = colIndexToLetter(paymentStartColIdx);
  const endCol = colIndexToLetter(paymentStartColIdx + PAYMENT_BLOCK_CELLS - 1);
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

// ─── Bulk: existing invoice URLs for MANY phones (reads confirmation tabs once) ─
export async function findExistingInvoiceUrlsForPhones(
  phones: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const targets = phones.map(p => normalizePhone(p)).filter(p => p.length >= 10 && p.length <= 12);
  if (targets.length === 0) return result;

  try {
    const tabs = await getConfirmationTabs();
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
        const match = targets.find(t => cellPhone === t || cellPhone.slice(-10) === t.slice(-10));
        if (match && !result.has(match)) {
          const url = String(rows[i][urlColIdx] ?? '').trim();
          if (url) result.set(match, url);
        }
      }
    }
  } catch (err) {
    console.warn('Failed bulk invoice-URL lookup:', (err as Error).message);
  }

  return result;
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
