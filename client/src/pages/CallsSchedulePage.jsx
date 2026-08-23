import React, { useEffect, useMemo, useState } from 'react';
import { CalendarPlus2, PhoneCall } from 'lucide-react';
import { api } from '../api.js';
import { Badge, Button, Card, Field, Modal, Spinner, Toast } from '../components/UI.jsx';

const BASE_DATE = new Date('2026-08-22T09:00:00');
const blankForm = {
  leadId: '',
  leadName: '',
  phone: '',
  datetime: '2026-08-22T12:00',
  note: ''
};

function getWeekDays() {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(BASE_DATE);
    date.setDate(BASE_DATE.getDate() + index);
    return date;
  });
}

export default function CallsSchedulePage() {
  const [calls, setCalls] = useState([]);
  const [leads, setLeads] = useState([]);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(blankForm);
  const weekDays = useMemo(() => getWeekDays(), []);

  useEffect(() => {
    Promise.allSettled([api('/api/calls'), api('/api/leads')]).then(([callsResult, leadsResult]) => {
      if (callsResult.status === 'fulfilled') setCalls(callsResult.value);
      if (leadsResult.status === 'fulfilled') setLeads(leadsResult.value);
      if (callsResult.status === 'rejected') setToast({ type: 'error', message: callsResult.reason.message });
      setLoading(false);
    });
  }, []);

  const groupedCalls = useMemo(
    () =>
      weekDays.map(day => ({
        key: day.toISOString().slice(0, 10),
        label: new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'short' }).format(day),
        items: calls
          .filter(call => String(call.datetime || '').slice(0, 10) === day.toISOString().slice(0, 10))
          .sort((a, b) => String(a.datetime).localeCompare(String(b.datetime)))
      })),
    [calls, weekDays]
  );

  const createCall = async event => {
    event.preventDefault();
    try {
      const created = await api('/api/calls', {
        method: 'POST',
        body: JSON.stringify(form)
      });
      setCalls(current => [...current, created]);
      setForm(blankForm);
      setOpen(false);
      setToast({ message: 'تمت إضافة موعد المكالمة.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  if (loading) return <div className="loading-page"><Spinner />جارٍ تحميل جدول المكالمات...</div>;

  return (
    <>
      <Card className="calls-board-card">
        <div className="section-head">
          <div>
            <p className="eyebrow">Weekly View</p>
            <h2>تقويم المكالمات</h2>
            <span>جدول أسبوعي يوزع المكالمات حسب اليوم والساعة.</span>
          </div>
          <Button onClick={() => setOpen(true)} type="button">
            <CalendarPlus2 size={16} />
            إضافة موعد
          </Button>
        </div>

        <div className="week-grid">
          {groupedCalls.map(day => (
            <section className="week-day-card" key={day.key}>
              <div className="week-day-head">
                <strong>{day.label}</strong>
                <Badge tone="neutral">{day.items.length}</Badge>
              </div>

              <div className="week-day-slots">
                {day.items.map(item => (
                  <article className="call-slot-card" key={item.id}>
                    <div className="call-slot-time">{new Intl.DateTimeFormat('ar-EG', { hour: '2-digit', minute: '2-digit' }).format(new Date(item.datetime))}</div>
                    <strong>{item.leadName}</strong>
                    <span>{item.phone}</span>
                    <p>{item.note || 'متابعة عامة'}</p>
                  </article>
                ))}
                {!day.items.length && <div className="kanban-empty">لا توجد مكالمات مجدولة</div>}
              </div>
            </section>
          ))}
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="إضافة مكالمة جديدة" subtitle="اربط الموعد بعميل محتمل أو اكتب البيانات يدويًا.">
        <form className="stack-form" onSubmit={createCall}>
          <Field label="العميل المحتمل">
            <select
              value={form.leadId}
              onChange={event => {
                const lead = leads.find(item => String(item.id) === event.target.value);
                setForm(current => ({
                  ...current,
                  leadId: event.target.value,
                  leadName: lead?.name || '',
                  phone: lead?.phone || ''
                }));
              }}
            >
              <option value="">اختيار لاحقًا</option>
              {leads.map(lead => <option key={lead.id} value={lead.id}>{lead.name}</option>)}
            </select>
          </Field>
          <Field label="اسم الطالب">
            <input value={form.leadName} onChange={event => setForm({ ...form, leadName: event.target.value })} required />
          </Field>
          <Field label="رقم الهاتف">
            <input value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} required />
          </Field>
          <Field label="الموعد">
            <input type="datetime-local" value={form.datetime} onChange={event => setForm({ ...form, datetime: event.target.value })} required />
          </Field>
          <Field label="ملاحظات">
            <textarea value={form.note} onChange={event => setForm({ ...form, note: event.target.value })} />
          </Field>
          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button type="submit"><PhoneCall size={15} /> حفظ الموعد</Button>
          </div>
        </form>
      </Modal>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
