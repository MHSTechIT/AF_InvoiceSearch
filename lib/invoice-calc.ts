import { InvoiceRow, InvoiceData } from './types';

const GST_RATE = 0.18; // 9% CGST + 9% SGST
const HSN = '999249';

export function buildInvoiceData(row: InvoiceRow): InvoiceData {
  const rawAmount = parseFloat(row.invoiceAmount.replace(/[^0-9.]/g, '')) || 0;
  // Amounts are GST-inclusive
  const baseValue = parseFloat((rawAmount / (1 + GST_RATE)).toFixed(2));
  const cgst = parseFloat((baseValue * 0.09).toFixed(2));
  const sgst = parseFloat((baseValue * 0.09).toFixed(2));

  const itemDescription = row.itemDescription ||
    (row.applicationFees && parseFloat(row.applicationFees) > 0 && parseFloat(row.invoiceAmount) <= 1000
      ? 'Application Fees'
      : 'Course Membership Fees');

  return {
    invoiceNumber: row.invoiceNumber,
    invoiceDate: row.invoiceDate || row.date || new Date().toLocaleDateString('en-IN'),
    clientName: row.clientName,
    phoneNo: row.phoneNo,
    email: row.email,
    gstin: row.gstin || '',
    address: row.address || '',
    batch: row.batch,
    itemDescription,
    amount: rawAmount,
    baseValue,
    cgst,
    sgst,
    total: rawAmount,
  };
}

export { HSN };
