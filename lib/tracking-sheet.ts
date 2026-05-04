import { google } from 'googleapis';
import { getGoogleAuth } from './google-auth';

const TRACKING_SHEET_ID = process.env.TRACKING_SHEET_ID!;
const DIAMOND_GID = process.env.TRACKING_SHEET_DIAMOND_GID!;
const GOLD_GID = process.env.TRACKING_SHEET_GOLD_GID!;
const DIAMOND_FOLDER_ID = process.env.DRIVE_FOLDER_DIAMOND_ID!;
const GOLD_FOLDER_ID = process.env.DRIVE_FOLDER_GOLD_ID!;

function normalizePhone(phone: string): string {
  return phone.replace(/\s+/g, '').replace(/[^0-9]/g, '').slice(-10);
}

function gidToSheetName(gid: string, sheets: { properties: { sheetId: number; title: string } }[]): string | null {
  const sheet = sheets.find(s => String(s.properties.sheetId) === gid);
  return sheet?.properties?.title ?? null;
}

interface PhoneSearchResult {
  found: boolean;
  rowIndex: number;     // 0-based index in the values array (including header)
  sheetRange: string;   // e.g. "L2 Diamond!A1:Z200"
  headers: string[];
}

async function findPhoneInTab(
  phone: string,
  sheetGid: string
): Promise<PhoneSearchResult> {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  // Get sheet metadata to resolve GID → sheet title
  const meta = await sheets.spreadsheets.get({ spreadsheetId: TRACKING_SHEET_ID });
  const sheetList = meta.data.sheets ?? [];
  const sheetTitle = gidToSheetName(sheetGid, sheetList as { properties: { sheetId: number; title: string } }[]);

  if (!sheetTitle) {
    return { found: false, rowIndex: -1, sheetRange: '', headers: [] };
  }

  const range = `'${sheetTitle}'!A:Z`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: TRACKING_SHEET_ID,
    range,
  });

  const rows = res.data.values ?? [];
  if (rows.length === 0) return { found: false, rowIndex: -1, sheetRange: range, headers: [] };

  const headers = rows[0].map((h: string) => h.trim().toLowerCase());
  const phoneColIdx = headers.findIndex(
    (h: string) => h === 'phone number' || h === 'phone no' || h === 'phone' || h === 'mobile'
  );

  if (phoneColIdx === -1) return { found: false, rowIndex: -1, sheetRange: range, headers: rows[0] };

  const target = normalizePhone(phone);
  for (let i = 1; i < rows.length; i++) {
    const cell = normalizePhone(String(rows[i][phoneColIdx] ?? ''));
    if (cell === target) {
      return { found: true, rowIndex: i, sheetRange: range, headers: rows[0] };
    }
  }

  return { found: false, rowIndex: -1, sheetRange: range, headers: rows[0] };
}

export interface FolderResult {
  folderId: string;
  folderName: 'Diamond' | 'Gold';
  sheetGid: string;
  rowIndex: number;
  sheetRange: string;
  headers: string[];
}

export async function determineFolder(phone: string): Promise<FolderResult | null> {
  // Check Diamond tab first
  const diamond = await findPhoneInTab(phone, DIAMOND_GID);
  if (diamond.found) {
    return {
      folderId: DIAMOND_FOLDER_ID,
      folderName: 'Diamond',
      sheetGid: DIAMOND_GID,
      rowIndex: diamond.rowIndex,
      sheetRange: diamond.sheetRange,
      headers: diamond.headers,
    };
  }

  // Check Gold tab
  const gold = await findPhoneInTab(phone, GOLD_GID);
  if (gold.found) {
    return {
      folderId: GOLD_FOLDER_ID,
      folderName: 'Gold',
      sheetGid: GOLD_GID,
      rowIndex: gold.rowIndex,
      sheetRange: gold.sheetRange,
      headers: gold.headers,
    };
  }

  return null;
}

export async function updateInvoiceUrl(
  folderResult: FolderResult,
  invoiceUrl: string
): Promise<void> {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const headers = folderResult.headers.map((h: string) => h.trim().toLowerCase());
  const urlColIdx = headers.findIndex(
    (h: string) => h === 'invoice url' || h === 'invoiceurl' || h === 'drive url'
  );

  if (urlColIdx === -1) {
    console.warn('Invoice URL column not found in sheet headers:', folderResult.headers);
    return;
  }

  // Convert column index to A1 notation letter
  const colLetter = String.fromCharCode(65 + urlColIdx); // A=0, B=1 ...
  const rowNum = folderResult.rowIndex + 1; // 1-based for Sheets API

  // Extract sheet title from sheetRange (format: 'Sheet Title'!A:Z)
  const sheetTitle = folderResult.sheetRange.split('!')[0].replace(/'/g, '');
  const cellRange = `'${sheetTitle}'!${colLetter}${rowNum}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId: TRACKING_SHEET_ID,
    range: cellRange,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[invoiceUrl]] },
  });
}
