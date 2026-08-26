import React, { useEffect, useMemo, useState } from 'react';
import {
  BellRing,
  CheckCircle2,
  Clock3,
  Headphones,
  PhoneIncoming,
  PlusCircle,
  Search,
  UserRoundCheck
} from 'lucide-react';
import { api, formatDate, initials } from '../api.js';
import { Badge, Button, Card, Field, Spinner, Toast } from '../components/UI.jsx';
import { formatArabicTime, tr } from '../i18n.js';

const leadSourceOptions = [
  'Facebook Campaign',
  'Instagram Campaign',
  'Google Campaign',
  'Friend Referral',
  'Walk-in Without Appointment'
];

const blank = {
  type: 'Walk-in',
  name: '',
  phone: '',
  email: '',
  interest: '',
  country: '',
  source: 'Walk-in Without Appointment',
  consultantId: '',
  notes: '',
  priority: 'Medium',
  nextFollowUp: '',
  createLead: true,
  autoAssign: true,
  branch: 'Cairo HQ'
};

function formatWaitTime(createdAt, nowMs) {
  const seconds = Math.max(0, Math.floor((nowMs - new Date(createdAt).getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}س ${minutes % 60}د`;
  return `${minutes}د ${seconds % 60}ث`;
}

export default function Reception() {
  const [logs, setLogs] = useState([]);
  const [consultants, setConsultants] = useState([]);
  const [queue, setQueue] = useState([]);
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(blank);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [duplicateInfo, setDuplicateInfo] = useState(null);
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

  const load = () =>
    Promise.all([api('/api/reception'), api('/api/settings')])
      .then(([receptionData, settingData]) => {
        setLogs(receptionData.logs || []);
        setConsultants(receptionData.consultants || []);
        setQueue(receptionData.queue || []);
        setSettings(settingData);
      })
      .catch(error => setToast({ type: 'error', message: error.message }))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!form.phone || form.phone.replace(/[^\d]/g, '').length < 8) {
      setDuplicateInfo(null);
      return undefined;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        const result = await api(`/api/reception/duplicate-check?phone=${encodeURIComponent(form.phone)}`);
        setDuplicateInfo(result.duplicate ? result : null);
      } catch {
        setDuplicateInfo(null);
      }
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [form.phone]);

  const submit = async event => {
    event.preventDefault();
    try {
      const payload = {
        ...form,
        nextFollowUp: form.nextFollowUp ? new Date(form.nextFollowUp).toISOString() : ''
      };
      const result = await api('/api/reception', { method: 'POST', body: JSON.stringify(payload) });
      setForm(blank);
      setDuplicateInfo(null);
      await load();
      setToast({
        message: result.autoAssigned
          ? `تم تسجيل التفاعل وإسناده تلقائياً إلى ${result.autoAssigned}`
          : 'تم تسجيل التفاعل وتوجيهه بنجاح'
      });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const notifyConsultant = async queueItem => {
    try {
      await api(`/api/reception/${queueItem.id}/notify-consultant`, { method: 'POST' });
      await load();
      setToast({ message: `تم إرسال إشعار فوري إلى المستشار الخاص بالعميل ${queueItem.name}` });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const runLookup = async event => {
    event.preventDefault();
    if (!lookupQuery.trim()) return;
    setLookupLoading(true);
    try {
      const result = await api(`/api/reception/student-lookup?q=${encodeURIComponent(lookupQuery.trim())}`);
      setLookupResult(result);
    } catch (error) {
      setLookupResult(null);
      setToast({ type: 'error', message: error.message });
    } finally {
      setLookupLoading(false);
    }
  };

  const availableConsultants = useMemo(() => consultants.filter(item => item.status === 'available'), [consultants]);
  const shownConsultants = consultants.length ? consultants : settings?.employees?.filter(employee => employee.department === 'Consultancy') || [];
  const catalogLinks = settings?.catalogLinks || {};
  const countryOptions = useMemo(
    () => (catalogLinks.countries || settings?.availableCountries || []).map(option => String(option || '').trim()).filter(Boolean),
    [catalogLinks.countries, settings?.availableCountries]
  );
  const interestOptions = useMemo(() => {
    if (form.country && Array.isArray(catalogLinks.programsByCountry?.[form.country])) {
      return catalogLinks.programsByCountry[form.country];
    }
    return (catalogLinks.programs || settings?.availablePrograms || []).map(option => String(option || '').trim()).filter(Boolean);
  }, [catalogLinks.programs, catalogLinks.programsByCountry, form.country, settings?.availablePrograms]);

  if (loading) return <div className="loading-page"><Spinner />جارٍ تحميل بيانات الاستقبال...</div>;

  return (
    <>
      <div className="reception-grid">
        <Card className="quick-log-card">
          <div className="quick-log-head">
            <div className="hero-icon"><Headphones /></div>
            <div>
              <p className="eyebrow">فرع الاستقبال</p>
              <h2>تسجيل تفاعل جديد</h2>
              <span>تسجيل سريع مع فحص تكرار، توزيع عادل، وإدخال مختصر مناسب لسرعة خدمة الاستقبال.</span>
            </div>
          </div>

          <form className="form-grid" autoComplete="off" onSubmit={submit}>
            <Field label="نوع التفاعل">
              <select value={form.type} onChange={event => setForm({ ...form, type: event.target.value })}>
                <option value="Walk-in">زيارة مباشرة</option>
                <option value="Incoming Call">مكالمة واردة</option>
                <option value="WhatsApp">واتساب</option>
                <option value="Email">البريد الإلكتروني</option>
                <option value="Social Media">وسائل التواصل</option>
              </select>
            </Field>
            <Field label="اسم الطالب"><input required autoComplete="off" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></Field>
            <Field label="رقم الهاتف"><input required autoComplete="off" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} /></Field>
            <Field label="البريد الإلكتروني"><input type="email" autoComplete="off" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></Field>
            <Field label="اهتمام الدراسة">
              <select value={form.interest} onChange={event => setForm({ ...form, interest: event.target.value })} required>
                <option value="">اختر البرنامج</option>
                {interestOptions.map(option => <option key={option} value={option}>{tr(option)}</option>)}
              </select>
            </Field>
            <Field label="بلد الوجهة">
              <select value={form.country} onChange={event => setForm({ ...form, country: event.target.value })}>
                <option value="">اختر دولة</option>
                {countryOptions.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </Field>
            <Field label="مصدر العميل المحتمل">
              <select required value={form.source} onChange={event => setForm({ ...form, source: event.target.value })}>
                {leadSourceOptions.map(option => <option key={option} value={option}>{tr(option)}</option>)}
              </select>
            </Field>
            <Field label="إسناد إلى مستشار">
              <select value={form.consultantId} disabled={form.autoAssign} onChange={event => setForm({ ...form, consultantId: event.target.value })}>
                <option value="">اختر مستشاراً</option>
                {shownConsultants.map(consultant => (
                  <option key={consultant.id} value={consultant.id}>{consultant.name}</option>
                ))}
              </select>
            </Field>
            <Field label="تاريخ ووقت المتابعة">
              <input type="datetime-local" value={form.nextFollowUp} onChange={event => setForm({ ...form, nextFollowUp: event.target.value })} />
            </Field>
            <Field label="الأولوية">
              <select value={form.priority} onChange={event => setForm({ ...form, priority: event.target.value })}>
                <option value="Low">منخفضة</option>
                <option value="Medium">متوسطة</option>
                <option value="High">مرتفعة</option>
              </select>
            </Field>
            {duplicateInfo && (
              <div className="field-full duplicate-alert">
                هذا العميل مسجل بالفعل ومُسند للمستشار: <strong>{duplicateInfo.consultantName}</strong>
              </div>
            )}
            <Field label="ملاحظات" className="field-full"><textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></Field>
            <label className="check-row field-full">
              <input type="checkbox" checked={form.autoAssign} onChange={event => setForm({ ...form, autoAssign: event.target.checked })} />
              <span>
                <strong>التوزيع العادل التلقائي (Round Robin)</strong>
                <small>يوزع العميل على مستشار متاح بالدور داخل الفرع.</small>
              </span>
            </label>
            <label className="check-row field-full">
              <input type="checkbox" checked={form.createLead} onChange={event => setForm({ ...form, createLead: event.target.checked })} />
              <span>
                <strong>إنشاء عميل محتمل داخل النظام تلقائياً</strong>
                <small>سيظهر للمستشار مباشرة ضمن مرحلة الاستفسار الأولي.</small>
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
                <p className="eyebrow">التوفر اللحظي</p>
                <h2>المستشارون المناوبون</h2>
              </div>
              <UserRoundCheck />
            </div>
            <div className="availability-list">
              {shownConsultants.map(consultant => (
                <div key={consultant.id}>
                  <div className="avatar soft">{initials(consultant.name)}</div>
                  <div>
                    <strong>{consultant.name}</strong>
                    <span>{consultant.title || tr(consultant.statusLabel || '')} · محول له اليوم {consultant.todayTransfers || 0}</span>
                  </div>
                  <Badge tone={consultant.status === 'busy' ? 'red' : consultant.status === 'break' ? 'amber' : 'green'}>
                    {consultant.status === 'busy' ? 'معه عميل' : consultant.status === 'break' ? 'استراحة' : 'متاح'}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="section-head">
              <div>
                <p className="eyebrow">قائمة الانتظار</p>
                <h2>الانتظار بالفرع</h2>
              </div>
              <Clock3 />
            </div>
            <div className="queue-list">
              {queue.map(item => {
                const consultant = shownConsultants.find(consultantItem => consultantItem.id === item.consultantId);
                return (
                  <div className="queue-item" key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <span>{consultant?.name || 'غير مسند'} · ينتظر منذ {formatWaitTime(item.createdAt, nowMs)}</span>
                    </div>
                    <Button type="button" variant="secondary" onClick={() => notifyConsultant(item)}>
                      <BellRing /> إرسال إشعار
                    </Button>
                  </div>
                );
              })}
              {!queue.length && (
                <div className="document-empty compact-empty">
                  <Clock3 />
                  <strong>لا يوجد انتظار حالياً</strong>
                  <span>آخر تحديث تم على Wednesday, July 22, 2026.</span>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <div className="section-head">
              <div>
                <p className="eyebrow">اليوم</p>
                <h2>ملخص الاستقبال</h2>
              </div>
              <PhoneIncoming />
            </div>
            <div className="mini-stat-grid">
              <div><PhoneIncoming /><strong>{logs.filter(log => log.type === 'Incoming Call').length}</strong><span>مكالمات</span></div>
              <div><UserRoundCheck /><strong>{logs.filter(log => log.type === 'Walk-in').length}</strong><span>زيارات مباشرة</span></div>
              <div><CheckCircle2 /><strong>{availableConsultants.length}</strong><span>متاحون الآن</span></div>
            </div>
          </Card>
        </div>
      </div>

      <div className="reception-grid secondary-reception-grid">
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
                  <th>اهتمام الدراسة</th>
                  <th>المستشار</th>
                  <th>الحالة</th>
                  <th>تاريخ التسجيل</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => {
                  const consultant = shownConsultants.find(item => item.id === log.consultantId);
                  return (
                    <tr key={log.id}>
                      <td><strong>{log.name}</strong><small>{log.phone}</small></td>
                      <td>{tr(log.type)}</td>
                      <td>{tr(log.interest || '—')}</td>
                      <td>{consultant?.name || 'غير مسند'}</td>
                      <td><Badge tone={log.status === 'Existing Lead' ? 'amber' : 'green'}>{tr(log.status)}</Badge></td>
                      <td>{formatDate(log.createdAt)} · {formatArabicTime(log.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="quick-log-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">استعلام قراءة فقط</p>
              <h2>الاستعلام عن القبول والمستندات</h2>
              <span>للمراجعة فقط دون أي صلاحية تعديل.</span>
            </div>
            <Search />
          </div>

          <form className="lookup-form" onSubmit={runLookup}>
            <div className="search-box">
              <Search />
              <input value={lookupQuery} onChange={event => setLookupQuery(event.target.value)} placeholder="ابحث بالاسم أو الهاتف أو البريد..." />
            </div>
            <Button type="submit" disabled={lookupLoading}>{lookupLoading ? 'جارٍ الاستعلام...' : 'استعلام'}</Button>
          </form>

          {lookupResult && (
            <div className="lookup-result-card">
              <div className="lookup-head">
                <strong>{lookupResult.name}</strong>
                <span>{lookupResult.phone || lookupResult.email}</span>
              </div>
              <div className="lookup-status-grid">
                <div>
                  <span>حالة القبول الجامعي</span>
                  <strong>{tr(lookupResult.acceptanceStatus)}</strong>
                </div>
                <div>
                  <span>حالة المستندات</span>
                  <strong>{lookupResult.checklistStatus}</strong>
                </div>
              </div>
              <div className="lookup-docs-list">
                {lookupResult.documents.map(document => (
                  <div className="lookup-doc-row" key={document.type}>
                    <span>{tr(document.type)}</span>
                    <Badge tone={document.status === 'uploaded' ? 'green' : 'red'}>
                      {document.status === 'uploaded' ? 'مرفوع' : 'ناقص'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
