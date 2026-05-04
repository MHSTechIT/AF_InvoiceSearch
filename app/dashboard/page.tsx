'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { InvoiceData, InvoiceSummary } from '@/lib/types';
import InvoicePreview from '@/components/InvoicePreview';

export default function DashboardPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [multipleResults, setMultipleResults] = useState<InvoiceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [driveLoading, setDriveLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailMsg, setEmailMsg] = useState('');
  const [driveResult, setDriveResult] = useState<{ url: string; folder: string } | null>(null);

  const isPhone = (q: string) => /^\d{10}$/.test(q.trim());

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInvoiceData(null);
    setMultipleResults([]);
    setEmailMsg('');
    setDriveResult(null);

    const res = await fetch(`/api/invoice?query=${encodeURIComponent(query.trim())}`);
    setLoading(false);

    if (res.status === 401) { router.push('/'); return; }
    if (!res.ok) {
      const d = await res.json();
      setError(d.error || 'Something went wrong');
      return;
    }

    const json = await res.json();
    if (json.type === 'single') {
      setInvoiceData(json.data);
    } else {
      setMultipleResults(json.results);
    }
  }

  async function loadInvoiceByNumber(invoiceNumber: string) {
    setLoading(true);
    setError('');
    setEmailMsg('');
    setDriveResult(null);
    const res = await fetch(`/api/invoice?query=${encodeURIComponent(invoiceNumber)}`);
    setLoading(false);
    if (!res.ok) { setError('Failed to load invoice'); return; }
    const json = await res.json();
    setMultipleResults([]);
    setInvoiceData(json.data);
  }

  async function handleDownload() {
    if (!invoiceData) return;
    setPdfLoading(true);
    setError('');
    const res = await fetch('/api/generate-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invoiceData),
    });
    setPdfLoading(false);
    if (!res.ok) { setError('PDF generation failed'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${invoiceData.invoiceNumber.replace(/\//g, '-')}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSendEmail() {
    if (!invoiceData) return;
    setEmailLoading(true);
    setEmailMsg('');
    setError('');
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invoiceData),
    });
    setEmailLoading(false);
    const d = await res.json();
    if (!res.ok) { setError(d.error || 'Email sending failed'); return; }
    setEmailMsg(d.message);
  }

  async function handleUploadToDrive() {
    if (!invoiceData) return;
    setDriveLoading(true);
    setDriveResult(null);
    setError('');
    const res = await fetch('/api/upload-drive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invoiceData),
    });
    setDriveLoading(false);
    const d = await res.json();
    if (!res.ok) { setError(d.error || 'Drive upload failed'); return; }
    setDriveResult({ url: d.fileUrl, folder: d.folder });
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
  }

  function handleReset() {
    setInvoiceData(null);
    setMultipleResults([]);
    setError('');
    setEmailMsg('');
    setDriveResult(null);
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
            <p className="text-xs text-gray-500">Invoice Generator</p>
          </div>
        </div>
        <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-red-500 transition font-medium">
          Sign Out
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Search Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-700 mb-1">Search Invoice</h2>
          <p className="text-xs text-gray-400 mb-4">
            Enter an Invoice Number <span className="font-mono bg-gray-100 px-1 rounded">MHS/DD/033</span> or a 10-digit Mobile Number
          </p>
          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                {isPhone(query) ? '📱' : '🔢'}
              </span>
              <input
                type="text"
                value={query}
                onChange={e => { setQuery(e.target.value); handleReset(); }}
                placeholder="Invoice No (MHS/DD/033) or Mobile (9626324237)"
                className="w-full border border-gray-300 rounded-lg pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 font-mono"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="bg-gradient-to-r from-purple-600 to-pink-500 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition disabled:opacity-60 whitespace-nowrap"
            >
              {loading
                ? <span className="flex items-center gap-2"><span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Searching…</span>
                : 'Get Invoice'}
            </button>
          </form>

          {error && (
            <div className="mt-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-2.5">
              ❌ {error}
            </div>
          )}
          {emailMsg && (
            <div className="mt-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-2.5">
              ✅ {emailMsg}
            </div>
          )}
          {driveResult && (
            <div className="mt-3 bg-blue-50 border border-blue-200 text-blue-700 text-sm rounded-lg px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
              <span>☁️ Uploaded to <strong>L2 {driveResult.folder}</strong> folder &amp; URL saved to tracking sheet</span>
              <a
                href={driveResult.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold hover:text-blue-900 text-xs truncate max-w-xs"
              >
                Open in Drive →
              </a>
            </div>
          )}
        </div>

        {/* Multiple Results Grid */}
        {multipleResults.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-gray-700">Multiple Invoices Found</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {multipleResults.length} invoice(s) for mobile {query} — click <strong>View</strong> to open one
                </p>
              </div>
              <span className="bg-purple-100 text-purple-700 text-xs font-semibold px-3 py-1 rounded-full">
                {multipleResults.length} Records
              </span>
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gradient-to-r from-purple-50 to-pink-50 text-gray-600 text-xs uppercase tracking-wide">
                    <th className="px-4 py-3 text-left font-semibold">Invoice No</th>
                    <th className="px-4 py-3 text-left font-semibold">Client Name</th>
                    <th className="px-4 py-3 text-left font-semibold">Date</th>
                    <th className="px-4 py-3 text-left font-semibold">Description</th>
                    <th className="px-4 py-3 text-right font-semibold">Amount (₹)</th>
                    <th className="px-4 py-3 text-center font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {multipleResults.map((r, i) => (
                    <tr key={i} className="border-t border-gray-100 hover:bg-gray-50 transition">
                      <td className="px-4 py-3 font-mono text-purple-700 font-semibold text-xs">{r.invoiceNumber}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{r.clientName}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{r.invoiceDate}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{r.itemDescription || '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-800">
                        {r.invoiceAmount
                          ? parseFloat(r.invoiceAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => loadInvoiceByNumber(r.invoiceNumber)}
                          className="bg-gradient-to-r from-purple-600 to-pink-500 text-white text-xs font-semibold px-4 py-1.5 rounded-lg hover:opacity-90 transition"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Invoice Preview + Actions */}
        {invoiceData && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
              <div className="flex items-center gap-3">
                {multipleResults.length > 0 && (
                  <button
                    onClick={() => setInvoiceData(null)}
                    className="text-sm text-gray-400 hover:text-purple-600 transition"
                  >
                    ← Back to list
                  </button>
                )}
                <h2 className="text-base font-semibold text-gray-700">
                  Invoice Preview — <span className="font-mono text-purple-600">{invoiceData.invoiceNumber}</span>
                </h2>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 flex-wrap justify-end">
                {/* Upload to Drive */}
                <button
                  onClick={handleUploadToDrive}
                  disabled={driveLoading}
                  className="flex items-center gap-2 border border-blue-400 text-blue-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-50 transition disabled:opacity-50"
                >
                  {driveLoading
                    ? <><span className="animate-spin inline-block w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full" /> Uploading…</>
                    : driveResult
                      ? <>☁️ Uploaded to {driveResult.folder}</>
                      : <>☁️ Upload to Drive</>
                  }
                </button>

                {/* Send Email */}
                <button
                  onClick={handleSendEmail}
                  disabled={emailLoading || !invoiceData.email}
                  title={!invoiceData.email ? 'No email on record' : ''}
                  className="flex items-center gap-2 border border-purple-400 text-purple-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {emailLoading
                    ? <><span className="animate-spin inline-block w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full" /> Sending…</>
                    : <>✉️ {invoiceData.email ? `Send to ${invoiceData.email}` : 'No email'}</>
                  }
                </button>

                {/* Download PDF */}
                <button
                  onClick={handleDownload}
                  disabled={pdfLoading}
                  className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-pink-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition disabled:opacity-60"
                >
                  {pdfLoading
                    ? <><span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" /> Generating…</>
                    : <>⬇️ Download PDF</>
                  }
                </button>
              </div>
            </div>

            <InvoicePreview data={invoiceData} />
          </div>
        )}
      </div>
    </div>
  );
}
