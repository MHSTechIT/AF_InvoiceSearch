import Papa from 'papaparse';
import { InvoiceRow, InvoiceSummary } from './types';

const SHEET_ID = process.env.SHEET_ID!;
const SHEET_GID = process.env.SHEET_GID!;

function normalize(str: string) {
  return str.trim().toLowerCase().replace(/\s+/g, ' ');
}

function mapRow(headers: string[], values: string[]): InvoiceRow {
  const row: Record<string, string> = {};
  headers.forEach((h, i) => {
    row[normalize(h)] = (values[i] ?? '').trim();
  });

  return {
    date: row['date'] ?? '',
    batch: row['batch'] ?? '',
    patientId: row['patient id'] ?? row['patientid'] ?? '',
    sNo: row['s.no'] ?? row['sno'] ?? row['s no'] ?? '',
    clientName: row['client name'] ?? row['name'] ?? '',
    phoneNo: row['phone no'] ?? row['phone'] ?? row['mobile'] ?? '',
    email: row['email'] ?? '',
    gstin: row['gstin'] ?? row['gst'] ?? row['gst no'] ?? '',
    address: row['address'] ?? row['addr'] ?? '',
    l1Batch: row['l1 batch'] ?? row['l1batch'] ?? '',
    l2Batch: row['l2 batch'] ?? row['l2batch'] ?? '',
    paymentType: row['payment type'] ?? row['paymenttype'] ?? '',
    applicationFees: row['application fees'] ?? row['app fees'] ?? '',
    invoiceNumber: row['invoice number'] ?? row['invoice no'] ?? '',
    invoiceDate: row['invoice date'] ?? row['invoicedate'] ?? '',
    invoiceAmount: row['invoice amount'] ?? row['amount'] ?? '',
    itemDescription: row['item description'] ?? row['description'] ?? row['item'] ?? '',
    ...row,
  };
}

export async function fetchSheetRows(): Promise<InvoiceRow[]> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;
  const res = await fetch(url, { redirect: 'follow', cache: 'no-store' });
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
  const csv = await res.text();

  const parsed = Papa.parse<string[]>(csv, { skipEmptyLines: true });
  const rows = parsed.data as string[][];
  if (rows.length < 2) return [];

  const headers = rows[0];
  return rows.slice(1).map(r => mapRow(headers, r));
}

export async function findByInvoiceNumber(invoiceNumber: string): Promise<InvoiceRow | null> {
  const rows = await fetchSheetRows();
  const target = invoiceNumber.trim().toLowerCase();
  return rows.find(r => r.invoiceNumber.toLowerCase() === target) ?? null;
}

export async function findByPhoneNumber(phone: string): Promise<InvoiceRow[]> {
  const rows = await fetchSheetRows();
  const target = phone.trim().replace(/\s+/g, '');
  return rows.filter(r => {
    const rowPhone = r.phoneNo.replace(/\s+/g, '');
    return rowPhone === target;
  }).filter(r => r.invoiceNumber !== ''); // only rows that have an invoice number
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
