import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { api } from '../api.js';
import { Button, Card, Field, Modal, Spinner, Toast } from '../components/UI.jsx';
import { useAuth } from '../auth.jsx';

const YEAR = 2026;
const MONTH_INDEX = 7;
const blankForm = { leaveType: 'Annual Leave', reason: '' };

function buildMonthDays() {
  const total = new Date(YEAR, MONTH_INDEX + 1, 0).getDate();
  return Array.from({ length: total }, (_, index) => {
    const date = new Date(YEAR, MONTH_INDEX, index + 1);
    return {
      key: date.toISOString().slice(0, 10),
      label: index + 1,
      weekday: new Intl.DateTimeFormat('ar-EG', { weekday: 'short' }).format(date)
    };
  });
}

export default function LeaveManagementPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [form, setForm] = useState(blankForm);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const monthDays = useMemo(() => buildMonthDays(), []);

  useEffect(() => {
    api('/api/hr')
      .then(result => setRequests(result.leaveRequests || []))
      .catch(error => setToast({ type: 'error', message: error.message }))
      .finally(() => setLoading(false));
  }, []);

  const submitRequest = async event => {
    event.preventDefault();
    try {
      const created = await api('/api/hr/leave-requests', {
        method: 'POST',
        body: JSON.stringify({
          leaveType: form.leaveType,
          reason: form.reason,
          startDate: selectedDate,
          endDate: selectedDate
        })
      });
      setRequests(current => [created, ...current]);
      setSelectedDate('');
      setForm(blankForm);
      setToast({ message: 'تم تقديم طلب الإجازة.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const requestForDate = date =>
    requests.find(item => item.startDate <= date && item.endDate >= date && (item.employeeName === user.name || ['admin', 'management', 'hr'].includes(user.role)));

  if (loading) return <div className="loading-page"><Spinner />جارٍ تحميل الإجازات...</div>;

  return (
    <>
      <Card className="leave-calendar-card">
        <div className="section-head">
          <div>
            <p className="eyebrow">August 2026</p>
            <h2>تقويم الإجازات</h2>
            <span>اختر يومًا من الشهر لتقديم طلب إجازة ومتابعة حالته.</span>
          </div>
          <CalendarDays />
        </div>

        <div className="leave-grid">
          {monthDays.map(day => {
            const request = requestForDate(day.key);
            const className = request
              ? request.status === 'Approved'
                ? 'status-approved'
                : request.status === 'Rejected'
                  ? 'status-rejected'
                  : 'status-pending'
              : '';
            return (
              <button key={day.key} className={`leave-day ${className}`} onClick={() => setSelectedDate(day.key)} type="button">
                <span>{day.weekday}</span>
                <strong>{day.label}</strong>
                {request && <small>{request.status === 'Approved' ? 'معتمد' : request.status === 'Rejected' ? 'مرفوض' : 'معلق'}</small>}
              </button>
            );
          })}
        </div>
      </Card>

      <Modal open={!!selectedDate} onClose={() => setSelectedDate('')} title="طلب إجازة" subtitle={selectedDate || ''}>
        <form className="stack-form" onSubmit={submitRequest}>
          <Field label="نوع الإجازة">
            <select value={form.leaveType} onChange={event => setForm({ ...form, leaveType: event.target.value })}>
              <option value="Annual Leave">إجازة سنوية</option>
              <option value="Sick Leave">إجازة مرضية</option>
              <option value="Emergency Leave">إجازة طارئة</option>
            </select>
          </Field>
          <Field label="السبب">
            <textarea value={form.reason} onChange={event => setForm({ ...form, reason: event.target.value })} required />
          </Field>
          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={() => setSelectedDate('')}>إلغاء</Button>
            <Button type="submit">إرسال الطلب</Button>
          </div>
        </form>
      </Modal>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
