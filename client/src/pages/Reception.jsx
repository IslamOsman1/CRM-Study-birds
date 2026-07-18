import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Headphones, PhoneIncoming, PlusCircle, UserRoundCheck } from 'lucide-react';
import { api, formatDate, initials } from '../api.js';
import { Badge, Button, Card, Field, Spinner, Toast } from '../components/UI.jsx';
import { tr } from '../i18n.js';

const blank = {
  type: 'Walk-in',
  name: '',
  phone: '',
  email: '',
  interest: '',
  country: '',
  source: 'Front Desk',
  consultantId: '',
  notes: '',
  priority: 'Medium',
  nextFollowUp: '',
  createLead: true
};

export default function Reception() {
  const [logs, setLogs] = useState([]);
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(blank);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const load = () =>
    Promise.all([api('/api/reception'), api('/api/settings')])
      .then(([logData, settingData]) => {
        setLogs(logData);
        setSettings(settingData);
      })
      .catch(error => setToast({ type: 'error', message: error.message }))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const consultants = useMemo(() => settings?.employees.filter(employee => employee.department === 'Consultancy') || [], [settings]);

  const submit = async event => {
    event.preventDefault();
    try {
      await api('/api/reception', { method: 'POST', body: JSON.stringify(form) });
      setForm(blank);
      await load();
      setToast({ message: 'تم تسجيل الاستفسار وتوجيهه بنجاح' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  if (loading) return <div className="loading-page"><Spinner />جارٍ تحميل بيانات الاستقبال...</div>;

  return (
    <>
      <div className="reception-grid">
        <Card className="quick-log-card">
          <div className="quick-log-head">
            <div className="hero-icon"><Headphones /></div>
            <div>
              <p className="eyebrow">تسجيل سريع للاستقبال</p>
              <h2>تسجيل تفاعل جديد</h2>
              <span>أنشئ عميلًا محتملًا وأسنده إلى مستشار متاح في خطوة واحدة.</span>
            </div>
          </div>

          <form className="form-grid" onSubmit={submit}>
            <Field label="نوع التفاعل">
              <select value={form.type} onChange={event => setForm({ ...form, type: event.target.value })}>
                <option value="Walk-in">زيارة مباشرة</option>
                <option value="Incoming Call">مكالمة واردة</option>
                <option value="WhatsApp">واتساب</option>
                <option value="Email">البريد الإلكتروني</option>
                <option value="Social Media">وسائل التواصل</option>
              </select>
            </Field>
            <Field label="اسم الطالب"><input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></Field>
            <Field label="رقم الهاتف"><input required value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} /></Field>
            <Field label="البريد الإلكتروني"><input type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></Field>
            <Field label="اهتمام الدراسة"><input value={form.interest} onChange={event => setForm({ ...form, interest: event.target.value })} placeholder="مثال: ماجستير علوم البيانات" /></Field>
            <Field label="بلد الوجهة"><input value={form.country} onChange={event => setForm({ ...form, country: event.target.value })} /></Field>
            <Field label="مصدر العميل المحتمل">
              <select value={form.source} onChange={event => setForm({ ...form, source: event.target.value })}>
                <option value="Front Desk">مكتب الاستقبال</option>
                <option value="Phone">هاتف</option>
                <option value="WhatsApp">واتساب</option>
                <option value="Website">الموقع الإلكتروني</option>
                <option value="Instagram">إنستغرام</option>
                <option value="Facebook">فيسبوك</option>
                <option value="Referral">إحالة</option>
              </select>
            </Field>
            <Field label="إسناد إلى مستشار">
              <select required value={form.consultantId} onChange={event => setForm({ ...form, consultantId: event.target.value })}>
                <option value="">اختر مستشارًا</option>
                {consultants.map(consultant => <option key={consultant.id} value={consultant.id}>{consultant.name}</option>)}
              </select>
            </Field>
            <Field label="تاريخ المتابعة"><input type="date" value={form.nextFollowUp} onChange={event => setForm({ ...form, nextFollowUp: event.target.value })} /></Field>
            <Field label="الأولوية">
              <select value={form.priority} onChange={event => setForm({ ...form, priority: event.target.value })}>
                <option value="Low">منخفضة</option>
                <option value="Medium">متوسطة</option>
                <option value="High">مرتفعة</option>
              </select>
            </Field>
            <Field label="ملاحظات" className="field-full"><textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></Field>
            <label className="check-row field-full">
              <input type="checkbox" checked={form.createLead} onChange={event => setForm({ ...form, createLead: event.target.checked })} />
              <span>
                <strong>إنشاء عميل محتمل داخل النظام تلقائيًا</strong>
                <small>سيظهر للمستشار المسؤول مباشرة في مرحلة الاستفسار الأولي.</small>
              </span>
            </label>
            <div className="field-full">
              <Button className="wide" type="submit"><PlusCircle /> حفظ وإسناد</Button>
            </div>
          </form>
        </Card>

        <div className="reception-side">
          <Card>
            <div className="section-head">
              <div>
                <p className="eyebrow">التوفر</p>
                <h2>المستشارون المناوبون</h2>
              </div>
              <UserRoundCheck />
            </div>
            <div className="availability-list">
              {consultants.map((consultant, index) => (
                <div key={consultant.id}>
                  <div className="avatar soft">{initials(consultant.name)}</div>
                  <div>
                    <strong>{consultant.name}</strong>
                    <span>{consultant.title}</span>
                  </div>
                  <Badge tone={index === 1 ? 'amber' : 'green'}>{index === 1 ? 'في اجتماع' : 'متاح'}</Badge>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="section-head">
              <div>
                <p className="eyebrow">اليوم</p>
                <h2>ملخص الاستقبال</h2>
              </div>
              <Clock3 />
            </div>
            <div className="mini-stat-grid">
              <div><PhoneIncoming /><strong>{logs.filter(log => log.type === 'Incoming Call').length}</strong><span>مكالمات</span></div>
              <div><UserRoundCheck /><strong>{logs.filter(log => log.type === 'Walk-in').length}</strong><span>زيارات مباشرة</span></div>
              <div><CheckCircle2 /><strong>{logs.filter(log => log.status === 'Assigned').length}</strong><span>تم إسنادها</span></div>
            </div>
          </Card>
        </div>
      </div>

      <Card className="recent-log-card">
        <div className="section-head">
          <div>
            <p className="eyebrow">الحركة الأخيرة</p>
            <h2>أحدث تفاعلات الاستقبال</h2>
          </div>
          <Badge tone="purple">{logs.length} سجل</Badge>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>الطالب</th>
                <th>نوع التفاعل</th>
                <th>الاهتمام</th>
                <th>المستشار المسؤول</th>
                <th>الحالة</th>
                <th>تاريخ التسجيل</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => {
                const consultant = consultants.find(item => item.id === log.consultantId);
                return (
                  <tr key={log.id}>
                    <td><strong>{log.name}</strong><small>{log.phone}</small></td>
                    <td>{tr(log.type)}</td>
                    <td>{log.interest || '—'}</td>
                    <td>{consultant?.name || 'غير مسند'}</td>
                    <td><Badge tone={log.status === 'Existing Lead' ? 'amber' : 'green'}>{tr(log.status)}</Badge></td>
                    <td>{formatDate(log.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
