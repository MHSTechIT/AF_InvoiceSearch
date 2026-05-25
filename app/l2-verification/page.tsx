'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { L2StudentRecord, PaymentMatch } from '@/lib/types';
import L2StudentCard from '@/components/L2StudentCard';
import L2PaymentTable from '@/components/L2PaymentTable';

export default function L2VerificationPage() {
  const router = useRouter();

  // ─── Search Phase ──────────────────────────────────────────────────────────
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ─── Results Phase ─────────────────────────────────────────────────────────
  const [student, setStudent] = useState<L2StudentRecord | null>(null);
  const [payments, setPayments] = useState<PaymentMatch[]>([]);
  const [existingInvoiceUrl, setExistingInvoiceUrl] = useState<string | null>(null);

  // ─── Update Phase ──────────────────────────────────────────────────────────
  const [updating, setUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState<string | null>(null);

  // ─── Invoice Phase ─────────────────────────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const [invoiceResult, setInvoiceResult] = useState<{
    invoiceNumber: string;
    driveUrl: string;
    invoiceDate: string;
    invoiceAmount: string;
  } | null>(null);

  // ─── Combine all payments into one for invoice (total amount) ───────────
  function getCombinedPayment(): PaymentMatch | null {
    if (payments.length === 0) return null;
    // Sum all payment amounts
    const totalAmount = payments.reduce((sum, p) => {
      return sum + (parseFloat(p.amount.replace(/[^0-9.]/g, '')) || 0);
    }, 0);
    // Use the most recent payment's date and the first gateway as label
    const gateways = payments.map(p => p.gateway).join(' + ');
    const latestPayment = payments[payments.length - 1];
    return {
      gateway: gateways,
      amount: String(totalAmount),
      date: latestPayment.date,
      phone: latestPayment.phone,
      rowIndex: latestPayment.rowIndex,
    };
  }

  // ─── Search handler ────────────────────────────────────────────────────────
  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setStudent(null);
    setPayments([]);
    setExistingInvoiceUrl(null);
    setUpdateResult(null);
    setInvoiceResult(null);

    try {
      const res = await fetch(`/api/l2/verify-payment?phone=${encodeURIComponent(phone.trim())}`);
      if (res.status === 401) { router.push('/'); return; }

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Verification failed');
        return;
      }

      setStudent(data.student);
      setPayments(data.payments);
      setExistingInvoiceUrl(data.existingInvoiceUrl || null);
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  // ─── Update payments to tracker sheet ──────────────────────────────────────
  async function handleUpdatePayments() {
    if (!student || payments.length === 0) return;

    setUpdating(true);
    setError('');
    setUpdateResult(null);

    try {
      const res = await fetch('/api/l2/update-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: student.phone, payments }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Payment update failed');
        return;
      }

      setUpdateResult(data.message);
    } catch {
      setError('Network error during payment update');
    } finally {
      setUpdating(false);
    }
  }

  // ─── Generate Invoice ─────────────────────────────────────────────────────
  async function handleGenerateInvoice() {
    if (!student) return;

    const selectedPayment = getCombinedPayment();
    if (!selectedPayment) return;

    setGenerating(true);
    setError('');

    try {
      const res = await fetch('/api/l2/generate-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: student.phone,
          selectedPayment,
          allPayments: payments,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.existingInvoiceUrl) {
          setExistingInvoiceUrl(data.existingInvoiceUrl);
        }
        setError(data.error || 'Invoice generation failed');
        return;
      }

      setInvoiceResult({
        invoiceNumber: data.invoiceNumber,
        driveUrl: data.driveUrl,
        invoiceDate: data.invoiceDate,
        invoiceAmount: data.invoiceAmount,
      });
      setExistingInvoiceUrl(data.driveUrl);
    } catch {
      setError('Network error during invoice generation');
    } finally {
      setGenerating(false);
    }
  }

  // ─── Reset to new search ──────────────────────────────────────────────────
  function handleNewSearch() {
    setPhone('');
    setStudent(null);
    setPayments([]);
    setExistingInvoiceUrl(null);
    setUpdateResult(null);
    setInvoiceResult(null);
    setError('');
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <div className="bg-white shadow-sm border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="MHS" className="h-9 object-contain" />
          <div>
            <p className="text-sm font-bold text-gray-800 leading-tight">My Health School</p>
            <p className="text-xs text-gray-500">L2 Payment Verification</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="/dashboard"
            className="text-sm text-purple-600 hover:text-purple-800 transition font-medium"
          >
            Invoice Search
          </a>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-red-500 transition font-medium"
          >
            Sign Out
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* ── Search Card ──────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-700 mb-1">L2 Payment Verification</h2>
          <p className="text-xs text-gray-400 mb-4">
            Enter a 10-digit mobile number to search student record and verify payments across all gateways
          </p>
          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">📱</span>
              <input
                type="text"
                value={phone}
                onChange={e => { setPhone(e.target.value); }}
                placeholder="Enter 10-digit mobile number"
                className="w-full border border-gray-300 rounded-lg pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 font-mono"
                required
                maxLength={10}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="bg-gradient-to-r from-purple-600 to-pink-500 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition disabled:opacity-60 whitespace-nowrap"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  Verifying...
                </span>
              ) : (
                'Verify Payment'
              )}
            </button>
          </form>

          {error && (
            <div className="mt-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-2.5">
              {error}
            </div>
          )}
          {updateResult && (
            <div className="mt-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-2.5">
              {updateResult}
            </div>
          )}
        </div>

        {/* ── Student Card + Payments ─────────────────────────────────────── */}
        {student && (
          <>
            <L2StudentCard student={student} existingInvoiceUrl={existingInvoiceUrl} />
            <L2PaymentTable
              payments={payments}
              selectedIndex={null}
              onSelect={() => {}}
            />

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 flex-wrap">
              {/* Update Payments button — show before update is done */}
              {payments.length > 0 && !updateResult && (
                <button
                  onClick={handleUpdatePayments}
                  disabled={updating}
                  className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-pink-500 text-white px-8 py-3 rounded-lg text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
                >
                  {updating ? (
                    <>
                      <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      Updating Sheet...
                    </>
                  ) : (
                    'Update Payments to Sheet'
                  )}
                </button>
              )}

              {/* Generate Invoice button — show after payment update */}
              {updateResult && !invoiceResult && (
                <button
                  onClick={handleGenerateInvoice}
                  disabled={generating}
                  className="flex items-center gap-2 bg-gradient-to-r from-green-600 to-emerald-500 text-white px-8 py-3 rounded-lg text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
                >
                  {generating ? (
                    <>
                      <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      Generating Invoice...
                    </>
                  ) : (
                    'Generate Invoice & Upload to Drive'
                  )}
                </button>
              )}
            </div>

            {/* Invoice Success Card */}
            {invoiceResult && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-6 space-y-3">
                <h3 className="text-sm font-semibold text-green-800 flex items-center gap-2">
                  <span className="text-lg">✅</span> Invoice Generated Successfully
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">Invoice #:</span>{' '}
                    <span className="font-mono font-semibold text-gray-800">{invoiceResult.invoiceNumber}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Date:</span>{' '}
                    <span className="text-gray-800">{invoiceResult.invoiceDate}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Amount:</span>{' '}
                    <span className="font-semibold text-gray-800">₹{Number(invoiceResult.invoiceAmount).toLocaleString('en-IN')}</span>
                  </div>
                  <div>
                    <a
                      href={invoiceResult.driveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-600 hover:text-purple-800 font-medium underline"
                    >
                      Open in Drive →
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* New Search — show after invoice generated */}
            {invoiceResult && (
              <div className="flex justify-end">
                <button
                  onClick={handleNewSearch}
                  className="flex items-center gap-2 border border-gray-300 text-gray-600 px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
                >
                  New Search
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
