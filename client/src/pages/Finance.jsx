import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Banknote, CircleDollarSign, CreditCard, Eye, FilePlus2, FileText, Plus, ReceiptText, Search, Send, Trash2, WalletCards } from 'lucide-react';
import { api, formatDate, formatMoney } from '../api.js';
import { Badge, Button, Card, Field, Modal, Spinner, Toast } from '../components/UI.jsx';
import { useAuth } from '../auth.jsx';
import { tr } from '../i18n.js';
import { can } from '../permissions.js';
import studyBirdsLogo from '../assets/logo.jpeg';

const today = '2026-07-22';
const paymentMethods = ['Cash', 'Bank Transfer', 'Card', 'InstaPay', 'Vodafone Cash'];
const currencies = ['EGP', 'USD', 'EUR', 'GBP'];

const createInstallment = (index = 0) => ({
  id: `inst-${Date.now()}-${index}`,
  label: `القسط ${index + 1}`,
  dueDate: '',
  amount: ''
});

const invoiceBlank = {
  studentId: '',
  description: 'أتعاب خدمات التقديم الجامعي',
  paymentStatement: 'دفعة من أتعاب التقديم الجامعي',
  currency: 'USD',
  exchangeRate: '1',
  serviceFee: '',
  universityFee: '',
  visaFee: '',
  tax: '0',
  dueDate: '',
  notes: '',
  installments: []
};

const paymentBlank = {
  amount: '',
  currency: 'USD',
  exchangeRate: '1',
  method: 'Bank Transfer',
  reference: '',
  date: today,
  statement: '',
  installmentId: '',
  notes: '',
  attachment: null
};

const numberValue = value => Number(value || 0);
const formatDateTime = value =>
  value
    ? new Intl.DateTimeFormat('ar-EG', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(value))
    : '—';

const escapeHtml = value =>
  String(value ?? '—')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const receiptPrintStyles = `
  @page { size: A4; margin: 14mm; }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:#ffffff}
  body{font-family:Arial,sans-serif;color:#172033;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .print-shell{padding:0}
  .receipt-sheet{border:1px solid #dbe3ef;border-radius:18px;padding:18px;background:linear-gradient(180deg,#fff,#f8fbff)}
  .receipt-head,.receipt-summary,.receipt-foot{display:flex;justify-content:space-between;gap:12px}
  .receipt-head{align-items:flex-start;padding-bottom:14px;border-bottom:1px solid #e6ebf3}
  .receipt-head span{display:block;font-size:11px;color:#596174;font-weight:700}
  .receipt-head h3{font-size:24px;margin:4px 0}
  .receipt-head p{font-size:11px;color:#7c8494;margin:0}
  .receipt-stamp{display:grid;place-items:center;gap:6px;width:110px;height:110px;border-radius:50%;border:2px dashed #c4cce0;color:#415172;font-size:10px;text-align:center;background:#fff}
  .receipt-stamp img{width:46px;height:46px;object-fit:contain;border-radius:14px}
  .receipt-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}
  .receipt-grid > div,.receipt-summary > div{border:1px solid #e3e8f2;border-radius:12px;padding:12px;background:#fff}
  .receipt-grid span,.receipt-summary span,.receipt-foot span{display:block;font-size:9px;color:#7c8494;margin-bottom:6px}
  .receipt-grid strong,.receipt-summary strong{font-size:12px;color:#172033}
  .receipt-block{margin-top:16px}
  .receipt-block > strong{display:block;font-size:13px;color:#182033}
  .receipt-wide{grid-column:1 / -1}
  .receipt-summary{margin-top:16px}
  .receipt-summary > div{flex:1}
  .receipt-foot{margin-top:24px;padding-top:18px;border-top:1px solid #e6ebf3}
  .receipt-foot > div{flex:1}
  .receipt-foot i{display:block;height:42px;border-bottom:1px solid #aab3c5}
`;

