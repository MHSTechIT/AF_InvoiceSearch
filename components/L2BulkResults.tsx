'use client';
import { useState } from 'react';
import { L2StudentRecord, PaymentMatch } from '@/lib/types';
import L2StudentCard from './L2StudentCard';
import L2PaymentTable from './L2PaymentTable';

export interface BulkResult {
  phone: string;
  student: L2StudentRecord | null;
  payments: PaymentMatch[];
  existingInvoiceUrl: string | null;
  error?: string;
}

interface RowState {
  updating?: boolean;
  generating?: boolean;
  message?: string;
  messageType?: 'ok' | 'err';
  driveUrl?: string;
}

// Combine all payments into a single synthetic payment (total) for invoice generation
function combinePayments(payments: PaymentMatch[]): PaymentMatch | null {
  if (payments.length === 0) return null;
  const totalAmount = payments.reduce(
    (sum, p) => sum + (parseFloat(p.amount.replace(/[^0-9.]/g, '')) || 0),
    0
  );
  const latest = payments[payments.length - 1];
  return {
    gateway: payments.map(p => p.gateway).join(' + '),
    amount: String(totalAmount),
    date: latest.date,
    phone: latest.phone,
    rowIndex: latest.rowIndex,
    category: latest.category,
  };
}

interface BatchState {
  running: 'generate' | 'update' | null;
  done: number;
  total: number;
}

export default function L2BulkResults({ results }: { results: BulkResult[] }) {
  const [state, setState] = useState<Record<string, RowState>>({});
  const [batch, setBatch] = useState<BatchState>({ running: null, done: 0, total: 0 });

  // Students eligible for write-back / invoicing (must exist in the tracker)
  const eligible = results.filter(r => r.student && r.payments.length > 0);

  function update(phone: string, patch: RowState) {
    setState(prev => ({ ...prev, [phone]: { ...prev[phone], ...patch } }));
  }

  async function handleUpdatePayments(r: BulkResult) {
    if (!r.student || r.payments.length === 0) return;
    update(r.phone, { updating: true, message: undefined });
    try {
      const res = await fetch('/api/l2/update-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: r.student.phone, payments: r.payments }),
      });
      const data = await res.json();
      if (!res.ok) {
        update(r.phone, { message: data.error || 'Update failed', messageType: 'err' });
        return;
      }
      update(r.phone, { message: data.message || 'Payments updated', messageType: 'ok' });
    } catch {
      update(r.phone, { message: 'Network error during update', messageType: 'err' });
    } finally {
      update(r.phone, { updating: false });
    }
  }

  async function handleGenerateInvoice(r: BulkResult) {
    if (!r.student) return;
    const selectedPayment = combinePayments(r.payments);
    if (!selectedPayment) return;
    update(r.phone, { generating: true, message: undefined });
    try {
      const res = await fetch('/api/l2/generate-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: r.student.phone, selectedPayment, allPayments: r.payments }),
      });
      const data = await res.json();
      if (!res.ok) {
        update(r.phone, { message: data.error || 'Invoice generation failed', messageType: 'err' });
        return;
      }
      update(r.phone, {
        message: `Invoice ${data.invoiceNumber} generated`,
        messageType: 'ok',
        driveUrl: data.driveUrl,
      });
    } catch {
      update(r.phone, { message: 'Network error during invoice generation', messageType: 'err' });
    } finally {
      update(r.phone, { generating: false });
    }
  }

  // ─── Batch actions — process every eligible number sequentially ───────────
  // Sequential (not parallel) to stay within Drive OAuth + Sheets API rate limits.
  async function handleGenerateAll() {
    if (batch.running) return;
    setBatch({ running: 'generate', done: 0, total: eligible.length });
    for (let i = 0; i < eligible.length; i++) {
      await handleGenerateInvoice(eligible[i]);
      setBatch(prev => ({ ...prev, done: i + 1 }));
    }
    setBatch(prev => ({ ...prev, running: null }));
  }

  async function handleUpdateAll() {
    if (batch.running) return;
    setBatch({ running: 'update', done: 0, total: eligible.length });
    for (let i = 0; i < eligible.length; i++) {
      await handleUpdatePayments(eligible[i]);
      setBatch(prev => ({ ...prev, done: i + 1 }));
    }
    setBatch(prev => ({ ...prev, running: null }));
  }

  const isRunning = batch.running !== null;
  const progressLabel = isRunning
    ? `${batch.running === 'generate' ? 'Generating invoices' : 'Updating payments'}… ${batch.done}/${batch.total}`
    : null;

  return (
    <div className="space-y-5">
      {/* ─── Single batch action bar for ALL numbers ─── */}
      <div className="sticky top-0 z-10 bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[180px]">
          <p className="text-sm font-semibold text-gray-800">Process all numbers</p>
          <p className="text-xs text-gray-500">
            {eligible.length} of {results.length} ready (in tracker, with payments)
          </p>
        </div>
        <button
          onClick={handleUpdateAll}
          disabled={isRunning || eligible.length === 0}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-semibold hover:opacity-90 transition disabled:opacity-60"
        >
          {batch.running === 'update' ? 'Updating…' : 'Update All Payments'}
        </button>
        <button
          onClick={handleGenerateAll}
          disabled={isRunning || eligible.length === 0}
          className="bg-green-600 text-white px-5 py-2 rounded-lg text-xs font-semibold hover:opacity-90 transition disabled:opacity-60"
        >
          {batch.running === 'generate' ? 'Generating…' : 'Generate All Invoices & Upload'}
        </button>
        {progressLabel && (
          <div className="w-full">
            <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
              <span>{progressLabel}</span>
              <span>{Math.round((batch.done / Math.max(batch.total, 1)) * 100)}%</span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${(batch.done / Math.max(batch.total, 1)) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {results.map(r => {
        const rs = state[r.phone] ?? {};
        const hasData = r.student || r.payments.length > 0;

        if (!hasData) {
          return (
            <div key={r.phone} className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center gap-3">
              <span className="font-mono text-sm text-gray-700">{r.phone}</span>
              <span className="text-xs text-gray-400">— {r.error || 'No data found'}</span>
            </div>
          );
        }

        return (
          <div key={r.phone} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-gray-700">{r.phone}</span>
              <span className="text-xs text-gray-400">{r.payments.length} payment(s)</span>
            </div>

            {r.student ? (
              <L2StudentCard student={r.student} existingInvoiceUrl={r.existingInvoiceUrl} />
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                Not in the Diamond/Gold tracker — payments shown below, but invoice can&apos;t be generated.
              </div>
            )}

            <L2PaymentTable payments={r.payments} selectedIndex={null} onSelect={() => {}} />

            {(rs.updating || rs.generating) && (
              <div className="text-xs text-gray-500">
                {rs.generating ? 'Generating invoice…' : 'Updating payments…'}
              </div>
            )}

            {rs.message && (
              <div
                className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${
                  rs.messageType === 'ok'
                    ? 'bg-green-50 border border-green-200 text-green-700'
                    : 'bg-red-50 border border-red-200 text-red-600'
                }`}
              >
                <span>{rs.message}</span>
                {rs.driveUrl && (
                  <a
                    href={rs.driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-600 hover:text-purple-800 font-medium underline"
                  >
                    Open in Drive →
                  </a>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
