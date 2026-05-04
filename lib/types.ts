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
