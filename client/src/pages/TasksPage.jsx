import React, { useEffect, useMemo, useState } from 'react';
import { AlarmClockCheck, CheckCheck, CircleAlert, Plus, Search, Trash2, UserRound } from 'lucide-react';
import { api, formatDate } from '../api.js';
import { Badge, Button, Card, Field, Modal, Spinner, Toast } from '../components/UI.jsx';
import { useAuth } from '../auth.jsx';
import { tr } from '../i18n.js';
import { can } from '../permissions.js';

const TODAY = '2026-08-26';
const WORKFLOW_KEY = 'eduglobal_task_workflow_v1';
const ROLE_OPTIONS = [
  { value: '', label: 'عام' },
  { value: 'consultant', label: 'الاستشارات' },
  { value: 'admissions', label: 'القبول' },
  { value: 'reception', label: 'الاستقبال' },
  { value: 'hr', label: 'الموارد البشرية' },
  { value: 'finance', label: 'المالية' }
];

const blankTask = {
  title: '',
  description: '',
  dueDate: TODAY,
  priority: 'Medium',
  assignedRole: '',
  assignedUserId: ''
};

function loadWorkflowMap() {
  try {
    return JSON.parse(localStorage.getItem(WORKFLOW_KEY)) || {};
  } catch {
    return {};
  }
}

