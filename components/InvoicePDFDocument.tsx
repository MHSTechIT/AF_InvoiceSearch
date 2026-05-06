import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import path from 'path';
import fs from 'fs';
import { InvoiceData } from '@/lib/types';
import { HSN } from '@/lib/invoice-calc';

const logoPath = path.join(process.cwd(), 'public', 'logo.png');

function getLogoSrc(): string | null {
  try {
    const buf = fs.readFileSync(logoPath);
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

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

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page:          { fontSize: 9, padding: 30, color: '#000' },
  title:         { textAlign: 'center', fontSize: 12, fontWeight: 'bold', borderWidth: 1, borderColor: '#000', padding: 4, marginBottom: 0 },
  headerRow:     { flexDirection: 'row', borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#000' },
  logoCell:      { width: '22%', padding: 6, borderRightWidth: 1, borderColor: '#000', alignItems: 'center', justifyContent: 'center' },
  // Change 1 — larger logo
  logo:          { width: 90, height: 65 },
  logoPlaceholder: { width: 90, height: 65, backgroundColor: '#f0f0f0' },
  companyCell:   { width: '78%', padding: 6 },
  companyName:   { fontSize: 10, fontWeight: 'bold', textDecoration: 'underline', marginBottom: 2 },
  companyDetail: { fontSize: 8, marginTop: 1.5 },
  infoRow:       { flexDirection: 'row', borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#000' },
  infoCell:      { flex: 1, padding: 4 },
  infoText:      { fontSize: 8.5 },
  billToHeader:  { backgroundColor: '#d9d9d9', borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#000', padding: 4 },
  billToLabel:   { fontSize: 9, fontWeight: 'bold' },
  billToRow:     { borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#000', padding: 6 },
  clientName:    { fontSize: 10, fontWeight: 'bold' },
  // Change 7 — updated column widths (no GST columns)
  tableHeader:   { flexDirection: 'row', borderWidth: 1, borderColor: '#000', backgroundColor: '#f2f2f2' },
  tableRow:      { flexDirection: 'row', borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#000' },
  colSNo:        { width: '6%',    padding: 3, borderRightWidth: 1, borderColor: '#000', textAlign: 'center' },
  colDesc:       { width: '42%',   padding: 3, borderRightWidth: 1, borderColor: '#000' },
  colHsn:        { width: '12%',   padding: 3, borderRightWidth: 1, borderColor: '#000', textAlign: 'center' },
  colQty:        { width: '7%',    padding: 3, borderRightWidth: 1, borderColor: '#000', textAlign: 'center' },
  colRate:       { width: '16.5%', padding: 3, borderRightWidth: 1, borderColor: '#000', textAlign: 'right' },
  colAmt:        { width: '16.5%', padding: 3, textAlign: 'right' },
  summarySection: { flexDirection: 'row', borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#000' },
  summaryLeft:   { flex: 1 },
  summaryRight:  { width: 190, borderLeftWidth: 1, borderColor: '#000' },
  summaryRow:    { flexDirection: 'row', paddingHorizontal: 6, paddingVertical: 3, borderBottomWidth: 1, borderColor: '#ddd' },
  summaryLabel:  { flex: 1, textAlign: 'right', fontSize: 8.5, paddingRight: 6 },
  summaryValue:  { width: 65, textAlign: 'right', fontSize: 8.5 },
  taxNote:       { paddingHorizontal: 6, paddingVertical: 2, textAlign: 'right', fontSize: 7.5, color: '#555', borderBottomWidth: 1, borderColor: '#ddd' },
  totalRow:      { flexDirection: 'row', paddingHorizontal: 6, paddingVertical: 4 },
  totalLabel:    { flex: 1, textAlign: 'right', fontSize: 10, fontWeight: 'bold', paddingRight: 6 },
  totalValue:    { width: 65, textAlign: 'right', fontSize: 10, fontWeight: 'bold' },
  // Change 8 — amount in words row
  amountWords:     { borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#000', padding: 5 },
  amountWordsText: { fontSize: 8 },
  tcHeader:      { fontSize: 8.5, fontWeight: 'bold', borderWidth: 1, borderColor: '#000', padding: 4, marginTop: 6 },
  tcBody:        { borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#000', padding: 5 },
  tcText:        { fontSize: 7, marginBottom: 2.5, lineHeight: 1.4 },
});

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

interface LineItem {
  sno: number;
  desc: string;
  baseAmt: number;
}

export function InvoicePDFDocument({ data }: { data: InvoiceData }) {
  const { invoiceNumber, invoiceDate, clientName, phoneNo, gstin, address, itemDescription, baseValue, cgst, sgst, total } = data;
  const logoSrc = getLogoSrc();

  // Change 3 — build line items (Application Fees & Course Fees separately)
  const appFees = data.applicationFees ?? 0;
  const courseFees = total - appFees;
  let lineItems: LineItem[];
  if (appFees > 0 && courseFees > 50) {
    lineItems = [
      { sno: 1, desc: 'Application Fees',       baseAmt: parseFloat((appFees / 1.18).toFixed(2)) },
      { sno: 2, desc: 'Course Membership Fees',  baseAmt: parseFloat((courseFees / 1.18).toFixed(2)) },
    ];
  } else if (appFees > 0) {
    lineItems = [{ sno: 1, desc: 'Application Fees', baseAmt: baseValue }];
  } else {
    lineItems = [{ sno: 1, desc: itemDescription, baseAmt: baseValue }];
  }

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>TAX INVOICE</Text>

        {/* Header */}
        <View style={s.headerRow}>
          <View style={s.logoCell}>
            {logoSrc
              ? <Image style={s.logo} src={logoSrc} />
              : <View style={s.logoPlaceholder} />
            }
          </View>
          {/* Change 4 — updated company address */}
          <View style={s.companyCell}>
            <Text style={s.companyName}>Integfarms My Health School Pvt Ltd</Text>
            <Text style={s.companyDetail}>No 108/2B, D Block, Grahalaya Paramjeeta Apartments,</Text>
            <Text style={s.companyDetail}>Poonamallee High Road, Kumananchavadi, Chennai-600056, Tamil Nadu</Text>
            <Text style={s.companyDetail}>GSTIN - 33AAHCI2845R1Z2</Text>
            <Text style={s.companyDetail}>info@myhealthschool.in</Text>
            <Text style={s.companyDetail}>+91 89259 45902</Text>
          </View>
        </View>

        {/* Change 5 — Invoice Info (Place of Supply removed) */}
        <View style={s.infoRow}>
          <View style={[s.infoCell, { borderRightWidth: 1, borderColor: '#000' }]}>
            <Text style={s.infoText}>Invoice No  :  {invoiceNumber}</Text>
          </View>
          <View style={s.infoCell}>
            <Text style={s.infoText}>Invoice Date : {invoiceDate}</Text>
          </View>
        </View>

        {/* Bill To — Change 9: phone inside address block */}
        <View style={s.billToHeader}><Text style={s.billToLabel}>Bill To</Text></View>
        <View style={s.billToRow}>
          <Text style={s.clientName}>{clientName}</Text>
          {address  ? <Text style={{ fontSize: 8, marginTop: 2 }}>{address}</Text> : null}
          {gstin    ? <Text style={{ fontSize: 8, marginTop: 1 }}>GSTIN : {gstin}</Text> : null}
          <Text style={{ fontSize: 8, marginTop: 1 }}>Phone : {phoneNo}</Text>
        </View>

        {/* Change 7 — Table Header (no GST columns) */}
        <View style={s.tableHeader}>
          <Text style={s.colSNo}>S No</Text>
          <Text style={s.colDesc}>Item &amp; Description</Text>
          <Text style={s.colHsn}>HSN{'\n'}/SAC</Text>
          <Text style={s.colQty}>Qty</Text>
          {/* Change 6 — Rate header label unchanged, but shows base value */}
          <Text style={s.colRate}>Rate</Text>
          <Text style={s.colAmt}>Amount</Text>
        </View>

        {/* Change 2+3 — Rows from lineItems array, Change 6 — Rate = base value */}
        {lineItems.map((item) => (
          <View style={s.tableRow} key={item.sno}>
            <Text style={s.colSNo}>{item.sno}</Text>
            <Text style={s.colDesc}>{item.desc}</Text>
            <Text style={s.colHsn}>{HSN}</Text>
            <Text style={s.colQty}>1</Text>
            <Text style={s.colRate}>{fmt(item.baseAmt)}</Text>
            <Text style={s.colAmt}>{fmt(item.baseAmt)}</Text>
          </View>
        ))}

        {/* Summary */}
        <View style={s.summarySection}>
          <View style={s.summaryLeft} />
          <View style={s.summaryRight}>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Base Value</Text>
              <Text style={s.summaryValue}>{fmt(baseValue)}</Text>
            </View>
            <Text style={s.taxNote}>(Tax Exclusive)</Text>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>CGST (9%)</Text>
              <Text style={s.summaryValue}>{fmt(cgst)}</Text>
            </View>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>SGST (9%)</Text>
              <Text style={s.summaryValue}>{fmt(sgst)}</Text>
            </View>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Total</Text>
              <Text style={s.totalValue}>{fmt(total)}</Text>
            </View>
          </View>
        </View>

        {/* Change 8 — Amount in Words */}
        <View style={s.amountWords}>
          <Text style={s.amountWordsText}>Amount in Words: {numberToWords(total)}</Text>
        </View>

        {/* Terms */}
        <View style={s.tcHeader}><Text>Terms &amp; Conditions</Text></View>
        <View style={s.tcBody}>
          {TERMS.map((t, i) => <Text key={i} style={s.tcText}>{t}</Text>)}
        </View>
      </Page>
    </Document>
  );
}
