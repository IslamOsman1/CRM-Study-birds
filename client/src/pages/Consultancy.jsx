import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, GripVertical, Mail, Pencil, Phone, Plus, Search, SlidersHorizontal, Trash2 } from 'lucide-react';
import { api, formatDate, initials } from '../api.js';
import { Badge, Button, Field, Modal, Spinner, Toast } from '../components/UI.jsx';
import { useAuth } from '../auth.jsx';
import { tr } from '../i18n.js';
import { can } from '../permissions.js';

const stageTone = {
  'Initial Inquiry': 'neutral',
  Contacted: 'blue',
  'University Selection': 'purple',
  'Documents Collected': 'amber',
  'Application Sent': 'green',
  Enrolled: 'green',
  Lost: 'red'
};

const blank = {
  name: '',
  phone: '',
  email: '',
  country: '',
  program: '',
  university: '',
  source: 'Website',
  consultantId: '',
  priority: 'Medium',
  nextFollowUp: '',
  notes: ''
};

export default function Consultancy() {
  const { user } = useAuth();
  const [leads, setLeads] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [editForm, setEditForm] = useState(blank);
  const [editingLead, setEditingLead] = useState(null);
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
    () => leads.filter(lead => [lead.name, lead.phone, lead.email, lead.country, lead.program, lead.university].some(value => String(value || '').toLowerCase().includes(search.toLowerCase()))),
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
      await api('/api/leads', { method: 'POST', body: JSON.stringify(form) });
      setOpen(false);
      setForm(blank);
      await load();
      setToast({ message: 'تمت إضافة العميل المحتمل إلى المسار بنجاح' });
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
      university: lead.university || '',
      source: lead.source || 'Website',
      consultantId: lead.consultantId || '',
      priority: lead.priority || 'Medium',
      nextFollowUp: lead.nextFollowUp || '',
      notes: lead.notes || ''
    });
    setEditOpen(true);
  };

  const updateLead = async event => {
    event.preventDefault();
    if (!editingLead) return;
    try {
      await api(`/api/leads/${editingLead.id}`, { method: 'PATCH', body: JSON.stringify(editForm) });
      setEditOpen(false);
      setEditingLead(null);
      await load();
      setToast({ message: 'تم تحديث بيانات العميل المحتمل' });
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
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث داخل المسار..." />
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
                return (
                  <article className="lead-card" draggable={canMoveLead} onDragStart={event => canMoveLead && event.dataTransfer.setData('text/plain', lead.id)} key={lead.id}>
                    <div className="lead-top">
                      <GripVertical />
                      <Badge tone={lead.priority === 'High' ? 'red' : lead.priority === 'Medium' ? 'amber' : 'neutral'}>{tr(lead.priority)}</Badge>
                    </div>
                    <h3>{lead.name}</h3>
                    <p>{lead.program || 'البرنامج غير محدد بعد'}</p>
                    <div className="lead-country">
                      {lead.country || 'الوجهة قيد التحديد'}
                      {lead.university && <span> · {lead.university}</span>}
                    </div>
                    <div className="lead-details">
                      {lead.phone && <span><Phone />{lead.phone}</span>}
                      {lead.email && <span><Mail />{lead.email}</span>}
                      {lead.nextFollowUp && (
                        <span className={new Date(lead.nextFollowUp) < new Date('2026-07-17') ? 'overdue' : ''}>
                          <CalendarClock />{formatDate(lead.nextFollowUp)}
                        </span>
                      )}
                    </div>
                    <footer className="lead-footer">
                      <div className="lead-meta">
                        <div className="mini-avatar" title={consultant?.name}>{initials(consultant?.name || '?')}</div>
                        <span>{tr(lead.source)}</span>
                      </div>
                      <div className="card-actions">
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

      <Modal open={open} onClose={() => setOpen(false)} title="إضافة فرصة جديدة" subtitle="ستكون الفرصة متاحة للاستقبال والمستشارين والإدارة." size="lg">
        <form className="form-grid" onSubmit={create}>
          <Field label="اسم الطالب"><input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></Field>
          <Field label="رقم الهاتف"><input required value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} /></Field>
          <Field label="البريد الإلكتروني"><input type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></Field>
          <Field label="بلد الوجهة"><input value={form.country} onChange={event => setForm({ ...form, country: event.target.value })} /></Field>
          <Field label="البرنامج"><input value={form.program} onChange={event => setForm({ ...form, program: event.target.value })} /></Field>
          <Field label="الجامعة"><input value={form.university} onChange={event => setForm({ ...form, university: event.target.value })} /></Field>
          <Field label="مصدر العميل المحتمل">
            <select value={form.source} onChange={event => setForm({ ...form, source: event.target.value })}>
              <option value="Website">الموقع الإلكتروني</option>
              <option value="Walk-in">زيارة مباشرة</option>
              <option value="Phone">هاتف</option>
              <option value="WhatsApp">واتساب</option>
              <option value="Instagram">إنستغرام</option>
              <option value="Facebook">فيسبوك</option>
              <option value="Referral">إحالة</option>
              <option value="Google Ads">إعلانات جوجل</option>
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
          <Field label="تاريخ المتابعة القادمة"><input type="date" value={form.nextFollowUp} onChange={event => setForm({ ...form, nextFollowUp: event.target.value })} /></Field>
          <Field label="ملاحظات" className="field-full"><textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></Field>
          <div className="form-actions field-full">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button type="submit">إنشاء العميل المحتمل</Button>
          </div>
        </form>
      </Modal>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="تعديل العميل المحتمل" subtitle={editingLead ? `تحديث بيانات ${editingLead.name}` : ''} size="lg">
        <form className="form-grid" onSubmit={updateLead}>
          <Field label="اسم الطالب"><input required value={editForm.name} onChange={event => setEditForm({ ...editForm, name: event.target.value })} /></Field>
          <Field label="رقم الهاتف"><input required value={editForm.phone} onChange={event => setEditForm({ ...editForm, phone: event.target.value })} /></Field>
          <Field label="البريد الإلكتروني"><input type="email" value={editForm.email} onChange={event => setEditForm({ ...editForm, email: event.target.value })} /></Field>
          <Field label="بلد الوجهة"><input value={editForm.country} onChange={event => setEditForm({ ...editForm, country: event.target.value })} /></Field>
          <Field label="البرنامج"><input value={editForm.program} onChange={event => setEditForm({ ...editForm, program: event.target.value })} /></Field>
          <Field label="الجامعة"><input value={editForm.university} onChange={event => setEditForm({ ...editForm, university: event.target.value })} /></Field>
          <Field label="مصدر العميل المحتمل">
            <select value={editForm.source} onChange={event => setEditForm({ ...editForm, source: event.target.value })}>
              <option value="Website">الموقع الإلكتروني</option>
              <option value="Walk-in">زيارة مباشرة</option>
              <option value="Phone">هاتف</option>
              <option value="WhatsApp">واتساب</option>
              <option value="Instagram">إنستغرام</option>
              <option value="Facebook">فيسبوك</option>
              <option value="Referral">إحالة</option>
              <option value="Google Ads">إعلانات جوجل</option>
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
          <Field label="تاريخ المتابعة القادمة"><input type="date" value={editForm.nextFollowUp} onChange={event => setEditForm({ ...editForm, nextFollowUp: event.target.value })} /></Field>
          <Field label="ملاحظات" className="field-full"><textarea value={editForm.notes} onChange={event => setEditForm({ ...editForm, notes: event.target.value })} /></Field>
          <div className="form-actions field-full">
            <Button type="button" variant="secondary" onClick={() => setEditOpen(false)}>إلغاء</Button>
            <Button type="submit">حفظ التعديلات</Button>
          </div>
        </form>
      </Modal>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
