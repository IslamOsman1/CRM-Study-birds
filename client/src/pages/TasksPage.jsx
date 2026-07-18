import React, { useEffect, useMemo, useState } from 'react';
import { AlarmClockCheck, BellRing, CheckCheck, CircleAlert, Plus, Search, Trash2 } from 'lucide-react';
import { api, formatDate } from '../api.js';
import { Badge, Button, Card, Field, Modal, Spinner, Toast } from '../components/UI.jsx';
import { useAuth } from '../auth.jsx';
import { tr } from '../i18n.js';
import { can } from '../permissions.js';

const blankTask = {
  title: '',
  description: '',
  dueDate: '2026-07-17',
  priority: 'Medium',
  assignedRole: ''
};

export default function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blankTask);
  const [toast, setToast] = useState(null);

  const load = () =>
    api('/api/tasks')
      .then(setTasks)
      .catch(error => setToast({ type: 'error', message: error.message }))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(
    () =>
      tasks.filter(task =>
        [task.title, task.description, task.source, task.assignedRole, task.priority, task.status]
          .some(value => String(value || '').toLowerCase().includes(query.toLowerCase()))
      ),
    [tasks, query]
  );

  const alerts = filtered.filter(task => task.kind === 'alert');
  const manual = filtered.filter(task => task.kind === 'manual');

  const createTask = async event => {
    event.preventDefault();
    try {
      await api('/api/tasks', { method: 'POST', body: JSON.stringify(form) });
      setOpen(false);
      setForm(blankTask);
      setLoading(true);
      await load();
      setToast({ message: 'تم إنشاء المهمة بنجاح' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const updateTaskStatus = async task => {
    try {
      await api(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: task.status === 'done' ? 'open' : 'done' })
      });
      setTasks(current => current.map(item => (item.id === task.id ? { ...item, status: item.status === 'done' ? 'open' : 'done' } : item)));
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const removeTask = async task => {
    if (!window.confirm(`هل تريد حذف المهمة ${task.title}؟`)) return;
    try {
      await api(`/api/tasks/${task.id}`, { method: 'DELETE' });
      setTasks(current => current.filter(item => item.id !== task.id));
      setToast({ message: 'تم حذف المهمة' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  if (loading) return <div className="loading-page"><Spinner />جارٍ تحميل المهام والتنبيهات...</div>;

  return (
    <>
      <div className="kpi-grid reports-kpis">
        <Card className="kpi-card">
          <div className="kpi-icon"><BellRing /></div>
          <div className="kpi-meta">
            <span>التنبيهات الآلية</span>
            <strong>{alerts.length}</strong>
            <small>مرتبطة بالمتابعة والمستندات والتحصيل</small>
          </div>
        </Card>
        <Card className="kpi-card">
          <div className="kpi-icon"><AlarmClockCheck /></div>
          <div className="kpi-meta">
            <span>المهام اليدوية</span>
            <strong>{manual.length}</strong>
            <small>مهام مضافة من الفريق داخل النظام</small>
          </div>
        </Card>
        <Card className="kpi-card">
          <div className="kpi-icon"><CheckCheck /></div>
          <div className="kpi-meta">
            <span>المهام المكتملة</span>
            <strong>{filtered.filter(task => task.status === 'done').length}</strong>
            <small>ضمن المهام الظاهرة حالياً</small>
          </div>
        </Card>
        <Card className="kpi-card">
          <div className="kpi-icon"><CircleAlert /></div>
          <div className="kpi-meta">
            <span>عالية الأولوية</span>
            <strong>{filtered.filter(task => task.priority === 'High').length}</strong>
            <small>تحتاج متابعة أسرع من الفريق</small>
          </div>
        </Card>
      </div>

      <Card className="tasks-board-card">
        <div className="panel-toolbar">
          <div className="search-box">
            <Search />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث داخل المهام والتنبيهات..." />
          </div>
          {can(user.role, 'manageTasks') && (
            <Button onClick={() => setOpen(true)} type="button"><Plus /> إضافة مهمة</Button>
          )}
        </div>

        <div className="tasks-layout">
          <section className="task-column">
            <div className="section-head">
              <div>
                <p className="eyebrow">متابعة تلقائية</p>
                <h2>التنبيهات اليومية</h2>
              </div>
              <Badge tone="amber">{alerts.length}</Badge>
            </div>

            <div className="task-stack">
              {alerts.length ? alerts.map(task => (
                <article className={`task-card ${task.status === 'done' ? 'done' : ''}`} key={task.id}>
                  <div className="task-top">
                    <Badge tone={task.priority === 'High' ? 'red' : 'amber'}>{tr(task.priority)}</Badge>
                    <Badge tone="purple">{tr(task.source)}</Badge>
                  </div>
                  <h3>{task.title}</h3>
                  <p>{task.description || 'لا توجد تفاصيل إضافية'}</p>
                  <div className="task-meta">
                    <span>الاستحقاق: {formatDate(task.dueDate)}</span>
                    <span>الحالة: {tr(task.status)}</span>
                  </div>
                </article>
              )) : <div className="document-empty compact-empty"><BellRing /><strong>لا توجد تنبيهات</strong><span>اليوم لا توجد متابعات آلية معلقة.</span></div>}
            </div>
          </section>

          <section className="task-column">
            <div className="section-head">
              <div>
                <p className="eyebrow">تنفيذ الفريق</p>
                <h2>المهام اليدوية</h2>
              </div>
              <Badge tone="blue">{manual.length}</Badge>
            </div>

            <div className="task-stack">
              {manual.length ? manual.map(task => (
                <article className={`task-card ${task.status === 'done' ? 'done' : ''}`} key={task.id}>
                  <div className="task-top">
                    <Badge tone={task.priority === 'High' ? 'red' : task.priority === 'Medium' ? 'amber' : 'neutral'}>{tr(task.priority)}</Badge>
                    {task.assignedRole ? <Badge tone="neutral">{tr(task.assignedRole)}</Badge> : <Badge tone="neutral">عام</Badge>}
                  </div>
                  <h3>{task.title}</h3>
                  <p>{task.description || 'لا توجد تفاصيل إضافية'}</p>
                  <div className="task-meta">
                    <span>الاستحقاق: {formatDate(task.dueDate)}</span>
                    <span>أنشأها: {task.createdBy || 'النظام'}</span>
                  </div>
                  <div className="task-actions">
                    <Button variant="ghost" type="button" onClick={() => updateTaskStatus(task)}>
                      {task.status === 'done' ? 'إعادة فتح' : 'إنهاء'}
                    </Button>
                    <button className="icon-btn small danger" onClick={() => removeTask(task)} type="button" title="حذف المهمة">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </article>
              )) : <div className="document-empty compact-empty"><CheckCheck /><strong>لا توجد مهام يدوية</strong><span>ابدأ بإضافة مهمة متابعة لفريقك.</span></div>}
            </div>
          </section>
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="إضافة مهمة جديدة" subtitle="يمكن إسناد المهمة لقسم محدد أو تركها عامة">
        <form className="stack-form" onSubmit={createTask}>
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
          <Field label="القسم المستهدف">
            <select value={form.assignedRole} onChange={event => setForm({ ...form, assignedRole: event.target.value })}>
              <option value="">عام</option>
              <option value="consultant">الاستشارات</option>
              <option value="admissions">القبول</option>
              <option value="reception">الاستقبال</option>
              <option value="hr">الموارد البشرية</option>
              <option value="finance">المالية</option>
            </select>
          </Field>
          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button type="submit">حفظ المهمة</Button>
          </div>
        </form>
      </Modal>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
