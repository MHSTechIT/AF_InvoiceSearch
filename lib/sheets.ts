import { google } from 'googleapis';
import { getGoogleAuth } from './google-auth';
import { InvoiceRow, InvoiceSummary } from './types';

const L2_TRACKER_SHEET_ID = process.env.L2_TRACKER_SHEET_ID!;
const L2_TABS = [
  process.env.L2_TAB_DIAMOND || 'L2 Diamond Accounts',
  process.env.L2_TAB_GOLD || 'L2 Gold Accounts',
];

// ─── Column mapping for L2 tracker tabs ─────────────────────────────────────
// Col  0(A): Access Batch    4(E): Client Name    5(F): Phone No
// Col 12(M): Invoice Number  13(N): Invoice Date  14(O): Invoice Amount
// Col  7(H): Payment Type    10(K): Amount Received  11(L): Payment Mode
const COL = {
  name: 4,        // E: Client Name
  phone: 5,       // F: Phone No
  paymentType: 7, // H: Payment Type
  batch: 0,       // A: Access Batch
  amountReceived: 10, // K: Amount Received
  paymentMode: 11,    // L: Payment Mode
  invoiceNumber: 12,  // M: Invoice Number
  invoiceDate: 13,    // N: Invoice Date
  invoiceAmount: 14,  // O: Invoice Amount
  appFeeMode: 15,     // P: Application Fees - Mode
  appFeeDate: 16,     // Q: Application Fees - Date
  appFeeAmount: 17,   // R: Application Fees - Amount
};

function normalizePhone(phone: string): string {
  return phone.replace(/\s+/g, '').replace(/[^0-9]/g, '').slice(-10);
}

// ─── Build InvoiceRow from a sheet row ──────────────────────────────────────
function rowToInvoiceRow(row: string[], batch: string): InvoiceRow {
  const get = (idx: number) => String(row[idx] ?? '').trim();

  return {
    date: get(COL.invoiceDate),
    batch: batch,
    patientId: '',
    sNo: '',
    clientName: get(COL.name),
    phoneNo: get(COL.phone),
    email: '',
    gstin: '',
    address: '',
    l1Batch: '',
    l2Batch: get(COL.batch),
    paymentType: get(COL.paymentType),
    applicationFees: get(COL.appFeeAmount),
    invoiceNumber: get(COL.invoiceNumber),
    invoiceDate: get(COL.invoiceDate),
    invoiceAmount: get(COL.invoiceAmount),
    itemDescription: 'Course Membership Fees',
  };
}

// ─── Fetch rows from both L2 tabs ───────────────────────────────────────────
async function fetchAllL2Rows(): Promise<{ row: InvoiceRow; tab: string }[]> {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const allRows: { row: InvoiceRow; tab: string }[] = [];

  const results = await Promise.allSettled(
    L2_TABS.map(async (tabName) => {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: L2_TRACKER_SHEET_ID,
        range: `'${tabName}'!A:R`,
      });
      const rows = res.data.values ?? [];
      const batch = tabName.includes('Diamond') ? 'Diamond' : 'Gold';
      // Skip header row
      for (let i = 1; i < rows.length; i++) {
        const invoiceRow = rowToInvoiceRow(rows[i], batch);
        if (invoiceRow.invoiceNumber) {
          allRows.push({ row: invoiceRow, tab: tabName });
        }
      }
    })
  );

  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'rejected') {
      console.warn(`Sheet tab "${L2_TABS[i]}" fetch failed:`, (results[i] as PromiseRejectedResult).reason);
    }
  }

  return allRows;
}

// ─── Public search functions ────────────────────────────────────────────────

export async function findByInvoiceNumber(invoiceNumber: string): Promise<InvoiceRow | null> {
  const allRows = await fetchAllL2Rows();
  const target = invoiceNumber.trim().toLowerCase();
  const match = allRows.find(r => r.row.invoiceNumber.toLowerCase() === target);
  return match?.row ?? null;
}

export async function findByPhoneNumber(phone: string): Promise<InvoiceRow[]> {
  const allRows = await fetchAllL2Rows();
  const target = normalizePhone(phone);
  return allRows
    .filter(r => normalizePhone(r.row.phoneNo) === target)
    .map(r => r.row);
}

export function toSummary(row: InvoiceRow): InvoiceSummary {
  return {
    invoiceNumber: row.invoiceNumber,
    invoiceDate: row.invoiceDate || row.date,
    clientName: row.clientName,
    phoneNo: row.phoneNo,
    email: row.email,
    invoiceAmount: row.invoiceAmount,
    itemDescription: row.itemDescription,
  };
}

// ─── Legacy: fetch sheet rows (still used by getNextL2InvoiceNumber) ────────
export async function fetchSheetRows(): Promise<InvoiceRow[]> {
  const allRows = await fetchAllL2Rows();
  return allRows.map(r => r.row);
}
