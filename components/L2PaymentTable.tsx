'use client';
import { PaymentMatch } from '@/lib/types';

interface Props {
  payments: PaymentMatch[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}

const fmt = (raw: string) => {
  const num = parseFloat(raw.replace(/[^0-9.]/g, ''));
  if (isNaN(num)) return raw;
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2 });
};

export default function L2PaymentTable({ payments }: Props) {
  if (payments.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center">
        <p className="text-gray-400 text-sm">No payment records found across any gateway.</p>
        <p className="text-gray-300 text-xs mt-1">
          Try verifying the phone number or check gateway sheets manually.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-700">Payment Records</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {payments.length} payment(s) found across gateways
          </p>
        </div>
        <span className="bg-purple-100 text-purple-700 text-xs font-semibold px-3 py-1 rounded-full">
          {payments.length} Found
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gradient-to-r from-purple-50 to-pink-50 text-gray-600 text-xs uppercase tracking-wide">
              <th className="px-4 py-3 text-left font-semibold">Gateway</th>
              <th className="px-4 py-3 text-right font-semibold">Amount</th>
              <th className="px-4 py-3 text-left font-semibold">Date</th>
              <th className="px-4 py-3 text-left font-semibold">Phone</th>
              <th className="px-4 py-3 text-center font-semibold">Row #</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p, i) => (
              <tr
                key={`${p.gateway}-${p.rowIndex}-${i}`}
                className="border-t border-gray-100 hover:bg-gray-50 transition"
              >
                <td className="px-4 py-3">
                  <span className="font-semibold text-gray-800">{p.gateway}</span>
                </td>
                <td className="px-4 py-3 text-right font-semibold text-gray-800 font-mono">
                  {fmt(p.amount)}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{p.date || '—'}</td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.phone}</td>
                <td className="px-4 py-3 text-center text-gray-400 text-xs">{p.rowIndex}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
