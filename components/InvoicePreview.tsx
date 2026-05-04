'use client';
import { InvoiceData } from '@/lib/types';
import { HSN } from '@/lib/invoice-calc';

const fmt = (n: number) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

export default function InvoicePreview({ data }: { data: InvoiceData }) {
  const { invoiceNumber, invoiceDate, clientName, phoneNo, gstin, address, itemDescription, baseValue, cgst, sgst, total } = data;
  const sNo = invoiceNumber.split('/').pop() ?? '1';

  return (
    <div className="border border-gray-300 rounded bg-white text-[11px]" style={{ fontFamily: 'Arial, sans-serif' }}>

      {/* Title */}
      <div className="text-center font-bold text-sm py-2 border-b border-gray-400 bg-gray-50">
        TAX INVOICE
      </div>

      {/* Header: Logo + Company */}
      <div className="flex border-b border-gray-400">
        <div className="w-1/4 flex items-center justify-center p-3 border-r border-gray-400">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="MHS Logo" className="h-14 object-contain" />
        </div>
        <div className="w-3/4 p-3 space-y-0.5">
          <p className="font-bold text-sm underline">Integfarms My Health School Pvt Ltd</p>
          <p>Tamil Nadu India</p>
          <p>GSTIN 33AAHCI2845R1Z2</p>
          <p>9524444664 &nbsp;&nbsp; TAX INVOICE</p>
          <p>info@myhealthschool.in</p>
        </div>
      </div>

      {/* Invoice No & Date */}
      <div className="flex border-b border-gray-400">
        <div className="flex-1 p-2 border-r border-gray-400">
          <span className="font-semibold">Invoice No</span> : {invoiceNumber}
        </div>
        <div className="flex-1 p-2 flex gap-6 flex-wrap">
          <span><span className="font-semibold">Invoice Date</span> : {invoiceDate}</span>
          <span><span className="font-semibold">Place Of Supply</span> : Tamil Nadu (33)</span>
        </div>
      </div>

      {/* Bill To */}
      <div className="bg-gray-200 font-bold p-2 border-b border-gray-400">Bill To</div>
      <div className="p-3 border-b border-gray-400 space-y-0.5">
        <p className="font-bold text-sm">{clientName}</p>
        {address && <p className="text-gray-600">{address}</p>}
        {gstin && <p className="text-gray-600"><span className="font-semibold">GSTIN :</span> {gstin}</p>}
      </div>
      <div className="flex p-2 border-b border-gray-400">
        <span className="font-semibold w-12">Phone</span>
        <span>{phoneNo}</span>
      </div>

      {/* Table */}
      <table className="w-full border-collapse border-b border-gray-400 text-[10.5px]">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-400 p-1.5 text-center w-8">S No</th>
            <th className="border border-gray-400 p-1.5 text-left">Item & Description</th>
            <th className="border border-gray-400 p-1.5 text-center w-16">HSN/SAC</th>
            <th className="border border-gray-400 p-1.5 text-center w-8">Qty</th>
            <th className="border border-gray-400 p-1.5 text-right w-20">Rate</th>
            <th className="border border-gray-400 p-1.5 text-center w-10">CGST %</th>
            <th className="border border-gray-400 p-1.5 text-right w-20">CGST Amt</th>
            <th className="border border-gray-400 p-1.5 text-center w-10">SGST %</th>
            <th className="border border-gray-400 p-1.5 text-right w-20">SGST Amt</th>
            <th className="border border-gray-400 p-1.5 text-right w-24">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-gray-400 p-1.5 text-center">{sNo}</td>
            <td className="border border-gray-400 p-1.5">{itemDescription}</td>
            <td className="border border-gray-400 p-1.5 text-center">{HSN}</td>
            <td className="border border-gray-400 p-1.5 text-center">1</td>
            <td className="border border-gray-400 p-1.5 text-right">{fmt(total)}</td>
            <td className="border border-gray-400 p-1.5 text-center">9%</td>
            <td className="border border-gray-400 p-1.5 text-right">{fmt(cgst)}</td>
            <td className="border border-gray-400 p-1.5 text-center">9%</td>
            <td className="border border-gray-400 p-1.5 text-right">{fmt(sgst)}</td>
            <td className="border border-gray-400 p-1.5 text-right">{fmt(total)}</td>
          </tr>
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

      {/* Terms & Conditions */}
      <div className="bg-gray-100 font-bold p-2 border-b border-gray-400 text-[10.5px]">
        Terms & Conditions
      </div>
      <div className="p-3 space-y-1">
        {TERMS.map((t, i) => (
          <p key={i} className="text-[9.5px] text-gray-700 leading-relaxed">{t}</p>
        ))}
      </div>
    </div>
  );
}
