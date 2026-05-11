'use client';
import { InvoiceData } from '@/lib/types';
import { HSN } from '@/lib/invoice-calc';

const fmt = (n: number) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Number to Words (Indian system) ─────────────────────────────────────────
const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function convertChunk(n: number): string {
  if (n === 0) return '';
  if (n < 20) return ONES[n] + ' ';
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '') + ' ';
  return ONES[Math.floor(n / 100)] + ' Hundred ' + convertChunk(n % 100);
}

function numberToWords(n: number): string {
  const rupees = Math.floor(n);
  const paise = Math.round((n - rupees) * 100);
  let result = '';
  if (rupees === 0) {
    result = 'Zero';
  } else {
    let rem = rupees;
    if (rem >= 10000000) { result += convertChunk(Math.floor(rem / 10000000)) + 'Crore '; rem %= 10000000; }
    if (rem >= 100000)   { result += convertChunk(Math.floor(rem / 100000))   + 'Lakh ';  rem %= 100000; }
    if (rem >= 1000)     { result += convertChunk(Math.floor(rem / 1000))     + 'Thousand '; rem %= 1000; }
    if (rem > 0)         { result += convertChunk(rem); }
  }
  result = 'Rupees ' + result.trim();
  if (paise > 0) result += ' and ' + convertChunk(paise).trim() + ' Paise';
  return result + ' Only';
}

const TERMS = [
  '1) Personal Access Only: Course access is for the enrolled participant only. Sharing login, videos, or materials is not permitted.',
  '2) Health & Safety: Please do not change or stop any medications without consulting your doctor. The course is not a substitute for medical advice.',
  '3) Pregnancy Policy: If pregnancy occurs, kindly inform us. Course access will be paused during pregnancy and lactation.',
  '4) Medical Emergency Pause: In case of surgeries, hospitalization, accidents, or family loss, a temporary pause may be approved based on management discretion.',
  '5) Attendance Commitment: Personal events (travel, celebrations, exams, busy schedule) cannot be considered for extensions or compensation.',
  '6) No Extensions: Course duration is fixed; additional days or make-up sessions will not be provided.',
  '7) Registered Number: The mobile number provided at enrollment cannot be changed after access is activated.',
  '8) Device & Internet: A good device and stable internet are required for smooth course access.',
  '9) No Batch Changes: Batch changes are not allowed once the program begins.',
  'Refund Policy: Fees are non-refundable. However, in exceptional cases, the management may review the situation. Applicable charges will be deducted, and the final refundable amount (if any) will be decided by the management based on the services utilized.',
];

interface LineItem {
  sno: number;
  desc: string;
  baseAmt: number;
}

