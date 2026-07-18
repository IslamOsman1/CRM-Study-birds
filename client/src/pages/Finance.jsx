import React, { useEffect, useMemo, useState } from 'react';
import { Banknote, CircleDollarSign, CreditCard, Eye, FilePlus2, Plus, ReceiptText, Search, WalletCards } from 'lucide-react';
import { api, formatDate, formatMoney } from '../api.js';
import { Badge, Button, Card, Field, Modal, Spinner, Toast } from '../components/UI.jsx';
import { useAuth } from '../auth.jsx';
import { tr } from '../i18n.js';
import { can } from '../permissions.js';

const invoiceBlank = {
  studentId: '',
  description: 'خدمات استشارات تعليمية',
  currency: 'USD',
  subtotal: '',
  tax: '0',
  commission: '0',
  dueDate: '',
  notes: ''
};

export default function Finance() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [form, setForm] = useState(invoiceBlank);
  const [selected, setSelected] = useState(null);
  const [payment, setPayment] = useState({ amount: '', method: 'Bank Transfer', reference: '', date: '2026-07-17', notes: '' });
  const [toast, setToast] = useState(null);

  const canCreateInvoice = can(user.role, 'createInvoice');
  const canRecordPayment = can(user.role, 'recordPayment');

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
    () => invoices.filter(invoice => [invoice.number, invoice.student?.name, invoice.description, invoice.computedStatus].some(value => String(value || '').toLowerCase().includes(query.toLowerCase()))),
    [invoices, query]
  );

  const total = invoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const paid = invoices.reduce((sum, invoice) => sum + invoice.paid, 0);
  const outstanding = invoices.reduce((sum, invoice) => sum + invoice.balance, 0);
  const commission = invoices.reduce((sum, invoice) => sum + invoice.commission, 0);

  const create = async event => {
    event.preventDefault();
    try {
      await api('/api/invoices', { method: 'POST', body: JSON.stringify({ ...form, total: Number(form.subtotal) + Number(form.tax || 0) }) });
      setInvoiceOpen(false);
      setForm(invoiceBlank);
      await load();
      setToast({ message: 'تم إنشاء الفاتورة بنجاح' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const pay = async event => {
    event.preventDefault();
    if (!selected) return;
    try {
      await api(`/api/invoices/${selected.id}/payments`, { method: 'POST', body: JSON.stringify(payment) });
      setPaymentOpen(false);
      setPayment({ amount: '', method: 'Bank Transfer', reference: '', date: '2026-07-17', notes: '' });
      await load();
      setToast({ message: 'تم تسجيل الدفعة بنجاح' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const openPaymentModal = invoice => {
    setSelected(invoice);
    setPayment({
      amount: String(invoice.balance),
      method: 'Bank Transfer',
      reference: '',
      date: '2026-07-17',
      notes: ''
    });
    setPaymentOpen(true);
  };

  const openHistoryModal = invoice => {
    setSelected(invoice);
    setHistoryOpen(true);
  };

  if (loading) return <div className="loading-page"><Spinner />جارٍ تحميل السجلات المالية...</div>;

  return (
    <>
      <div className="kpi-grid finance-kpis">
        {[
          [WalletCards, 'إجمالي الفواتير', total, 'كل الفواتير الصادرة'],
          [CircleDollarSign, 'المحصّل', paid, 'مدفوعات الطلاب المؤكدة'],
          [Banknote, 'المستحق', outstanding, 'الأرصدة المفتوحة على الطلاب'],
          [CreditCard, 'عمولة الشركة', commission, 'إجمالي العمولة المتوقعة']
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
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث عن فاتورة..." />
          </div>
          {canCreateInvoice && <Button onClick={() => setInvoiceOpen(true)} type="button"><FilePlus2 /> فاتورة جديدة</Button>}
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>الفاتورة</th>
                <th>الطالب</th>
                <th>الوصف</th>
                <th>الإجمالي</th>
                <th>المدفوع</th>
                <th>المتبقي</th>
                <th>الحالة</th>
                <th>تاريخ الاستحقاق</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(invoice => (
                <tr key={invoice.id}>
                  <td><strong>{invoice.number}</strong><small>{formatDate(invoice.createdAt)}</small></td>
                  <td><strong>{invoice.student?.name}</strong><small>{invoice.student?.email}</small></td>
                  <td className="description-cell">{invoice.description}</td>
                  <td>{formatMoney(invoice.total, invoice.currency)}</td>
                  <td>{formatMoney(invoice.paid, invoice.currency)}</td>
                  <td><strong>{formatMoney(invoice.balance, invoice.currency)}</strong></td>
                  <td><Badge tone={invoice.computedStatus === 'Paid' ? 'green' : invoice.computedStatus === 'Partial' ? 'amber' : 'red'}>{tr(invoice.computedStatus)}</Badge></td>
                  <td>{formatDate(invoice.dueDate)}</td>
                  <td>
                    <div className="table-actions">
                      <Button variant="ghost" type="button" onClick={() => openHistoryModal(invoice)}><Eye /> السجل</Button>
                      {invoice.balance > 0 && canRecordPayment ? (
                        <Button variant="ghost" type="button" onClick={() => openPaymentModal(invoice)}>تسجيل دفعة</Button>
                      ) : invoice.balance > 0 ? (
                        <span className="paid-mark">قراءة فقط</span>
                      ) : (
                        <span className="paid-mark">تمت التسوية</span>
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
        <form className="form-grid" onSubmit={create}>
          <Field label="الطالب" className="field-full">
            <select required value={form.studentId} onChange={event => setForm({ ...form, studentId: event.target.value })}>
              <option value="">اختر الطالب</option>
              {students.map(student => <option value={student.id} key={student.id}>{student.name}</option>)}
            </select>
          </Field>
          <Field label="الوصف" className="field-full"><input required value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></Field>
          <Field label="المبلغ الأساسي"><input required min="0" type="number" value={form.subtotal} onChange={event => setForm({ ...form, subtotal: event.target.value })} /></Field>
          <Field label="الضريبة"><input min="0" type="number" value={form.tax} onChange={event => setForm({ ...form, tax: event.target.value })} /></Field>
          <Field label="العمولة"><input min="0" type="number" value={form.commission} onChange={event => setForm({ ...form, commission: event.target.value })} /></Field>
          <Field label="العملة">
            <select value={form.currency} onChange={event => setForm({ ...form, currency: event.target.value })}>
              <option>USD</option>
              <option>EUR</option>
              <option>GBP</option>
              <option>EGP</option>
              <option>TRY</option>
            </select>
          </Field>
          <Field label="تاريخ الاستحقاق"><input type="date" value={form.dueDate} onChange={event => setForm({ ...form, dueDate: event.target.value })} /></Field>
          <Field label="ملاحظات"><input value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></Field>
          <div className="invoice-preview field-full">
            <ReceiptText />
            <div>
              <span>إجمالي الفاتورة</span>
              <strong>{formatMoney(Number(form.subtotal || 0) + Number(form.tax || 0), form.currency)}</strong>
            </div>
          </div>
          <div className="form-actions field-full">
            <Button type="button" variant="secondary" onClick={() => setInvoiceOpen(false)}>إلغاء</Button>
            <Button type="submit">إنشاء الفاتورة</Button>
          </div>
        </form>
      </Modal>

      <Modal open={paymentOpen} onClose={() => setPaymentOpen(false)} title={`تسجيل دفعة · ${selected?.number || ''}`}>
        <form className="stack-form" onSubmit={pay}>
          <Field label="المبلغ"><input required min="1" max={selected?.balance} type="number" value={payment.amount} onChange={event => setPayment({ ...payment, amount: event.target.value })} /></Field>
          <Field label="طريقة الدفع">
            <select value={payment.method} onChange={event => setPayment({ ...payment, method: event.target.value })}>
              <option value="Bank Transfer">تحويل بنكي</option>
              <option value="Card">بطاقة</option>
              <option value="Cash">نقدًا</option>
              <option value="Online Gateway">بوابة دفع إلكترونية</option>
            </select>
          </Field>
          <Field label="المرجع"><input value={payment.reference} onChange={event => setPayment({ ...payment, reference: event.target.value })} /></Field>
          <Field label="التاريخ"><input type="date" value={payment.date} onChange={event => setPayment({ ...payment, date: event.target.value })} /></Field>
          <Field label="ملاحظات"><textarea value={payment.notes} onChange={event => setPayment({ ...payment, notes: event.target.value })} /></Field>
          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={() => setPaymentOpen(false)}>إلغاء</Button>
            <Button type="submit"><Plus /> حفظ الدفعة</Button>
          </div>
        </form>
      </Modal>

      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title={`سجل الدفعات · ${selected?.number || ''}`} subtitle={selected ? `إجمالي المدفوع ${formatMoney(selected.paid, selected.currency)}` : ''}>
        <div className="payment-history">
          {selected?.payments?.length ? (
            selected.payments.map(item => (
              <div className="history-row" key={item.id}>
                <div>
                  <strong>{formatMoney(item.amount, selected.currency)}</strong>
                  <span>{tr(item.method)} · {formatDate(item.date)}</span>
                  {item.reference && <small>المرجع: {item.reference}</small>}
                </div>
                <Badge tone="green">مسجل</Badge>
              </div>
            ))
          ) : (
            <div className="document-empty compact-empty">
              <ReceiptText />
              <strong>لا توجد دفعات مسجلة</strong>
              <span>ابدأ بإضافة أول دفعة على هذه الفاتورة.</span>
            </div>
          )}
        </div>
      </Modal>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
