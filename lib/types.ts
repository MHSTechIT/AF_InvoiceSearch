export interface InvoiceRow {
  date: string;
  batch: string;
  patientId: string;
  sNo: string;
  clientName: string;
  phoneNo: string;
  email: string;
  gstin: string;
  address: string;
  l1Batch: string;
  l2Batch: string;
  paymentType: string;
  applicationFees: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceAmount: string;
  itemDescription: string;
  [key: string]: string;
}

export interface InvoiceData {
  invoiceNumber: string;
  invoiceDate: string;
  clientName: string;
  phoneNo: string;
  email: string;
  gstin: string;
  address: string;
  batch: string;
  itemDescription: string;
  amount: number;
  baseValue: number;
  cgst: number;
  sgst: number;
  total: number;
  applicationFees?: number;
}

export interface InvoiceSummary {
  invoiceNumber: string;
  invoiceDate: string;
  clientName: string;
  phoneNo: string;
  email: string;
  invoiceAmount: string;
  itemDescription: string;
}

// ─── L2 Payment Verification Types ──────────────────────────────────────────

export interface PaymentMatch {
  gateway: string;       // e.g., "ICICI", "Razorpay"
  amount: string;        // raw cell value from amount column
  date: string;          // raw cell value from date column
  phone: string;         // the matched phone value
  rowIndex: number;      // row number in the gateway tab (for reference)
  category: string;      // raw category cell (e.g. "002 L2 Application") — used to mark the Application Fee
}

export interface L2StudentRecord {
  name: string;
  phone: string;
  email: string;
  address: string;
  gstin: string;
  batch: string;           // "Diamond" or "Gold"
  rowIndex: number;        // 0-based row in the tab (including header)
  tabName: string;         // "L2 Diamond Accounts" or "L2 Gold Accounts"
  existingInvoiceNumber: string;
  existingInvoiceDate: string;
  existingInvoiceAmount: string;
  // Column indices (0-based) detected from headers — used for write-back
  invoiceNumColIdx: number;   // "Invoice Number" column
  invoiceDateColIdx: number;  // "Invoice Date" column
  invoiceAmtColIdx: number;   // "Invoice Amount" column
  paymentStartColIdx: number; // First payment column ("Application Fees" Mode of)
}
