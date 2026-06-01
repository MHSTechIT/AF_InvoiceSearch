import { InvoiceData, L2StudentRecord, PaymentMatch } from './types';

const GST_RATE = 0.18; // 9% CGST + 9% SGST

/**
 * Build InvoiceData from an L2 student record and all verified payments.
 * First payment (by date) = application fees, rest = course membership fees.
 * Uses the same GST calculation as the existing invoice-calc.ts.
 * Output is fully compatible with InvoicePDFDocument and InvoicePreview.
 */
export function buildL2InvoiceData(
  student: L2StudentRecord,
  payment: PaymentMatch,
  invoiceNumber: string,
  allPayments?: PaymentMatch[],
  overrideDate?: string
): InvoiceData {
  // If allPayments provided, sum all amounts and separate app fees
  let totalAmount: number;
  let appFeeAmount = 0;

  if (allPayments && allPayments.length > 0) {
    totalAmount = 0;
    for (const p of allPayments) {
      totalAmount += parseFloat(p.amount.replace(/[^0-9.]/g, '')) || 0;
    }
    // First payment (by date order, oldest first) is the application fee
    if (allPayments.length > 0) {
      appFeeAmount = parseFloat(allPayments[0].amount.replace(/[^0-9.]/g, '')) || 0;
    }
  } else {
    // Fallback: single payment
    totalAmount = parseFloat(payment.amount.replace(/[^0-9.]/g, '')) || 0;
  }

  // Amounts are GST-inclusive (same formula as invoice-calc.ts)
  const baseValue = parseFloat((totalAmount / (1 + GST_RATE)).toFixed(2));
  const cgst = parseFloat((baseValue * 0.09).toFixed(2));
  const sgst = parseFloat((baseValue * 0.09).toFixed(2));

  // Use override date if provided, otherwise format today's date as DD MMM YYYY
  let invoiceDate: string;
  if (overrideDate?.trim()) {
    invoiceDate = overrideDate.trim();
  } else {
    const today = new Date();
    invoiceDate = today.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  return {
    invoiceNumber,
    invoiceDate,
    clientName: student.name,
    phoneNo: student.phone,
    email: student.email,
    gstin: student.gstin,
    address: student.address,
    batch: student.batch,
    itemDescription: 'Course Membership Fees',
    amount: totalAmount,
    baseValue,
    cgst,
    sgst,
    total: totalAmount,
    applicationFees: appFeeAmount > 0 ? appFeeAmount : undefined,
  };
}