export default function InvoicePreview({ data }: { data: InvoiceData }) {
  const { invoiceNumber, invoiceDate, clientName, phoneNo, gstin, address, itemDescription, baseValue, cgst, sgst, total } = data;

  // Change 3 — build line items (Application Fees & Course Fees separately)
  const appFees = data.applicationFees ?? 0;
  const courseFees = total - appFees;
  let lineItems: LineItem[];
  if (appFees > 0 && courseFees > 50) {
    lineItems = [
      { sno: 1, desc: 'Application Fees',      baseAmt: parseFloat((appFees / 1.18).toFixed(2)) },
      { sno: 2, desc: 'Course Membership Fees', baseAmt: parseFloat((courseFees / 1.18).toFixed(2)) },
    ];
  } else if (appFees > 0) {
    lineItems = [{ sno: 1, desc: 'Application Fees', baseAmt: baseValue }];
  } else {
    lineItems = [{ sno: 1, desc: itemDescription, baseAmt: baseValue }];
  }

  return (
    <div className="border border-gray-300 rounded bg-white text-[11px]" style={{ fontFamily: 'Arial, sans-serif' }}>

      {/* Title */}
      <div className="text-center font-bold text-sm py-2 border-b border-gray-400 bg-gray-50">
        TAX INVOICE
      </div>

      {/* Change 1 — larger logo | Change 4 — updated address */}
      <div className="flex border-b border-gray-400">
        <div className="w-1/4 flex items-center justify-center p-4 border-r border-gray-400">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="MHS Logo" className="w-full max-h-28 object-contain" />
        </div>
        <div className="w-3/4 p-3 space-y-0.5">
          <p className="font-bold text-sm underline">Integfarms My Health School Pvt Ltd</p>
          <p>No 108/2B, D Block, Grahalaya Paramjeeta Apartments,</p>
          <p>Poonamallee High Road, Kumananchavadi, Chennai-600056, Tamil Nadu</p>
          <p>GSTIN - 33AAHCI2845R1Z2</p>
          <p>info@myhealthschool.in</p>
          <p>+91 89259 45902</p>
        </div>
      </div>

      {/* Change 5 — removed Place of Supply */}
      <div className="flex border-b border-gray-400">
        <div className="flex-1 p-2 border-r border-gray-400">
          <span className="font-semibold">Invoice No</span> : {invoiceNumber}
        </div>
        <div className="flex-1 p-2">
          <span className="font-semibold">Invoice Date</span> : {invoiceDate}
        </div>
      </div>

      {/* Bill To — Change 9: phone inside address block */}
      <div className="bg-gray-200 font-bold p-2 border-b border-gray-400">Bill To</div>
      <div className="p-3 border-b border-gray-400 space-y-0.5">
        <p className="font-bold text-sm">{clientName}</p>
        {address && <p className="text-gray-600">{address}</p>}
        {gstin   && <p className="text-gray-600"><span className="font-semibold">GSTIN :</span> {gstin}</p>}
        <p className="text-gray-600"><span className="font-semibold">Phone :</span> {phoneNo}</p>
      </div>

      {/* Change 7 — removed CGST/SGST columns | Change 6 — Rate = base value */}
      <table className="w-full border-collapse border-b border-gray-400 text-[10.5px]">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-400 p-1.5 text-center w-8">S No</th>
            <th className="border border-gray-400 p-1.5 text-left">Item &amp; Description</th>
            <th className="border border-gray-400 p-1.5 text-center w-16">HSN/SAC</th>
            <th className="border border-gray-400 p-1.5 text-center w-8">Qty</th>
            <th className="border border-gray-400 p-1.5 text-right w-24">Rate</th>
            <th className="border border-gray-400 p-1.5 text-right w-24">Amount</th>
          </tr>
        </thead>
        <tbody>
          {/* Change 2+3 — rows from lineItems, Change 6 — shows baseAmt */}
          {lineItems.map((item) => (
            <tr key={item.sno}>
              <td className="border border-gray-400 p-1.5 text-center">{item.sno}</td>
              <td className="border border-gray-400 p-1.5">{item.desc}</td>
              <td className="border border-gray-400 p-1.5 text-center">{HSN}</td>
              <td className="border border-gray-400 p-1.5 text-center">1</td>
              <td className="border border-gray-400 p-1.5 text-right">{fmt(item.baseAmt)}</td>
              <td className="border border-gray-400 p-1.5 text-right">{fmt(item.baseAmt)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Summary */}
      <div className="flex border-b border-gray-400">
        <div className="flex-1" />
        <div className="w-60 border-l border-gray-400 text-right">
          <div className="flex justify-between px-3 py-1.5 border-b border-gray-200">
            <span className="text-gray-600">Base Value</span>
            <span>{fmt(baseValue)}</span>
          </div>
          <div className="flex justify-end px-3 py-0.5 border-b border-gray-200">
            <span className="text-gray-400 text-[10px]">(Tax Exclusive)</span>
          </div>
          <div className="flex justify-between px-3 py-1.5 border-b border-gray-200">
            <span className="text-gray-600">CGST (9%)</span>
            <span>{fmt(cgst)}</span>
          </div>
          <div className="flex justify-between px-3 py-1.5 border-b border-gray-200">
            <span className="text-gray-600">SGST (9%)</span>
            <span>{fmt(sgst)}</span>
          </div>
          <div className="flex justify-between px-3 py-2 font-bold text-sm">
            <span>Total</span>
            <span>{fmt(total)}</span>
          </div>
        </div>
      </div>

      {/* Change 8 — Amount in Words */}
      <div className="p-2 border-b border-gray-400 text-[10px] italic">
        <span className="font-semibold not-italic">Amount in Words:</span> {numberToWords(total)}
      </div>

      {/* Terms & Conditions */}
      <div className="bg-gray-100 font-bold p-2 border-b border-gray-400 text-[10.5px]">
        Terms &amp; Conditions
      </div>
      <div className="p-3 space-y-1">
        {TERMS.map((t, i) => (
          <p key={i} className="text-[9.5px] text-gray-700 leading-relaxed">{t}</p>
        ))}
      </div>
    </div>
  );
}
