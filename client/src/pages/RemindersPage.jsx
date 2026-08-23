import React, { useEffect, useMemo, useState } from 'react';
import { Archive, BellRing, CheckCircle2, ClipboardList, GraduationCap, Plus, SendToBack, UserRound } from 'lucide-react';
import { api, formatDate } from '../api.js';
import { Badge, Button, Card, Field, Modal, Spinner, Toast } from '../components/UI.jsx';
import { useAuth } from '../auth.jsx';
import { tr } from '../i18n.js';

const TODAY = '2026-08-23';

const tabs = [
  { key: 'all', label: 'الكل', icon: BellRing },
  { key: 'tasks', label: 'المهام', icon: ClipboardList },
  { key: 'admissions', label: 'القبول', icon: GraduationCap },
  { key: 'personal', label: 'شخصي', icon: UserRound }
];

const blankReminder = {
  title: '',
  text: '',
  type: 'tasks',
  dueDate: TODAY,
  assignedUserId: ''
};

export default function RemindersPage() {
  const { user } = useAuth();
  const canManageAssignments = ['admin', 'management'].includes(user.role);
  const [activeTab, setActiveTab] = useState('all');
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [reminders, setReminders] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(blankReminder);
  const [busyId, setBusyId] = useState('');

  const assignableUsers = useMemo(
    () =>
      users
        .filter(item => item.isActive !== false)
        .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'ar')),
    [users]
  );

  const load = async () => {
    try {
      const [reminderList, settings] = await Promise.all([api('/api/reminders'), api('/api/settings')]);
      setReminders(reminderList);
      setUsers(settings.users || []);
      if (!canManageAssignments) {
        setForm(current => ({ ...current, assignedUserId: user.id || '' }));
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

  const visible = useMemo(
    () =>
      reminders
        .filter(item => !item.archived)
        .filter(item => activeTab === 'all' || item.type === activeTab)
        .filter(item => (assigneeFilter ? (item.assignedUserId || item.userId) === assigneeFilter : true)),
    [activeTab, assigneeFilter, reminders]
  );

  const counts = useMemo(
    () => ({
      active: reminders.filter(item => !item.archived).length,
      tasks: reminders.filter(item => !item.archived && item.type === 'tasks').length,
      admissions: reminders.filter(item => !item.archived && item.type === 'admissions').length,
      personal: reminders.filter(item => !item.archived && item.type === 'personal').length
    }),
    [reminders]
  );

  const createReminder = async event => {
    event.preventDefault();
    try {
      const targetAssigneeId = canManageAssignments ? form.assignedUserId : user.id;
      const created = await api('/api/reminders', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          assignedUserId: targetAssigneeId
        })
      });
      const assignedUser = assignableUsers.find(item => item.id === targetAssigneeId) || null;
      setReminders(current => [{ ...created, assignedUser: assignedUser || created.assignedUser || null }, ...current]);
      setOpen(false);
      setForm({ ...blankReminder, assignedUserId: canManageAssignments ? '' : user.id || '' });
      setToast({ message: 'تم إنشاء التذكير بنجاح.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const archiveReminder = async reminderId => {
    try {
      const updated = await api(`/api/reminders/${reminderId}`, {
        method: 'PATCH',
        body: JSON.stringify({ archived: true })
      });
      setReminders(current => current.map(item => (item.id === updated.id ? { ...item, ...updated } : item)));
      setToast({ message: 'تمت أرشفة التذكير وإنهاؤه.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const reassignReminder = async (reminder, assignedUserId) => {
    try {
      setBusyId(reminder.id);
      const updated = await api(`/api/reminders/${reminder.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ assignedUserId })
      });
      const assignedUser = assignableUsers.find(item => item.id === assignedUserId) || null;
      setReminders(current =>
        current.map(item =>
          item.id === reminder.id
            ? { ...item, ...updated, assignedUserId, assignedUser: assignedUser || item.assignedUser }
            : item
        )
      );
      setToast({ message: assignedUser ? `تم إسناد التذكير إلى ${assignedUser.name}.` : 'تم تحديث إسناد التذكير.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    } finally {
      setBusyId('');
    }
  };

  const convertReminder = async reminder => {
    try {
      setBusyId(reminder.id);
      await api(`/api/reminders/${reminder.id}/convert-to-task`, {
        method: 'POST',
        body: JSON.stringify({
          assignedUserId: reminder.assignedUserId || reminder.userId || '',
          title: reminder.title || reminder.text.slice(0, 80),
          dueDate: reminder.dueDate || TODAY
        })
      });
      setReminders(current =>
        current.map(item =>
          item.id === reminder.id
            ? { ...item, archived: true, convertedAt: '2026-08-23T00:00:00.000Z' }
            : item
        )
      );
      setToast({ message: 'تم تحويل التذكير إلى مهمة مسندة بنجاح.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    } finally {
      setBusyId('');
    }
  };

  if (loading) return <div className="loading-page"><Spinner />جارٍ تحميل التذكيرات...</div>;

  return (
    <>
      <div className="kpi-grid reports-kpis">
        <Card className="kpi-card"><div className="kpi-meta"><span>التذكيرات النشطة</span><strong>{counts.active}</strong></div></Card>
        <Card className="kpi-card"><div className="kpi-meta"><span>تذكيرات المهام</span><strong>{counts.tasks}</strong></div></Card>
        <Card className="kpi-card"><div className="kpi-meta"><span>تذكيرات القبول</span><strong>{counts.admissions}</strong></div></Card>
        <Card className="kpi-card"><div className="kpi-meta"><span>التذكيرات الشخصية</span><strong>{counts.personal}</strong></div></Card>
      </div>

      <Card className="tasks-board-card">
        <div className="panel-toolbar tasks-board-toolbar">
          <div className="crm-tabs">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                className={`crm-tab ${activeTab === key ? 'active' : ''}`}
                onClick={() => setActiveTab(key)}
                type="button"
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <div className="toolbar-right">
            {canManageAssignments && (
              <select value={assigneeFilter} onChange={event => setAssigneeFilter(event.target.value)}>
                <option value="">كل الموظفين</option>
                {assignableUsers.map(item => (
                  <option key={item.id} value={item.id}>{item.name} - {tr(item.role)}</option>
                ))}
              </select>
            )}
            <Button onClick={() => setOpen(true)} type="button"><Plus /> إضافة تذكير</Button>
          </div>
        </div>

        <div className="crm-grid crm-grid-two">
          {visible.map(reminder => (
            <Card className="reminder-card reminder-admin-card" key={reminder.id}>
              <div className="reminder-head">
                <Badge tone={reminder.type === 'admissions' ? 'purple' : reminder.type === 'personal' ? 'blue' : 'amber'}>
                  {tabs.find(tab => tab.key === reminder.type)?.label || 'تنبيه'}
                </Badge>
                {reminder.dueDate && <span className="reminder-date">{formatDate(reminder.dueDate)}</span>}
              </div>

              {reminder.title ? <h3>{reminder.title}</h3> : <h3>{reminder.text.slice(0, 70)}</h3>}
              <p>{reminder.text}</p>

              <div className="reminder-meta">
                <span>المسند إليه: {reminder.assignedUser?.name || 'غير محدد'}</span>
                <span>أنشأه: {reminder.createdBy || 'النظام'}</span>
              </div>

              {canManageAssignments && (
                <Field label="إعادة الإسناد" className="reminder-field">
                  <select
                    disabled={busyId === reminder.id}
                    value={reminder.assignedUserId || reminder.userId || ''}
                    onChange={event => reassignReminder(reminder, event.target.value)}
                  >
                    {assignableUsers.map(item => (
                      <option key={item.id} value={item.id}>{item.name} - {tr(item.role)}</option>
                    ))}
                  </select>
                </Field>
              )}

              <div className="reminder-actions">
                <Button variant="secondary" onClick={() => convertReminder(reminder)} type="button" disabled={busyId === reminder.id}>
                  <SendToBack size={15} />
                  تحويل إلى مهمة
                </Button>
                <Button className="reminder-action" onClick={() => archiveReminder(reminder.id)} type="button" disabled={busyId === reminder.id}>
                  <Archive size={15} />
                  أرشفة وإنهاء
                </Button>
              </div>
            </Card>
          ))}

          {!visible.length && (
            <Card className="document-empty compact-empty">
              <CheckCircle2 />
              <strong>لا توجد تذكيرات نشطة</strong>
              <span>كل العناصر في هذا التبويب تمت أرشفتها أو تحويلها إلى مهام.</span>
            </Card>
          )}
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="إضافة تذكير جديد" subtitle="يمكن للأدمن أو الإدارة إسناد التذكير مباشرة أو تحويله لاحقًا إلى مهمة">
        <form className="stack-form" onSubmit={createReminder}>
          <Field label="عنوان مختصر">
            <input value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} />
          </Field>
          <Field label="نوع التذكير">
            <select value={form.type} onChange={event => setForm({ ...form, type: event.target.value })}>
              <option value="tasks">المهام</option>
              <option value="admissions">القبول</option>
              <option value="personal">شخصي</option>
            </select>
          </Field>
          <Field label="نص التذكير">
            <textarea required value={form.text} onChange={event => setForm({ ...form, text: event.target.value })} />
          </Field>
          <Field label="تاريخ المتابعة">
            <input type="date" value={form.dueDate} onChange={event => setForm({ ...form, dueDate: event.target.value })} />
          </Field>
          {canManageAssignments && (
            <Field label="الموظف المسؤول">
              <select value={form.assignedUserId} onChange={event => setForm({ ...form, assignedUserId: event.target.value })}>
                <option value="">اختر موظفًا</option>
                {assignableUsers.map(item => (
                  <option key={item.id} value={item.id}>{item.name} - {tr(item.role)}</option>
                ))}
              </select>
            </Field>
          )}
          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button type="submit">حفظ التذكير</Button>
          </div>
        </form>
      </Modal>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
