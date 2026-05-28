'use client';
import { useState } from 'react';
import { PaymentMatch } from '@/lib/types';

interface Props {
  payments: PaymentMatch[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onPaymentEdited?: (index: number, updated: PaymentMatch) => void;
}

const fmt = (raw: string) => {
  const num = parseFloat(raw.replace(/[^0-9.]/g, ''));
  if (isNaN(num)) return raw;
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2 });
};

export default function L2PaymentTable({ payments, onPaymentEdited }: Props) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDate, setEditDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [editMsg, setEditMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  function startEdit(idx: number) {
    const p = payments[idx];
    setEditingIdx(idx);
    setEditAmount(p.amount.replace(/[^0-9.]/g, ''));
    setEditDate(p.date);
    setEditMsg(null);
  }

  function cancelEdit() {
    setEditingIdx(null);
    setEditAmount('');
    setEditDate('');
    setEditMsg(null);
  }

  async function saveEdit(idx: number) {
    const p = payments[idx];
    setSaving(true);
    setEditMsg(null);

    try {
      const res = await fetch('/api/l2/edit-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gateway: p.gateway,
          rowIndex: p.rowIndex,
          newAmount: editAmount.trim(),
          newDate: editDate.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setEditMsg({ type: 'error', text: data.error || 'Update failed' });
        return;
      }

      setEditMsg({ type: 'success', text: `${p.gateway} row ${p.rowIndex} updated` });

      // Notify parent of the edit so the combined payment recalculates
      if (onPaymentEdited) {
        onPaymentEdited(idx, {
          ...p,
          amount: editAmount.trim(),
          date: editDate.trim(),
        });
      }

      setEditingIdx(null);
    } catch {
      setEditMsg({ type: 'error', text: 'Network error' });
    } finally {
      setSaving(false);
    }
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

      {editMsg && (
        <div className={`mb-3 text-sm rounded-lg px-4 py-2 ${
          editMsg.type === 'success'
            ? 'bg-green-50 border border-green-200 text-green-700'
            : 'bg-red-50 border border-red-200 text-red-600'
        }`}>
          {editMsg.text}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gradient-to-r from-purple-50 to-pink-50 text-gray-600 text-xs uppercase tracking-wide">
              <th className="px-4 py-3 text-left font-semibold">Gateway</th>
              <th className="px-4 py-3 text-right font-semibold">Amount</th>
              <th className="px-4 py-3 text-left font-semibold">Date</th>
              <th className="px-4 py-3 text-left font-semibold">Phone</th>
              <th className="px-4 py-3 text-center font-semibold">Row #</th>
              <th className="px-4 py-3 text-center font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p, i) => (
              <tr
                key={`${p.gateway}-${p.rowIndex}-${i}`}
                className={`border-t border-gray-100 transition ${
                  editingIdx === i ? 'bg-amber-50' : 'hover:bg-gray-50'
                }`}
              >
                <td className="px-4 py-3">
                  <span className="font-semibold text-gray-800">{p.gateway}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  {editingIdx === i ? (
                    <input
                      type="text"
                      value={editAmount}
                      onChange={e => setEditAmount(e.target.value)}
                      className="w-28 border border-amber-300 rounded px-2 py-1 text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  ) : (
                    <span className="font-semibold text-gray-800 font-mono">{fmt(p.amount)}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {editingIdx === i ? (
                    <input
                      type="text"
                      value={editDate}
                      onChange={e => setEditDate(e.target.value)}
                      className="w-32 border border-amber-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  ) : (
                    <span className="text-gray-500 text-xs">{p.date || '—'}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.phone}</td>
                <td className="px-4 py-3 text-center text-gray-400 text-xs">{p.rowIndex}</td>
                <td className="px-4 py-3 text-center">
                  {editingIdx === i ? (
                    <div className="flex gap-1 justify-center">
                      <button
                        onClick={() => saveEdit(i)}
                        disabled={saving}
                        className="text-xs bg-green-500 text-white px-2.5 py-1 rounded font-medium hover:bg-green-600 transition disabled:opacity-50"
                      >
                        {saving ? '...' : 'Save'}
                      </button>
                      <button
                        onClick={cancelEdit}
                        disabled={saving}
                        className="text-xs bg-gray-200 text-gray-600 px-2.5 py-1 rounded font-medium hover:bg-gray-300 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEdit(i)}
                      className="text-xs text-amber-600 hover:text-amber-800 font-medium transition"
                    >
                      ✏️ Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
