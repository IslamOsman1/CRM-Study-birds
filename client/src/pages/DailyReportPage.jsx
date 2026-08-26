import React, { useEffect, useState } from 'react';
import { Lock, Send } from 'lucide-react';
import { api } from '../api.js';
import { Badge, Button, Card, Field, Spinner, Toast } from '../components/UI.jsx';

const TODAY = '2026-08-26';
const blankForm = {
  startTime: '09:00',
  endTime: '18:00',
  tookBreak: false,
  notes: ''
};

export default function DailyReportPage() {
  const [form, setForm] = useState(blankForm);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submittedToday, setSubmittedToday] = useState(false);
  const [metrics, setMetrics] = useState({ newLeads: 0, contacted: 0, submitted: 0, followUps: 0 });

  const load = async () => {
    try {
      const result = await api(`/api/daily-reports/status?date=${TODAY}`);
      setSubmittedToday(result.submitted);
      setMetrics(result.metrics || { newLeads: 0, contacted: 0, submitted: 0, followUps: 0 });
      if (result.report) {
        setForm({
          startTime: result.report.startTime || '09:00',
          endTime: result.report.endTime || '18:00',
          tookBreak: Boolean(result.report.tookBreak),
          notes: result.report.notes || ''
        });
      }
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submitReport = async event => {
    event?.preventDefault?.();
    if (submittedToday || submitting) return;
    setSubmitting(true);
    try {
      await api('/api/daily-reports', {
        method: 'POST',
        body: JSON.stringify({ ...form, date: TODAY, metrics })
      });
      setSubmittedToday(true);
      setToast({ message: 'تم إرسال التقرير اليومي.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="loading-page"><Spinner />جارٍ تحميل التقرير اليومي...</div>;

  return (
    <>
      {!submittedToday && (
        <Card className="daily-report-lock">
          <div className="daily-report-lock-head">
            <Lock />
            <div>
              <strong>التقرير اليومي إلزامي</strong>
              <span>لم يتم إرسال تقرير يوم الأربعاء 26 أغسطس 2026 بعد.</span>
            </div>
          </div>
        </Card>
      )}

      <div className="kpi-grid reports-kpis">
        <Card className="kpi-card"><div className="kpi-meta"><span>Leads جديدة اليوم</span><strong>{metrics.newLeads}</strong></div></Card>
        <Card className="kpi-card"><div className="kpi-meta"><span>تم التواصل معها</span><strong>{metrics.contacted}</strong></div></Card>
        <Card className="kpi-card"><div className="kpi-meta"><span>ملفات مرسلة</span><strong>{metrics.submitted}</strong></div></Card>
        <Card className="kpi-card"><div className="kpi-meta"><span>متابعات منجزة</span><strong>{metrics.followUps}</strong></div></Card>
      </div>

      <Card className="settings-card">
        <form className="form-grid" autoComplete="off" noValidate onSubmit={event => event.preventDefault()}>
          <Field label="بداية الدوام">
            <input type="time" value={form.startTime} onChange={event => setForm({ ...form, startTime: event.target.value })} />
          </Field>
          <Field label="نهاية الدوام">
            <input type="time" value={form.endTime} onChange={event => setForm({ ...form, endTime: event.target.value })} />
          </Field>
          <Field label="هل أخذت إذنًا أو استراحة؟">
            <label className="check-row">
              <input type="checkbox" checked={form.tookBreak} onChange={event => setForm({ ...form, tookBreak: event.target.checked })} />
              <span>نعم، تم أخذ إذن أو استراحة خلال اليوم.</span>
            </label>
          </Field>
          <Field label="التقييم اليومي / الملاحظات" className="field-full">
            <textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} required />
          </Field>
          <div className="form-actions field-full">
            {submittedToday && <Badge tone="green">تم الإرسال اليوم</Badge>}
            <Button type="button" disabled={submittedToday || submitting} onClick={submitReport}>
              <Send size={15} /> {submitting ? 'جارٍ الإرسال...' : 'إرسال التقرير اليومي'}
            </Button>
          </div>
        </form>
      </Card>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