export default function TasksPage() {
  const { user } = useAuth();
  const canManageAssignments = ['admin', 'management'].includes(user.role);
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('today');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blankTask);
  const [toast, setToast] = useState(null);
  const [workflowMap, setWorkflowMap] = useState(loadWorkflowMap);
  const [reassigningId, setReassigningId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const assignableUsers = useMemo(
    () =>
      users
        .filter(item => item.isActive !== false)
        .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'ar')),
    [users]
  );

  const load = async () => {
    try {
      const [taskList, settings] = await Promise.all([api('/api/tasks'), api('/api/settings')]);
      setTasks(taskList);
      setUsers(settings.users || []);
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(
    () =>
      tasks
        .filter(task =>
          [
            task.title,
            task.description,
            task.source,
            task.assignedRole,
            task.priority,
            task.status,
            task.assignedUser?.name
          ].some(value => String(value || '').toLowerCase().includes(query.toLowerCase()))
        )
        .filter(task => {
          if (scope === 'all') return true;
          return String(task.dueDate || '').slice(0, 10) === TODAY;
        })
        .filter(task => (assigneeFilter ? task.assignedUserId === assigneeFilter : true)),
    [assigneeFilter, query, scope, tasks]
  );

  const normalized = useMemo(
    () =>
      filtered.map(task => {
        if (task.status === 'done') return { ...task, workflowState: 'done' };
        return { ...task, workflowState: workflowMap[task.id] || 'pending' };
      }),
    [filtered, workflowMap]
  );

  const columns = useMemo(
    () => [
      { key: 'pending', label: 'في الانتظار', tone: 'amber' },
      { key: 'in_progress', label: 'قيد التنفيذ', tone: 'blue' },
      { key: 'done', label: 'مكتملة', tone: 'green' }
    ],
    []
  );

  const counts = useMemo(
    () => ({
      alerts: normalized.filter(task => task.kind === 'alert').length,
      manual: normalized.filter(task => task.kind === 'manual').length,
      done: normalized.filter(task => task.workflowState === 'done').length,
      high: normalized.filter(task => task.priority === 'High').length
    }),
    [normalized]
  );

  const createTask = async event => {
    event?.preventDefault?.();
    if (submitting) return;
    setSubmitting(true);
    try {
      await api('/api/tasks', { method: 'POST', body: JSON.stringify(form) });
      setOpen(false);
      setForm(blankTask);
      setLoading(true);
      await load();
      setToast({ message: 'تم إنشاء المهمة بنجاح.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  const moveTask = async (task, nextState) => {
    if (nextState === 'done') {
      try {
        await api(`/api/tasks/${task.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'done' })
        });
        setTasks(current => current.map(item => (item.id === task.id ? { ...item, status: 'done' } : item)));
      } catch (error) {
        setToast({ type: 'error', message: error.message });
        return;
      }
    }

    if (task.status === 'done' && nextState !== 'done') {
      try {
        await api(`/api/tasks/${task.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'open' })
        });
        setTasks(current => current.map(item => (item.id === task.id ? { ...item, status: 'open' } : item)));
      } catch (error) {
        setToast({ type: 'error', message: error.message });
        return;
      }
    }

    if (nextState !== 'done') {
      const nextMap = { ...workflowMap, [task.id]: nextState };
      setWorkflowMap(nextMap);
      localStorage.setItem(WORKFLOW_KEY, JSON.stringify(nextMap));
    }
  };

  const removeTask = async task => {
    if (!window.confirm(`هل تريد حذف المهمة ${task.title}؟`)) return;
    try {
      await api(`/api/tasks/${task.id}`, { method: 'DELETE' });
      setTasks(current => current.filter(item => item.id !== task.id));
      setToast({ message: 'تم حذف المهمة.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const updateFormAssignee = assignedUserId => {
    const assignedUser = assignableUsers.find(item => item.id === assignedUserId) || null;
    setForm(current => ({
      ...current,
      assignedUserId,
      assignedRole: assignedUser ? assignedUser.role : current.assignedRole
    }));
  };

  const reassignTask = async (task, assignedUserId) => {
    if (task.kind !== 'manual') return;
    const assignedUser = assignableUsers.find(item => item.id === assignedUserId) || null;
    const payload = {
      assignedUserId,
      assignedRole: assignedUser ? assignedUser.role : ''
    };

    try {
      setReassigningId(task.id);
      const updated = await api(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      setTasks(current =>
        current.map(item =>
          item.id === task.id
            ? {
                ...item,
                ...updated,
                assignedUser: assignedUser || null
              }
            : item
        )
      );
      setToast({ message: assignedUser ? `تم إسناد المهمة إلى ${assignedUser.name}.` : 'تم جعل المهمة عامة بدون موظف محدد.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    } finally {
      setReassigningId('');
    }
  };

  if (loading) return <div className="loading-page"><Spinner />جارٍ تحميل المهام...</div>;

  return (
    <>
      <div className="kpi-grid reports-kpis">
        <Card className="kpi-card"><div className="kpi-meta"><span>التنبيهات الآلية</span><strong>{counts.alerts}</strong></div></Card>
        <Card className="kpi-card"><div className="kpi-meta"><span>المهام اليدوية</span><strong>{counts.manual}</strong></div></Card>
        <Card className="kpi-card"><div className="kpi-meta"><span>المهام المكتملة</span><strong>{counts.done}</strong></div></Card>
        <Card className="kpi-card"><div className="kpi-meta"><span>عالية الأولوية</span><strong>{counts.high}</strong></div></Card>
      </div>

      <Card className="tasks-board-card">
        <div className="panel-toolbar tasks-board-toolbar">
          <div className="search-box">
            <Search />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث داخل المهام..." />
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
            <div className="crm-tabs compact">
              <button className={`crm-tab ${scope === 'today' ? 'active' : ''}`} onClick={() => setScope('today')} type="button">Today</button>
              <button className={`crm-tab ${scope === 'all' ? 'active' : ''}`} onClick={() => setScope('all')} type="button">All</button>
            </div>
            {can(user, 'manageTasks') && (
              <Button onClick={() => setOpen(true)} type="button"><Plus /> إضافة مهمة</Button>
            )}
          </div>
        </div>

        <div className="tasks-layout tasks-layout-triple">
          {columns.map(column => {
            const columnTasks = normalized.filter(task => task.workflowState === column.key);
            return (
              <section className="task-column" key={column.key}>
                <div className="section-head">
                  <div>
                    <p className="eyebrow">Task State</p>
                    <h2>{column.label}</h2>
                  </div>
                  <Badge tone={column.tone}>{columnTasks.length}</Badge>
                </div>

                <div className="task-stack">
                  {columnTasks.map(task => {
                    const assigneeLabel = task.assignedUser?.name || (task.assignedRole ? tr(task.assignedRole) : 'عام');
                    const assigneeRole = task.assignedUser?.role ? tr(task.assignedUser.role) : '';
                    return (
                      <article className={`task-card ${task.workflowState === 'done' ? 'done' : ''}`} key={task.id}>
                        <div className="task-top">
                          <Badge tone={task.priority === 'High' ? 'red' : task.priority === 'Medium' ? 'amber' : 'neutral'}>{tr(task.priority)}</Badge>
                          <Badge tone={task.kind === 'alert' ? 'purple' : 'blue'}>{task.kind === 'alert' ? 'تنبيه' : 'مهمة'}</Badge>
                        </div>
                        <h3>{task.title}</h3>
                        <p>{task.description || 'لا توجد تفاصيل إضافية'}</p>
                        <div className="task-meta">
                          <span>الاستحقاق: {formatDate(task.dueDate)}</span>
                          <span>المسند إليه: {assigneeLabel}{assigneeRole && assigneeRole !== assigneeLabel ? ` · ${assigneeRole}` : ''}</span>
                        </div>

                        {canManageAssignments && task.kind === 'manual' && (
                          <Field label="إعادة الإسناد">
                            <div className="inline-form-row">
                              <UserRound size={15} />
                              <select
                                disabled={reassigningId === task.id}
                                value={task.assignedUserId || ''}
                                onChange={event => reassignTask(task, event.target.value)}
                              >
                                <option value="">مهمة عامة</option>
                                {assignableUsers.map(item => (
                                  <option key={item.id} value={item.id}>{item.name} - {tr(item.role)}</option>
                                ))}
                              </select>
                            </div>
                          </Field>
                        )}

                        <div className="task-actions">
                          {column.key !== 'pending' && <Button variant="ghost" type="button" onClick={() => moveTask(task, 'pending')}>إلى الانتظار</Button>}
                          {column.key !== 'in_progress' && task.workflowState !== 'done' && <Button variant="ghost" type="button" onClick={() => moveTask(task, 'in_progress')}>بدء التنفيذ</Button>}
                          {column.key !== 'done' && <Button variant="ghost" type="button" onClick={() => moveTask(task, 'done')}>إنهاء</Button>}
                          {task.kind === 'manual' && (
                            <button className="icon-btn small danger" onClick={() => removeTask(task)} type="button" title="حذف المهمة">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}

                  {!columnTasks.length && (
                    <div className="document-empty compact-empty">
                      {column.key === 'done' ? <CheckCheck /> : column.key === 'in_progress' ? <AlarmClockCheck /> : <CircleAlert />}
                      <strong>لا توجد عناصر</strong>
                      <span>لا توجد مهام في هذا العمود حاليًا.</span>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="إضافة مهمة جديدة" subtitle="يمكن إسناد المهمة إلى موظف محدد أو إبقاؤها عامة">
        <form className="stack-form" autoComplete="off" noValidate onSubmit={event => event.preventDefault()}>
          <Field label="عنوان المهمة">
            <input required value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} />
          </Field>
          <Field label="الوصف">
            <textarea value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} />
          </Field>
          <Field label="تاريخ الاستحقاق">
            <input type="date" value={form.dueDate} onChange={event => setForm({ ...form, dueDate: event.target.value })} />
          </Field>
          <Field label="الأولوية">
            <select value={form.priority} onChange={event => setForm({ ...form, priority: event.target.value })}>
              <option value="Low">منخفضة</option>
              <option value="Medium">متوسطة</option>
              <option value="High">مرتفعة</option>
            </select>
          </Field>
          <Field label="الموظف المسؤول">
            <select value={form.assignedUserId} onChange={event => updateFormAssignee(event.target.value)}>
              <option value="">بدون موظف محدد</option>
              {assignableUsers.map(item => (
                <option key={item.id} value={item.id}>{item.name} - {tr(item.role)}</option>
              ))}
            </select>
          </Field>
          {!form.assignedUserId && (
            <Field label="القسم المستهدف">
              <select value={form.assignedRole} onChange={event => setForm({ ...form, assignedRole: event.target.value })}>
                {ROLE_OPTIONS.map(option => (
                  <option key={option.value || 'general'} value={option.value}>{option.label}</option>
                ))}
              </select>
            </Field>
          )}
          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button type="button" disabled={submitting} onClick={createTask}>{submitting ? 'جارٍ الحفظ...' : 'حفظ المهمة'}</Button>
          </div>
        </form>
      </Modal>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