function renderReceiptPrintMarkup(payment, invoice) {
  if (!payment || !invoice) return '';
  const snapshot = payment.studentSnapshot || {};
  const totals = payment.financialSummary || {};

  return `
    <div class="print-shell">
      <div class="receipt-sheet">
        <div class="receipt-head">
          <div>
            <span>EduGlobal CRM</span>
            <h3>سند قبض رسمي</h3>
            <p>${escapeHtml(payment.receiptNumber)}</p>
          </div>
          <div class="receipt-stamp">
            <img src="${studyBirdsLogo}" alt="Study Birds" />
            <span>معتمد من النظام</span>
          </div>
        </div>
        <div class="receipt-grid">
          <div>
            <span>تاريخ ووقت التحصيل</span>
            <strong>${escapeHtml(formatDateTime(payment.createdAt || payment.date))}</strong>
          </div>
          <div>
            <span>طريقة الدفع</span>
            <strong>${escapeHtml(tr(payment.method))}</strong>
          </div>
          <div>
            <span>العملة</span>
            <strong>${escapeHtml(payment.currency)}</strong>
          </div>
          <div>
            <span>سعر الصرف</span>
            <strong>${escapeHtml(payment.exchangeRate || 1)}</strong>
          </div>
        </div>
        <div class="receipt-block">
          <strong>بيانات الطالب</strong>
          <div class="receipt-grid">
            <div>
              <span>اسم الطالب</span>
              <strong>${escapeHtml(snapshot.name || invoice.student?.name || '—')}</strong>
            </div>
            <div>
              <span>الهاتف / الكود المرجعي</span>
              <strong>${escapeHtml(snapshot.phone || invoice.student?.phone || '—')} / ${escapeHtml(snapshot.referenceCode || invoice.student?.id || '—')}</strong>
            </div>
            <div>
              <span>الدولة والتخصص</span>
              <strong>${escapeHtml(snapshot.targetMajor || invoice.application?.program || '—')} - ${escapeHtml(snapshot.targetCountry || invoice.application?.country || '—')}</strong>
            </div>
            <div>
              <span>المستشار</span>
              <strong>${escapeHtml(snapshot.consultantName || invoice.consultant?.name || 'غير محدد')}</strong>
            </div>
          </div>
        </div>
        <div class="receipt-block">
          <strong>تفاصيل المبلغ</strong>
          <div class="receipt-grid">
            <div>
              <span>المبلغ المدفوع</span>
              <strong>${escapeHtml(formatMoney(payment.amount, payment.currency))}</strong>
            </div>
            <div class="receipt-wide">
              <span>التفقيط</span>
              <strong>${escapeHtml(payment.amountInWords || '—')}</strong>
            </div>
            <div class="receipt-wide">
              <span>البيان</span>
              <strong>${escapeHtml(payment.statement || invoice.paymentStatement || invoice.description)}</strong>
            </div>
          </div>
        </div>
        <div class="receipt-summary">
          <div>
            <span>إجمالي المستحق</span>
            <strong>${escapeHtml(formatMoney(totals.totalDue || invoice.total, invoice.currency))}</strong>
          </div>
          <div>
            <span>إجمالي المدفوع</span>
            <strong>${escapeHtml(formatMoney(totals.totalPaid || invoice.paid, invoice.currency))}</strong>
          </div>
          <div>
            <span>المتبقي</span>
            <strong>${escapeHtml(formatMoney(totals.remainingBalance || invoice.balance, invoice.currency))}</strong>
          </div>
        </div>
        <div class="receipt-foot">
          <div>
            <span>توقيع المحاسب</span>
            <i></i>
          </div>
          <div>
            <span>ختم الشركة</span>
            <i></i>
          </div>
        </div>
      </div>
    </div>
  `;
}

