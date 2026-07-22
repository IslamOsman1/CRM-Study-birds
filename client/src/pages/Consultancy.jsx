import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  CircleAlert,
  GripVertical,
  Mail,
  Pencil,
  Phone,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Wallet,
  MessageCircle
} from 'lucide-react';
import { api, formatDate, initials } from '../api.js';
import { Badge, Button, Field, Modal, Spinner, Toast } from '../components/UI.jsx';
import { useAuth } from '../auth.jsx';
import { formatArabicTime, tr } from '../i18n.js';
import { can } from '../permissions.js';

const stageTone = {
  'Initial Inquiry': 'neutral',
  Contacted: 'blue',
  'Consultation Completed': 'purple',
  'Awaiting Decision': 'amber',
  'Closed / Won': 'green',
  Lost: 'red'
};

const budgetOptions = [
  'Less than $5,000',
  '$5,000 - $10,000',
  'More than $10,000'
];

const currentLevelOptions = ['High School', 'Bachelor', 'Master'];

const targetCountryOptions = ['Germany', 'Canada', 'United Kingdom', 'Malaysia', 'Turkey', 'Netherlands'];
const majorOptions = ['Engineering', 'Medicine', 'Business Administration', 'Computer Science', 'Architecture', 'Marketing'];

const blank = {
  name: '',
  phone: '',
  email: '',
  country: '',
  program: '',
  targetCountry: '',
  targetMajor: '',
  budget: '',
  currentLevel: '',
  university: '',
  source: 'Website',
  consultantId: '',
  priority: 'Medium',
  nextFollowUp: '',
  lostReason: '',
  notes: ''
};

function toDateTimeLocalValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function toIsoFromDateTimeLocal(value) {
  return value ? new Date(value).toISOString() : '';
}

function isOverdue(lead) {
  if (!lead.nextFollowUp) return false;
  const followUpTime = new Date(lead.nextFollowUp).getTime();
  const updatedTime = new Date(lead.updatedAt || lead.createdAt || 0).getTime();
  return followUpTime < Date.now() && updatedTime <= followUpTime;
}

function whatsappLink(phone) {
  const normalized = String(phone || '').replace(/[^\d]/g, '');
  return normalized ? `https://wa.me/${normalized}` : '#';
}

