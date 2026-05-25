'use client';
import { L2StudentRecord } from '@/lib/types';

interface Props {
  student: L2StudentRecord;
  existingInvoiceUrl?: string | null;
}

// ─── Batch badge styling ────────────────────────────────────────────────────
const BATCH_STYLES: Record<string, { bg: string; text: string; icon: string }> = {
  'Diamond':        { bg: 'bg-blue-100',   text: 'text-blue-700',   icon: '💎' },
  'Gold':           { bg: 'bg-yellow-100',  text: 'text-yellow-700', icon: '🥇' },
  'L2 Application': { bg: 'bg-orange-100',  text: 'text-orange-700', icon: '📋' },
  'L2 EMI':         { bg: 'bg-green-100',   text: 'text-green-700',  icon: '💳' },
};

export default function L2StudentCard({ student, existingInvoiceUrl }: Props) {
  const hasInvoice = !!existingInvoiceUrl;
  const style = BATCH_STYLES[student.batch] ?? { bg: 'bg-gray-100', text: 'text-gray-700', icon: '📦' };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        {/* Student Details */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-gray-800">{student.name}</h3>
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${style.bg} ${style.text}`}>
              {style.icon} {student.batch}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600">
            <span>📱 {student.phone}</span>
            {student.email && <span>✉️ {student.email}</span>}
          </div>
          {student.address && (
            <p className="text-xs text-gray-400">{student.address}</p>
          )}
          {student.gstin && (
            <p className="text-xs text-gray-500">
              <span className="font-semibold">GSTIN:</span> {student.gstin}
            </p>
          )}
        </div>

        {/* Invoice Status */}
        <div className="text-right shrink-0">
          {hasInvoice ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
              <p className="text-xs text-amber-600 font-semibold mb-0.5">Already Invoiced</p>
              <a
                href={existingInvoiceUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-amber-700 underline hover:text-amber-900 font-medium"
              >
                View Invoice
              </a>
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2.5">
              <p className="text-xs text-green-600 font-semibold">No Invoice Yet</p>
              <p className="text-xs text-green-500 mt-0.5">Ready for generation</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