function ReceiptSheet({ payment, invoice }) {
  if (!payment || !invoice) return null;
  const snapshot = payment.studentSnapshot || {};
  const totals = payment.financialSummary || {};

  return (
    <div className="receipt-sheet">
      <div className="receipt-head">
        <div>
          <span>EduGlobal CRM</span>
          <h3>سند قبض رسمي</h3>
          <p>{payment.receiptNumber}</p>
        </div>
        <div className="receipt-stamp">
          <img src={studyBirdsLogo} alt="Study Birds" />
          <span>معتمد من النظام</span>
        </div>
      </div>

      <div className="receipt-grid">
        <div>
          <span>تاريخ ووقت التحصيل</span>
          <strong>{formatDateTime(payment.createdAt || payment.date)}</strong>
        </div>
        <div>
          <span>طريقة الدفع</span>
          <strong>{tr(payment.method)}</strong>
        </div>
        <div>
          <span>العملة</span>
          <strong>{payment.currency}</strong>
        </div>
        <div>
          <span>سعر الصرف</span>
          <strong>{payment.exchangeRate || 1}</strong>
        </div>
      </div>

      <div className="receipt-block">
        <strong>بيانات الطالب</strong>
        <div className="receipt-grid">
          <div>
            <span>اسم الطالب</span>
            <strong>{snapshot.name || invoice.student?.name || '—'}</strong>
          </div>
          <div>
            <span>الهاتف / الكود المرجعي</span>
            <strong>{snapshot.phone || invoice.student?.phone || '—'} / {snapshot.referenceCode || invoice.student?.id || '—'}</strong>
          </div>
          <div>
            <span>الدولة والتخصص</span>
            <strong>{snapshot.targetMajor || invoice.application?.program || '—'} - {snapshot.targetCountry || invoice.application?.country || '—'}</strong>
          </div>
          <div>
            <span>المستشار</span>
            <strong>{snapshot.consultantName || invoice.consultant?.name || 'غير محدد'}</strong>
          </div>
        </div>
      </div>

      <div className="receipt-block">
        <strong>تفاصيل المبلغ</strong>
        <div className="receipt-grid">
          <div>
            <span>المبلغ المدفوع</span>
            <strong>{formatMoney(payment.amount, payment.currency)}</strong>
          </div>
          <div className="receipt-wide">
            <span>التفقيط</span>
            <strong>{payment.amountInWords}</strong>
          </div>
          <div className="receipt-wide">
            <span>البيان</span>
            <strong>{payment.statement || invoice.paymentStatement || invoice.description}</strong>
          </div>
        </div>
      </div>

      <div className="receipt-summary">
        <div>
          <span>إجمالي المستحق</span>
          <strong>{formatMoney(totals.totalDue || invoice.total, invoice.currency)}</strong>
        </div>
        <div>
          <span>إجمالي المدفوع</span>
          <strong>{formatMoney(totals.totalPaid || invoice.paid, invoice.currency)}</strong>
        </div>
        <div>
          <span>المتبقي</span>
          <strong>{formatMoney(totals.remainingBalance || invoice.balance, invoice.currency)}</strong>
        </div>
      </div>

      <div className="receipt-foot">
        <div>
          <span>توقيع المحاسب</span>
          <i />
        </div>
        <div>
          <span>ختم الشركة</span>
          <i />
        </div>
      </div>
    </div>
  );
}