export default function Consultancy() {
  const { user } = useAuth();
  const [leads, setLeads] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [editForm, setEditForm] = useState(blank);
  const [followUpValue, setFollowUpValue] = useState('');
  const [editingLead, setEditingLead] = useState(null);
  const [followUpLead, setFollowUpLead] = useState(null);
  const [toast, setToast] = useState(null);

  const canCreateLead = can(user.role, 'createLead');
  const canEditLead = can(user.role, 'editLead');
  const canDeleteLead = can(user.role, 'deleteLead');
  const canMoveLead = can(user.role, 'moveLead');

  const load = () =>
    Promise.all([api('/api/leads'), api('/api/settings')])
      .then(([leadData, settingData]) => {
        setLeads(leadData);
        setSettings(settingData);
      })
      .catch(error => setToast({ type: 'error', message: error.message }))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const consultants = useMemo(() => settings?.employees.filter(employee => employee.department === 'Consultancy') || [], [settings]);
  const stages = settings?.pipelineStages || [];
  const shown = useMemo(
    () =>
      leads.filter(lead =>
        [
          lead.name,
          lead.phone,
          lead.email,
          lead.country,
          lead.program,
          lead.university,
          lead.targetCountry,
          lead.targetMajor,
          lead.budget,
          lead.currentLevel,
          lead.lostReason
        ].some(value => String(value || '').toLowerCase().includes(search.toLowerCase()))
      ),
    [leads, search]
  );

  const move = async (id, stage) => {
    try {
      await api(`/api/leads/${id}/move`, { method: 'POST', body: JSON.stringify({ stage }) });
      await load();
      setToast({ message: `تم نقل العميل المحتمل إلى مرحلة ${tr(stage)}` });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const create = async event => {
    event.preventDefault();
    try {
      await api('/api/leads', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          nextFollowUp: toIsoFromDateTimeLocal(form.nextFollowUp)
        })
      });
      setOpen(false);
      setForm(blank);
      await load();
      setToast({ message: 'تمت إضافة العميل المحتمل إلى مسار الاستشارات بنجاح' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const startEdit = lead => {
    setEditingLead(lead);
    setEditForm({
      name: lead.name || '',
      phone: lead.phone || '',
      email: lead.email || '',
      country: lead.country || '',
      program: lead.program || '',
      targetCountry: lead.targetCountry || lead.country || '',
      targetMajor: lead.targetMajor || lead.program || '',
      budget: lead.budget || '',
      currentLevel: lead.currentLevel || '',
      university: lead.university || '',
      source: lead.source || 'Website',
      consultantId: lead.consultantId || '',
      priority: lead.priority || 'Medium',
      nextFollowUp: toDateTimeLocalValue(lead.nextFollowUp),
      lostReason: lead.lostReason || '',
      notes: lead.notes || ''
    });
    setEditOpen(true);
  };

  const updateLead = async event => {
    event.preventDefault();
    if (!editingLead) return;
    try {
      await api(`/api/leads/${editingLead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...editForm,
          nextFollowUp: toIsoFromDateTimeLocal(editForm.nextFollowUp)
        })
      });
      setEditOpen(false);
      setEditingLead(null);
      await load();
      setToast({ message: 'تم تحديث بيانات العميل المحتمل' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const openFollowUpModal = lead => {
    setFollowUpLead(lead);
    setFollowUpValue(toDateTimeLocalValue(lead.nextFollowUp));
    setFollowUpOpen(true);
  };

  const saveFollowUp = async event => {
    event.preventDefault();
    if (!followUpLead) return;
    try {
      await api(`/api/leads/${followUpLead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ nextFollowUp: toIsoFromDateTimeLocal(followUpValue) })
      });
      setFollowUpOpen(false);
      setFollowUpLead(null);
      setFollowUpValue('');
      await load();
      setToast({ message: 'تم تحديد موعد المتابعة القادم' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const removeLead = async lead => {
    if (!window.confirm(`هل تريد حذف العميل المحتمل ${lead.name}؟`)) return;
    try {
      await api(`/api/leads/${lead.id}`, { method: 'DELETE' });
      await load();
      setToast({ message: 'تم حذف العميل المحتمل' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  if (loading) return <div className="loading-page"><Spinner />جارٍ تحميل مسار العملاء...</div>;

  return (
    <>
      <div className="toolbar">
        <div className="search-box">
          <Search />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث داخل مسار الاستشارات..." />
        </div>
        <div className="toolbar-right">
          <Button variant="secondary" type="button"><SlidersHorizontal /> تصفية</Button>
          {canCreateLead && <Button onClick={() => setOpen(true)} type="button"><Plus /> عميل جديد</Button>}
        </div>
      </div>

      <div className="pipeline-board">
        {stages.map(stage => (
          <section
            className="kanban-column"
            key={stage}
            onDragOver={event => event.preventDefault()}
            onDrop={event => canMoveLead && move(event.dataTransfer.getData('text/plain'), stage)}
          >
            <header>
              <div>
                <i className={`stage-dot tone-${stageTone[stage] || 'neutral'}`} />
                <strong>{tr(stage)}</strong>
                <span>{shown.filter(lead => lead.stage === stage).length}</span>
              </div>
              <button type="button">...</button>
            </header>

            <div className="kanban-stack">
              {shown.filter(lead => lead.stage === stage).map(lead => {
                const consultant = consultants.find(item => item.id === lead.consultantId);
                const overdue = isOverdue(lead);
                return (
                  <article className={`lead-card consultancy-lead-card ${overdue ? 'is-overdue' : ''}`} draggable={canMoveLead} onDragStart={event => canMoveLead && event.dataTransfer.setData('text/plain', lead.id)} key={lead.id}>
                    <div className="lead-top">
                      <div className="lead-top-main">
                        <GripVertical />
                        <h3>{lead.name}</h3>
                      </div>
                      <div className="lead-top-badges">
                        {overdue && <span className="overdue-pill"><CircleAlert size={13} /> متابعة متأخرة</span>}
                        <Badge tone={lead.priority === 'High' ? 'red' : lead.priority === 'Medium' ? 'amber' : 'neutral'}>{tr(lead.priority)}</Badge>
                      </div>
                    </div>

                    <p className="lead-main-major">{lead.targetMajor || lead.program || 'التخصص قيد التحديد'}</p>
                    <div className="lead-country">
                      {lead.targetCountry || lead.country || 'الدولة المستهدفة قيد التحديد'}
                    </div>

                    <div className="lead-profile-grid">
                      <div>
                        <span>الدولة المستهدفة</span>
                        <strong>{tr(lead.targetCountry || lead.country || '—')}</strong>
                      </div>
                      <div>
                        <span>التخصص المطلوب</span>
                        <strong>{tr(lead.targetMajor || lead.program || '—')}</strong>
                      </div>
                      <div>
                        <span>الميزانية</span>
                        <strong>{tr(lead.budget || '—')}</strong>
                      </div>
                      <div>
                        <span>المؤهل الحالي</span>
                        <strong>{tr(lead.currentLevel || '—')}</strong>
                      </div>
                    </div>

                    <div className="lead-details compact">
                      {lead.phone && <span><Phone />{lead.phone}</span>}
                      {lead.email && <span><Mail />{lead.email}</span>}
                      {lead.nextFollowUp && (
                        <span className={overdue ? 'overdue' : ''}>
                          <CalendarClock />{formatDate(lead.nextFollowUp)} · {formatArabicTime(lead.nextFollowUp)}
                        </span>
                      )}
                      {stage === 'Lost' && lead.lostReason && (
                        <span><Wallet />سبب الفقد: {lead.lostReason}</span>
                      )}
                    </div>

                    <footer className="lead-footer">
                      <div className="lead-meta">
                        <div className="mini-avatar" title={consultant?.name}>{initials(consultant?.name || '?')}</div>
                        <span>{consultant?.name || 'غير مسند'} · {tr(lead.source)}</span>
                      </div>
                      <div className="card-actions">
                        <a className="icon-btn small whatsapp-btn" href={whatsappLink(lead.phone)} target="_blank" rel="noreferrer" title="واتساب مباشر">
                          <MessageCircle size={14} />
                        </a>
                        <button className="icon-btn small" onClick={() => openFollowUpModal(lead)} type="button" title="تحديد متابعة">
                          <CalendarClock size={14} />
                        </button>
                        {canEditLead && <button className="icon-btn small" onClick={() => startEdit(lead)} type="button" title="تعديل"><Pencil size={14} /></button>}
                        {canDeleteLead && <button className="icon-btn small danger" onClick={() => removeLead(lead)} type="button" title="حذف"><Trash2 size={14} /></button>}
                      </div>
                    </footer>
                  </article>
                );
              })}
              {!shown.some(lead => lead.stage === stage) && <div className="kanban-empty">اسحب عميلاً محتملاً إلى هنا</div>}
            </div>
          </section>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="إضافة عميل استشارات جديد" subtitle="سيظهر مباشرة داخل مسار الاستشارات." size="lg">
        <form className="form-grid" onSubmit={create}>
          <Field label="اسم الطالب"><input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></Field>
          <Field label="رقم الهاتف"><input required value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} /></Field>
          <Field label="البريد الإلكتروني"><input type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></Field>
          <Field label="الدولة المستهدفة">
            <select value={form.targetCountry} onChange={event => setForm({ ...form, targetCountry: event.target.value, country: event.target.value })}>
              <option value="">اختر الدولة</option>
              {targetCountryOptions.map(option => <option value={option} key={option}>{tr(option)}</option>)}
            </select>
          </Field>
          <Field label="التخصص المطلوب">
            <select value={form.targetMajor} onChange={event => setForm({ ...form, targetMajor: event.target.value, program: event.target.value })}>
              <option value="">اختر التخصص</option>
              {majorOptions.map(option => <option value={option} key={option}>{tr(option)}</option>)}
            </select>
          </Field>
          <Field label="الميزانية المتاحة">
            <select value={form.budget} onChange={event => setForm({ ...form, budget: event.target.value })}>
              <option value="">اختر الميزانية</option>
              {budgetOptions.map(option => <option value={option} key={option}>{tr(option)}</option>)}
            </select>
          </Field>
          <Field label="المؤهل الحالي">
            <select value={form.currentLevel} onChange={event => setForm({ ...form, currentLevel: event.target.value })}>
              <option value="">اختر المؤهل</option>
              {currentLevelOptions.map(option => <option value={option} key={option}>{tr(option)}</option>)}
            </select>
          </Field>
          <Field label="المستشار المسؤول">
            <select value={form.consultantId} onChange={event => setForm({ ...form, consultantId: event.target.value })}>
              <option value="">غير مسند</option>
              {consultants.map(consultant => <option value={consultant.id} key={consultant.id}>{consultant.name}</option>)}
            </select>
          </Field>
          <Field label="الأولوية">
            <select value={form.priority} onChange={event => setForm({ ...form, priority: event.target.value })}>
              <option value="Low">منخفضة</option>
              <option value="Medium">متوسطة</option>
              <option value="High">مرتفعة</option>
            </select>
          </Field>
          <Field label="موعد المتابعة القادم">
            <input type="datetime-local" value={form.nextFollowUp} onChange={event => setForm({ ...form, nextFollowUp: event.target.value })} />
          </Field>
          <Field label="الجامعة" className="field-full"><input value={form.university} onChange={event => setForm({ ...form, university: event.target.value })} /></Field>
          <Field label="ملاحظات" className="field-full"><textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></Field>
          <div className="form-actions field-full">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button type="submit">إنشاء العميل المحتمل</Button>
          </div>
        </form>
      </Modal>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="تعديل بطاقة العميل" subtitle={editingLead ? `تحديث بيانات ${editingLead.name}` : ''} size="lg">
        <form className="form-grid" onSubmit={updateLead}>
          <Field label="اسم الطالب"><input required value={editForm.name} onChange={event => setEditForm({ ...editForm, name: event.target.value })} /></Field>
          <Field label="رقم الهاتف"><input required value={editForm.phone} onChange={event => setEditForm({ ...editForm, phone: event.target.value })} /></Field>
          <Field label="البريد الإلكتروني"><input type="email" value={editForm.email} onChange={event => setEditForm({ ...editForm, email: event.target.value })} /></Field>
          <Field label="الدولة المستهدفة">
            <select value={editForm.targetCountry} onChange={event => setEditForm({ ...editForm, targetCountry: event.target.value, country: event.target.value })}>
              <option value="">اختر الدولة</option>
              {targetCountryOptions.map(option => <option value={option} key={option}>{tr(option)}</option>)}
            </select>
          </Field>
          <Field label="التخصص المطلوب">
            <select value={editForm.targetMajor} onChange={event => setEditForm({ ...editForm, targetMajor: event.target.value, program: event.target.value })}>
              <option value="">اختر التخصص</option>
              {majorOptions.map(option => <option value={option} key={option}>{tr(option)}</option>)}
            </select>
          </Field>
          <Field label="الميزانية المتاحة">
            <select value={editForm.budget} onChange={event => setEditForm({ ...editForm, budget: event.target.value })}>
              <option value="">اختر الميزانية</option>
              {budgetOptions.map(option => <option value={option} key={option}>{tr(option)}</option>)}
            </select>
          </Field>
          <Field label="المؤهل الحالي">
            <select value={editForm.currentLevel} onChange={event => setEditForm({ ...editForm, currentLevel: event.target.value })}>
              <option value="">اختر المؤهل</option>
              {currentLevelOptions.map(option => <option value={option} key={option}>{tr(option)}</option>)}
            </select>
          </Field>
          <Field label="المستشار المسؤول">
            <select value={editForm.consultantId} onChange={event => setEditForm({ ...editForm, consultantId: event.target.value })}>
              <option value="">غير مسند</option>
              {consultants.map(consultant => <option value={consultant.id} key={consultant.id}>{consultant.name}</option>)}
            </select>
          </Field>
          <Field label="الأولوية">
            <select value={editForm.priority} onChange={event => setEditForm({ ...editForm, priority: event.target.value })}>
              <option value="Low">منخفضة</option>
              <option value="Medium">متوسطة</option>
              <option value="High">مرتفعة</option>
            </select>
          </Field>
          <Field label="موعد المتابعة القادم">
            <input type="datetime-local" value={editForm.nextFollowUp} onChange={event => setEditForm({ ...editForm, nextFollowUp: event.target.value })} />
          </Field>
          <Field label="سبب الفقد" className="field-full">
            <input value={editForm.lostReason} onChange={event => setEditForm({ ...editForm, lostReason: event.target.value })} placeholder="مثال: الميزانية، عدم توفر التخصص..." />
          </Field>
          <Field label="الجامعة" className="field-full"><input value={editForm.university} onChange={event => setEditForm({ ...editForm, university: event.target.value })} /></Field>
          <Field label="ملاحظات" className="field-full"><textarea value={editForm.notes} onChange={event => setEditForm({ ...editForm, notes: event.target.value })} /></Field>
          <div className="form-actions field-full">
            <Button type="button" variant="secondary" onClick={() => setEditOpen(false)}>إلغاء</Button>
            <Button type="submit">حفظ التعديلات</Button>
          </div>
        </form>
      </Modal>

      <Modal open={followUpOpen} onClose={() => setFollowUpOpen(false)} title="تحديد متابعة سريعة" subtitle={followUpLead ? `اختيار الموعد القادم لـ ${followUpLead.name}` : ''}>
        <form className="stack-form" onSubmit={saveFollowUp}>
          <Field label="تاريخ ووقت المتابعة">
            <input type="datetime-local" required value={followUpValue} onChange={event => setFollowUpValue(event.target.value)} />
          </Field>
          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={() => setFollowUpOpen(false)}>إلغاء</Button>
            <Button type="submit">حفظ المتابعة</Button>
          </div>
        </form>
      </Modal>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