export default function Finance() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [invoices, setInvoices] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [form, setForm] = useState(invoiceBlank);
  const [selected, setSelected] = useState(null);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [payment, setPayment] = useState(paymentBlank);
  const [toast, setToast] = useState(null);

  const canCreateInvoice = can(user.role, 'createInvoice');
  const canRecordPayment = can(user.role, 'recordPayment');
  const canDeleteInvoice = can(user.role, 'deleteInvoice');

  const load = () =>
    Promise.all([api('/api/invoices'), api('/api/students')])
      .then(([invoiceData, studentData]) => {
        setInvoices(invoiceData);
        setStudents(studentData);
      })
      .catch(error => setToast({ type: 'error', message: error.message }))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const shown = useMemo(
    () =>
      invoices.filter(invoice =>
        [
          invoice.number,
          invoice.student?.name,
          invoice.student?.phone,
          invoice.description,
          invoice.paymentStatement,
          invoice.computedStatus
        ].some(value => String(value || '').toLowerCase().includes(query.toLowerCase()))
      ).filter(invoice => {
        const status = searchParams.get('status');
        if (status === 'overdue') {
          return invoice.balance > 0 && invoice.installments?.some(item => item.status !== 'Paid' && item.dueDate && item.dueDate < today);
        }
        return true;
      }),
    [invoices, query, searchParams]
  );

  useEffect(() => {
    const invoiceId = searchParams.get('invoiceId');
    if (!invoiceId || !invoices.length) return;
    const target = invoices.find(item => item.id === invoiceId);
    if (target) setSelected(target);
  }, [invoices, searchParams]);

  const totals = useMemo(() => ({
    total: invoices.reduce((sum, invoice) => sum + invoice.total, 0),
    paid: invoices.reduce((sum, invoice) => sum + invoice.paid, 0),
    outstanding: invoices.reduce((sum, invoice) => sum + invoice.balance, 0),
    serviceFees: invoices.reduce((sum, invoice) => sum + numberValue(invoice.serviceFee), 0)
  }), [invoices]);

  const invoicePreviewTotal = numberValue(form.serviceFee) + numberValue(form.universityFee) + numberValue(form.visaFee) + numberValue(form.tax);
  const installmentTotal = form.installments.reduce((sum, item) => sum + numberValue(item.amount), 0);

  const createInvoice = async event => {
    event.preventDefault();
    if (form.installments.length && installmentTotal !== invoicePreviewTotal) {
      setToast({ type: 'error', message: 'إجمالي الأقساط يجب أن يساوي إجمالي الفاتورة.' });
      return;
    }
    try {
      await api('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          installments: form.installments.map(item => ({ ...item, amount: numberValue(item.amount) })),
          total: invoicePreviewTotal
        })
      });
      setInvoiceOpen(false);
      setForm(invoiceBlank);
      await load();
      setToast({ message: 'تم إنشاء الفاتورة وخطة السداد بنجاح.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const savePayment = async event => {
    event.preventDefault();
    if (!selected) return;
    try {
      const body = new FormData();
      body.append('amount', payment.amount);
      body.append('currency', payment.currency);
      body.append('exchangeRate', payment.exchangeRate);
      body.append('method', payment.method);
      body.append('reference', payment.reference);
      body.append('date', payment.date);
      body.append('statement', payment.statement);
      body.append('installmentId', payment.installmentId);
      body.append('notes', payment.notes);
      if (payment.attachment) body.append('attachment', payment.attachment);

      const receipt = await api(`/api/invoices/${selected.id}/payments`, { method: 'POST', body });
      setPaymentOpen(false);
      setSelectedReceipt(receipt);
      setReceiptOpen(true);
      setPayment(paymentBlank);
      await load();
      setToast({ message: 'تم تسجيل الدفعة وإصدار سند القبض.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const openPaymentModal = invoice => {
    setSelected(invoice);
    setPayment({
      ...paymentBlank,
      amount: String(invoice.balance),
      currency: invoice.currency,
      exchangeRate: String(invoice.exchangeRate || 1),
      statement: invoice.paymentStatement || invoice.description
    });
    setPaymentOpen(true);
  };

  const openHistoryModal = invoice => {
    setSelected(invoice);
    setHistoryOpen(true);
  };

  const openReceipt = (invoice, receipt) => {
    setSelected(invoice);
    setSelectedReceipt(receipt);
    setReceiptOpen(true);
  };

  const deleteInvoice = async invoice => {
    const confirmed = window.confirm(`سيتم حذف الفاتورة ${invoice.number} وكل الدفعات والمرفقات المرتبطة بها. هل تريد المتابعة؟`);
    if (!confirmed) return;

    try {
      await api(`/api/invoices/${invoice.id}`, { method: 'DELETE' });
      if (selected?.id === invoice.id) {
        setSelected(null);
        setSelectedReceipt(null);
        setHistoryOpen(false);
        setReceiptOpen(false);
        setPaymentOpen(false);
      }
      await load();
      setToast({ message: 'تم حذف الفاتورة بنجاح.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const addInstallment = () => setForm(current => ({ ...current, installments: [...current.installments, createInstallment(current.installments.length)] }));
  const removeInstallment = id => setForm(current => ({ ...current, installments: current.installments.filter(item => item.id !== id) }));

  const printReceipt = () => {
    if (!selectedReceipt || !selected) return;
    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    document.body.appendChild(frame);

    const printDocument = frame.contentWindow?.document;
    if (!printDocument || !frame.contentWindow) {
      frame.remove();
      setToast({ type: 'error', message: 'تعذر فتح معاينة السند للطباعة.' });
      return;
    }

    printDocument.open();
    printDocument.write(`
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="utf-8" />
          <title>${selectedReceipt.receiptNumber}</title>
          <style>${receiptPrintStyles}</style>
        </head>
        <body>
          ${renderReceiptPrintMarkup(selectedReceipt, selected)}
        </body>
      </html>
    `);
    printDocument.close();

    const triggerPrint = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      window.setTimeout(() => frame.remove(), 1000);
    };

    frame.onload = triggerPrint;
    window.setTimeout(triggerPrint, 250);
  };

  const sendWhatsApp = () => {
    if (!selectedReceipt || !selected) return;
    const studentPhone = String(selectedReceipt.studentSnapshot?.phone || selected.student?.phone || '').replace(/[^\d]/g, '');
    const message = [
      'مرحباً،',
      `تم إصدار سند القبض رقم ${selectedReceipt.receiptNumber}.`,
      `المبلغ: ${formatMoney(selectedReceipt.amount, selectedReceipt.currency)}`,
      `البيان: ${selectedReceipt.statement || selected.paymentStatement || selected.description}`,
      `المتبقي: ${formatMoney(selectedReceipt.financialSummary?.remainingBalance || selected.balance, selected.currency)}`
    ].join('\n');
    window.open(`https://wa.me/${studentPhone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  if (loading) return <div className="loading-page"><Spinner />جارٍ تحميل السجلات المالية...</div>;

  return (
    <>
      <div className="kpi-grid finance-kpis">
        {[
          [WalletCards, 'إجمالي الفواتير', totals.total, 'قيمة جميع الفواتير المصدرة'],
          [CircleDollarSign, 'المحصّل', totals.paid, 'كل المدفوعات المؤكدة'],
          [Banknote, 'المتبقي', totals.outstanding, 'الأرصدة المفتوحة على الطلاب'],
          [CreditCard, 'إيراد الشركة', totals.serviceFees, 'أتعاب الشركة فقط دون رسوم الجهات الخارجية']
        ].map(([Icon, label, value, subtitle]) => (
          <Card className="kpi-card" key={label}>
            <div className="kpi-icon"><Icon /></div>
            <div className="kpi-meta">
              <span>{label}</span>
              <strong>{formatMoney(value)}</strong>
              <small>{subtitle}</small>
            </div>
          </Card>
        ))}
      </div>

      <Card className="invoice-card">
        <div className="panel-toolbar">
          <div className="search-box">
            <Search />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث عن فاتورة أو سند..." />
          </div>
          {canCreateInvoice && <Button onClick={() => setInvoiceOpen(true)} type="button"><FilePlus2 /> فاتورة جديدة</Button>}
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>الفاتورة</th>
                <th>الطالب</th>
                <th>تفصيل الرسوم</th>
                <th>الإجمالي</th>
                <th>المدفوع</th>
                <th>المتبقي</th>
                <th>الحالة</th>
                <th>الأقساط</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(invoice => (
                <tr key={invoice.id}>
                  <td>
                    <strong>{invoice.number}</strong>
                    <small>{formatDate(invoice.createdAt)}</small>
                  </td>
                  <td>
                    <strong>{invoice.student?.name}</strong>
                    <small>{invoice.student?.phone || invoice.student?.email}</small>
                  </td>
                  <td className="description-cell">
                    <strong>{invoice.description}</strong>
                    <small>أتعاب الشركة: {formatMoney(invoice.serviceFee, invoice.currency)}</small>
                    <small>رسوم الجامعة/الفيزا: {formatMoney(invoice.passThroughFees, invoice.currency)}</small>
                  </td>
                  <td>{formatMoney(invoice.total, invoice.currency)}</td>
                  <td>{formatMoney(invoice.paid, invoice.currency)}</td>
                  <td><strong>{formatMoney(invoice.balance, invoice.currency)}</strong></td>
                  <td><Badge tone={invoice.computedStatus === 'Paid' ? 'green' : invoice.computedStatus === 'Partial' ? 'amber' : 'red'}>{tr(invoice.computedStatus)}</Badge></td>
                  <td>
                    {invoice.installments?.length ? (
                      <div className="installment-chip-stack">
                        {invoice.installments.slice(0, 2).map(item => <Badge key={item.id} tone={item.status === 'Paid' ? 'green' : item.dueDate < today ? 'red' : 'amber'}>{item.label}</Badge>)}
                      </div>
                    ) : (
                      <span className="paid-mark">دفعة واحدة</span>
                    )}
                  </td>
                  <td>
                    <div className="table-actions">
                      <Button variant="ghost" type="button" onClick={() => openHistoryModal(invoice)}><Eye /> السجل</Button>
                      {invoice.balance > 0 && canRecordPayment ? (
                        <Button variant="ghost" type="button" onClick={() => openPaymentModal(invoice)}><Plus /> تسجيل دفعة</Button>
                      ) : (
                        <span className="paid-mark">{invoice.balance > 0 ? 'مغلق للمحاسب' : 'تمت التسوية'}</span>
                      )}
                      {canDeleteInvoice && (
                        <Button variant="ghost" type="button" onClick={() => deleteInvoice(invoice)}><Trash2 /> حذف</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={invoiceOpen} onClose={() => setInvoiceOpen(false)} title="إنشاء فاتورة طالب" size="lg">
        <form className="form-grid" onSubmit={createInvoice}>
          <Field label="الطالب" className="field-full">
            <select required value={form.studentId} onChange={event => setForm({ ...form, studentId: event.target.value })}>
              <option value="">اختر الطالب</option>
              {students.map(student => <option value={student.id} key={student.id}>{student.name}</option>)}
            </select>
          </Field>
          <Field label="وصف الفاتورة" className="field-full"><input required value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></Field>
          <Field label="البيان المختصر" className="field-full"><input required value={form.paymentStatement} onChange={event => setForm({ ...form, paymentStatement: event.target.value })} /></Field>
          <Field label="عملة الفاتورة">
            <select value={form.currency} onChange={event => setForm({ ...form, currency: event.target.value })}>
              {currencies.map(currency => <option value={currency} key={currency}>{currency}</option>)}
            </select>
          </Field>
          <Field label="سعر الصرف">
            <input min="0" step="0.01" type="number" value={form.exchangeRate} onChange={event => setForm({ ...form, exchangeRate: event.target.value })} />
          </Field>
          <Field label="أتعاب الشركة">
            <input required min="0" type="number" value={form.serviceFee} onChange={event => setForm({ ...form, serviceFee: event.target.value })} />
          </Field>
          <Field label="رسوم الجامعة">
            <input min="0" type="number" value={form.universityFee} onChange={event => setForm({ ...form, universityFee: event.target.value })} />
          </Field>
          <Field label="رسوم الفيزا / التحويل">
            <input min="0" type="number" value={form.visaFee} onChange={event => setForm({ ...form, visaFee: event.target.value })} />
          </Field>
          <Field label="ضريبة / رسوم إضافية">
            <input min="0" type="number" value={form.tax} onChange={event => setForm({ ...form, tax: event.target.value })} />
          </Field>
          <Field label="تاريخ الاستحقاق النهائي">
            <input type="date" value={form.dueDate} onChange={event => setForm({ ...form, dueDate: event.target.value })} />
          </Field>
          <Field label="ملاحظات">
            <textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} />
          </Field>

          <div className="field-full installment-builder">
            <div className="installment-builder-head">
              <div>
                <strong>جدولة الأقساط</strong>
                <span>اختياري. عند الاستخدام يجب أن يساوي مجموع الأقساط إجمالي الفاتورة.</span>
              </div>
              <Button type="button" variant="secondary" onClick={addInstallment}><Plus /> إضافة قسط</Button>
            </div>

            {form.installments.length ? (
              <div className="installment-grid">
                {form.installments.map((item, index) => (
                  <div className="installment-row" key={item.id}>
                    <input value={item.label} onChange={event => setForm(current => ({ ...current, installments: current.installments.map(row => row.id === item.id ? { ...row, label: event.target.value } : row) }))} placeholder={`القسط ${index + 1}`} />
                    <input type="date" value={item.dueDate} onChange={event => setForm(current => ({ ...current, installments: current.installments.map(row => row.id === item.id ? { ...row, dueDate: event.target.value } : row) }))} />
                    <input min="0" type="number" value={item.amount} onChange={event => setForm(current => ({ ...current, installments: current.installments.map(row => row.id === item.id ? { ...row, amount: event.target.value } : row) }))} placeholder="المبلغ" />
                    <Button type="button" variant="ghost" onClick={() => removeInstallment(item.id)}>حذف</Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="document-empty compact-empty">
                <ReceiptText />
                <strong>لا توجد أقساط مجدولة</strong>
                <span>اترك الفاتورة دفعة واحدة أو أضف خطة تقسيط.</span>
              </div>
            )}
          </div>

          <div className="invoice-preview field-full finance-preview">
            <ReceiptText />
            <div>
              <span>إجمالي الفاتورة</span>
              <strong>{formatMoney(invoicePreviewTotal, form.currency)}</strong>
              {form.installments.length > 0 && <small>إجمالي الأقساط: {formatMoney(installmentTotal, form.currency)}</small>}
            </div>
          </div>

          <div className="form-actions field-full">
            <Button type="button" variant="secondary" onClick={() => setInvoiceOpen(false)}>إلغاء</Button>
            <Button type="submit">إنشاء الفاتورة</Button>
          </div>
        </form>
      </Modal>

      <Modal open={paymentOpen} onClose={() => setPaymentOpen(false)} title={`تسجيل دفعة · ${selected?.number || ''}`} size="lg">
        <form className="form-grid" onSubmit={savePayment}>
          <Field label="المبلغ">
            <input required min="1" max={selected?.balance} type="number" value={payment.amount} onChange={event => setPayment({ ...payment, amount: event.target.value })} />
          </Field>
          <Field label="العملة">
            <select value={payment.currency} onChange={event => setPayment({ ...payment, currency: event.target.value })}>
              {currencies.map(currency => <option value={currency} key={currency}>{currency}</option>)}
            </select>
          </Field>
          <Field label="طريقة الدفع">
            <select value={payment.method} onChange={event => setPayment({ ...payment, method: event.target.value })}>
              {paymentMethods.map(method => <option value={method} key={method}>{tr(method)}</option>)}
            </select>
          </Field>
          <Field label="سعر الصرف">
            <input min="0" step="0.01" type="number" value={payment.exchangeRate} onChange={event => setPayment({ ...payment, exchangeRate: event.target.value })} />
          </Field>
          <Field label="مرجع العملية">
            <input value={payment.reference} onChange={event => setPayment({ ...payment, reference: event.target.value })} />
          </Field>
          <Field label="تاريخ التحصيل">
            <input type="date" value={payment.date} onChange={event => setPayment({ ...payment, date: event.target.value })} />
          </Field>
          <Field label="ربط بقسط محدد">
            <select value={payment.installmentId} onChange={event => setPayment({ ...payment, installmentId: event.target.value })}>
              <option value="">بدون ربط مباشر</option>
              {(selected?.installments || []).filter(item => item.status !== 'Paid').map(item => (
                <option value={item.id} key={item.id}>{item.label} - {formatMoney(item.balance || item.amount, selected.currency)}</option>
              ))}
            </select>
          </Field>
          <Field label="البيان">
            <input value={payment.statement} onChange={event => setPayment({ ...payment, statement: event.target.value })} />
          </Field>
          <Field label="إرفاق إيصال التحويل" className="field-full">
            <input type="file" accept="image/*,.pdf" onChange={event => setPayment({ ...payment, attachment: event.target.files?.[0] || null })} />
          </Field>
          <Field label="ملاحظات" className="field-full">
            <textarea value={payment.notes} onChange={event => setPayment({ ...payment, notes: event.target.value })} />
          </Field>
          <div className="form-actions field-full">
            <Button type="button" variant="secondary" onClick={() => setPaymentOpen(false)}>إلغاء</Button>
            <Button type="submit"><Plus /> إصدار سند القبض</Button>
          </div>
        </form>
      </Modal>

      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title={`سجل السندات · ${selected?.number || ''}`} subtitle={selected ? `المحصّل ${formatMoney(selected.paid, selected.currency)} من أصل ${formatMoney(selected.total, selected.currency)}` : ''} size="lg">
        <div className="payment-history">
          {selected?.installments?.length ? (
            <div className="installment-summary-grid">
              {selected.installments.map(item => (
                <div className="installment-summary-card" key={item.id}>
                  <strong>{item.label}</strong>
                  <span>{formatDate(item.dueDate)}</span>
                  <small>{formatMoney(item.paidAmount || 0, selected.currency)} / {formatMoney(item.amount, selected.currency)}</small>
                  <Badge tone={item.status === 'Paid' ? 'green' : item.dueDate < today ? 'red' : 'amber'}>{tr(item.status)}</Badge>
                </div>
              ))}
            </div>
          ) : null}

          {selected?.payments?.length ? (
            selected.payments.map(item => (
              <div className="history-row history-row-receipt" key={item.id}>
                <div>
                  <strong>{item.receiptNumber}</strong>
                  <span>{formatMoney(item.amount, item.currency || selected.currency)} · {tr(item.method)} · {formatDateTime(item.createdAt || item.date)}</span>
                  <small>{item.statement || selected.paymentStatement || selected.description}</small>
                  {item.attachment?.url && <a href={item.attachment.url} target="_blank" rel="noreferrer">فتح المرفق</a>}
                </div>
                <div className="table-actions">
                  <Badge tone="green">مغلق</Badge>
                  <Button type="button" variant="ghost" onClick={() => openReceipt(selected, item)}><FileText /> عرض السند</Button>
                </div>
              </div>
            ))
          ) : (
            <div className="document-empty compact-empty">
              <ReceiptText />
              <strong>لا توجد دفعات مسجلة</strong>
              <span>ابدأ بإضافة أول دفعة لإصدار أول سند قبض.</span>
            </div>
          )}
        </div>
      </Modal>

      <Modal open={receiptOpen} onClose={() => setReceiptOpen(false)} title={`سند قبض · ${selectedReceipt?.receiptNumber || ''}`} subtitle="جاهز للطباعة والمشاركة" size="lg">
        <ReceiptSheet payment={selectedReceipt} invoice={selected} />
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={printReceipt}><ReceiptText /> طباعة سند</Button>
          <Button type="button" onClick={sendWhatsApp}><Send /> إرسال عبر الواتساب</Button>
        </div>
      </Modal>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
