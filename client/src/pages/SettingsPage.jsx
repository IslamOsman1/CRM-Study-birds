import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Clock3, ListChecks, MessageCircleMore, Plus, Save, Settings2, ShieldCheck, Trash2, UserCog } from 'lucide-react';
import { api } from '../api.js';
import { Badge, Button, Card, Field, Modal, Spinner, Toast } from '../components/UI.jsx';
import { useAuth } from '../auth.jsx';
import { tr } from '../i18n.js';
import { can } from '../permissions.js';

function createDocumentType() {
  return { name: '', required: false };
}

function createChecklistTemplate() {
  return {
    id: `template-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    university: '',
    program: '',
    country: '',
    documentTypes: [createDocumentType()]
  };
}

function createWorkflowStage() {
  return {
    id: `stage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    description: '',
    assignedRole: 'admissions',
    priority: 'Medium',
    dueOffsetDays: 0
  };
}

function createWorkflowTemplate() {
  return {
    id: `workflow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    university: '',
    program: '',
    country: '',
    stages: [createWorkflowStage()]
  };
}

function ArrayEditor({ title, items, onAdd, onChange, onRemove, placeholder, withRequired = false, disabled = false }) {
  return (
    <Card className="settings-card">
      <div className="section-head">
        <div>
          <p className="eyebrow">إعدادات النظام</p>
          <h2>{title}</h2>
        </div>
        <Badge tone="purple">{items.length}</Badge>
      </div>

      <div className="settings-list">
        {items.map((item, index) => (
          <div className="settings-row" key={`${title}-${index}`}>
            <input
              disabled={disabled}
              value={withRequired ? item.name : item}
              onChange={event => onChange(index, withRequired ? { ...item, name: event.target.value } : event.target.value)}
              placeholder={placeholder}
            />
            {withRequired && (
              <label className="required-toggle">
                <input
                  disabled={disabled}
                  type="checkbox"
                  checked={item.required}
                  onChange={event => onChange(index, { ...item, required: event.target.checked })}
                />
                <span>إلزامي</span>
              </label>
            )}
            <button className="icon-btn small danger" disabled={disabled} type="button" onClick={() => onRemove(index)}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <Button disabled={disabled} variant="secondary" type="button" onClick={onAdd}>
        <Plus /> إضافة عنصر
      </Button>
    </Card>
  );
}

const blankUser = {
  name: '',
  email: '',
  role: 'admin',
  department: 'Human Resources',
  password: '',
  isActive: true
};

export default function SettingsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userForm, setUserForm] = useState(blankUser);
  const [metaStatus, setMetaStatus] = useState({ integration: null, channels: [], configured: false, health: 'disconnected' });
  const [metaSession, setMetaSession] = useState(null);
  const [selectedAssetIds, setSelectedAssetIds] = useState([]);
  const [form, setForm] = useState({
    companyName: '',
    workspace: '',
    currency: 'USD',
    pipelineStages: [],
    applicationStatuses: [],
    documentTypes: [],
    documentChecklistTemplates: [],
    applicationWorkflowTemplates: [],
    users: []
  });

  const canManageSettings = can(user.role, 'manageSettings');
  const canManageUsers = can(user.role, 'manageUsers');
  const canManageChecklists = can(user.role, 'manageDocumentChecklists');
  const canManageWorkflows = can(user.role, 'manageApplicationWorkflows');
  const adminUsers = useMemo(() => form.users.filter(item => item.role === 'admin'), [form.users]);
  const teamUsers = useMemo(() => form.users.filter(item => item.role !== 'admin'), [form.users]);

  const load = () =>
    Promise.all([api('/api/settings'), api('/api/integrations/meta/status')])
      .then(([settings, meta]) => {
        setForm({
          companyName: settings.companyName || '',
          workspace: settings.workspace || '',
          currency: settings.currency || 'USD',
          pipelineStages: settings.pipelineStages || [],
          applicationStatuses: settings.applicationStatuses || [],
          documentTypes: settings.documentTypes || [],
          documentChecklistTemplates: settings.documentChecklistTemplates || [],
          applicationWorkflowTemplates: settings.applicationWorkflowTemplates || [],
          users: settings.users || []
        });
        setMetaStatus(meta);
      })
      .catch(error => setToast({ type: 'error', message: error.message }))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get('meta_session');
    if (!sessionId) return;
    api(`/api/integrations/meta/assets?sessionId=${sessionId}`)
      .then(session => {
        setMetaSession(session);
        setSelectedAssetIds(session.channels.map(item => item.id));
      })
      .catch(error => setToast({ type: 'error', message: error.message }));
  }, []);

  const departments = useMemo(() => ['Consultancy', 'Admissions', 'Reception', 'Human Resources', 'Finance'], []);

  const updateArrayValue = (key, index, value) => {
    setForm(current => ({
      ...current,
      [key]: current[key].map((item, itemIndex) => (itemIndex === index ? value : item))
    }));
  };

  const addArrayValue = (key, value) => {
    setForm(current => ({ ...current, [key]: [...current[key], value] }));
  };

  const removeArrayValue = (key, index) => {
    setForm(current => ({ ...current, [key]: current[key].filter((_, itemIndex) => itemIndex !== index) }));
  };

  const updateChecklistTemplate = (templateId, updater) => {
    setForm(current => ({
      ...current,
      documentChecklistTemplates: current.documentChecklistTemplates.map(template =>
        template.id === templateId ? updater(template) : template
      )
    }));
  };

  const updateWorkflowTemplate = (templateId, updater) => {
    setForm(current => ({
      ...current,
      applicationWorkflowTemplates: current.applicationWorkflowTemplates.map(template =>
        template.id === templateId ? updater(template) : template
      )
    }));
  };

  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    try {
      await api('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          companyName: form.companyName,
          workspace: form.workspace,
          currency: form.currency,
          pipelineStages: form.pipelineStages,
          applicationStatuses: form.applicationStatuses,
          documentTypes: form.documentTypes,
          documentChecklistTemplates: form.documentChecklistTemplates,
          applicationWorkflowTemplates: form.applicationWorkflowTemplates
        })
      });
      setToast({ message: 'تم حفظ الإعدادات بنجاح' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    } finally {
      setSaving(false);
    }
  };

  const startMetaConnect = async () => {
    try {
      const result = await api('/api/integrations/meta/connect', {
        method: 'POST',
        body: JSON.stringify({ targets: ['whatsapp', 'facebook', 'instagram'] })
      });
      window.location.href = result.authUrl;
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const disconnectMeta = async () => {
    if (!window.confirm('هل تريد فصل تكامل Meta بالكامل؟')) return;
    try {
      await api('/api/integrations/meta/disconnect', { method: 'DELETE' });
      setMetaSession(null);
      setSelectedAssetIds([]);
      await load();
      setToast({ message: 'تم فصل تكامل Meta' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const reconnectMeta = async () => {
    try {
      const result = await api('/api/integrations/meta/reconnect', { method: 'POST' });
      window.location.href = result.authUrl;
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const connectSelectedAssets = async () => {
    if (!metaSession || !selectedAssetIds.length) return;
    try {
      await api('/api/integrations/meta/assets/connect', {
        method: 'POST',
        body: JSON.stringify({ sessionId: metaSession.id, assetIds: selectedAssetIds })
      });
      setMetaSession(null);
      setSelectedAssetIds([]);
      window.history.replaceState({}, '', window.location.pathname);
      await load();
      setToast({ message: 'تم ربط أصول Meta المحددة بنجاح' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const createUser = async event => {
    event.preventDefault();
    try {
      await api('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          ...userForm,
          role: 'admin'
        })
      });
      setCreateOpen(false);
      setUserForm(blankUser);
      await load();
      setToast({ message: 'تمت إضافة المستخدم بنجاح' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const startEditUser = currentUser => {
    setSelectedUser(currentUser);
    setUserForm({
      name: currentUser.name,
      email: currentUser.email,
      role: currentUser.role,
      department: currentUser.department,
      password: '',
      isActive: currentUser.isActive !== false
    });
    setEditOpen(true);
  };

  const updateUser = async event => {
    event.preventDefault();
    if (!selectedUser) return;
    try {
      await api(`/api/users/${selectedUser.id}`, { method: 'PATCH', body: JSON.stringify(userForm) });
      setEditOpen(false);
      setSelectedUser(null);
      setUserForm(blankUser);
      await load();
      setToast({ message: 'تم تحديث بيانات المستخدم' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  if (loading) return <div className="loading-page"><Spinner />جارٍ تحميل الإعدادات...</div>;

  return (
    <>
      <form className="settings-layout" onSubmit={submit}>
        <Card className="settings-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">الإعدادات العامة</p>
              <h2>بيانات الشركة</h2>
            </div>
            <Settings2 />
          </div>

          <div className="form-grid">
            <Field label="اسم الشركة"><input disabled={!canManageSettings} value={form.companyName} onChange={event => setForm({ ...form, companyName: event.target.value })} /></Field>
            <Field label="اسم مساحة العمل"><input disabled={!canManageSettings} value={form.workspace} onChange={event => setForm({ ...form, workspace: event.target.value })} /></Field>
            <Field label="العملة">
              <select disabled={!canManageSettings} value={form.currency} onChange={event => setForm({ ...form, currency: event.target.value })}>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="EGP">EGP</option>
                <option value="TRY">TRY</option>
              </select>
            </Field>
          </div>
        </Card>

        <Card className="settings-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">Integrations</p>
              <h2>Meta: WhatsApp + Messenger + Instagram</h2>
            </div>
            <MessageCircleMore />
          </div>

          <div className="admissions-summary-grid">
            <div className="summary-tile soft">
              <div><strong>{metaStatus.configured ? 'جاهز' : 'غير مهيأ'}</strong><span>حالة إعداد التطبيق</span></div>
            </div>
            <div className="summary-tile">
              <div><strong>{metaStatus.integration?.status || 'disconnected'}</strong><span>حالة الربط</span></div>
            </div>
            <div className="summary-tile warning">
              <div><strong>{metaStatus.channels?.filter(item => item.channelType === 'whatsapp').length || 0}</strong><span>قنوات واتساب</span></div>
            </div>
            <div className="summary-tile soft">
              <div><strong>{metaStatus.channels?.length || 0}</strong><span>إجمالي القنوات</span></div>
            </div>
          </div>

          <div className="notes-box">
            <strong>التدفق الحالي</strong>
            <p>ابدأ الربط الرسمي عبر Meta OAuth، ثم اختر صفحات فيسبوك وحسابات إنستغرام وأرقام واتساب التي تريد ربطها بالشركة الحالية فقط.</p>
          </div>

          <div className="form-actions">
            <Button type="button" onClick={startMetaConnect}>بدء الربط الرسمي</Button>
            {!!metaStatus.integration && <Button type="button" variant="secondary" onClick={reconnectMeta}>إعادة الربط</Button>}
            {!!metaStatus.integration && <Button type="button" variant="ghost" onClick={disconnectMeta}>فصل التكامل</Button>}
          </div>

          {!!metaStatus.channels?.length && (
            <div className="templates-stack">
              {metaStatus.channels.map(channel => (
                <article className="template-card" key={channel.id}>
                  <div className="template-card-head">
                    <div>
                      <h3>{channel.channelType}</h3>
                      <span>{channel.pageName || channel.instagramUsername || channel.displayPhoneNumber || 'قناة Meta'}</span>
                    </div>
                    <Badge tone={channel.status === 'connected' ? 'green' : 'amber'}>{channel.status}</Badge>
                  </div>
                </article>
              ))}
            </div>
          )}

          {!!metaSession && (
            <div className="templates-stack">
              <article className="template-card">
                <div className="template-card-head">
                  <div>
                    <h3>أصول Meta المكتشفة</h3>
                    <span>اختر الأصول التي تريد ربطها بهذه الشركة قبل انتهاء الجلسة.</span>
                  </div>
                </div>

                <div className="settings-list">
                  {metaSession.channels.map(asset => (
                    <label className="check-row" key={asset.id}>
                      <input
                        type="checkbox"
                        checked={selectedAssetIds.includes(asset.id)}
                        onChange={event => setSelectedAssetIds(current => event.target.checked ? [...current, asset.id] : current.filter(item => item !== asset.id))}
                      />
                      <div>
                        <strong>{asset.channelType} · {asset.pageName || asset.instagramUsername || asset.displayPhoneNumber || asset.verifiedName || 'Meta Asset'}</strong>
                        <small>{asset.pageId || asset.instagramAccountId || asset.phoneNumberId}</small>
                      </div>
                    </label>
                  ))}
                </div>

                <div className="form-actions">
                  <Button type="button" onClick={connectSelectedAssets}>ربط الأصول المحددة</Button>
                </div>
              </article>
            </div>
          )}
        </Card>

        <ArrayEditor
          title="مراحل مسار العملاء"
          items={form.pipelineStages}
          onAdd={() => canManageSettings && addArrayValue('pipelineStages', '')}
          onChange={(index, value) => canManageSettings && updateArrayValue('pipelineStages', index, value)}
          onRemove={index => canManageSettings && removeArrayValue('pipelineStages', index)}
          placeholder="اسم المرحلة"
          disabled={!canManageSettings}
        />

        <ArrayEditor
          title="حالات طلبات القبول"
          items={form.applicationStatuses}
          onAdd={() => canManageSettings && addArrayValue('applicationStatuses', '')}
          onChange={(index, value) => canManageSettings && updateArrayValue('applicationStatuses', index, value)}
          onRemove={index => canManageSettings && removeArrayValue('applicationStatuses', index)}
          placeholder="اسم الحالة"
          disabled={!canManageSettings}
        />

        <ArrayEditor
          title="أنواع المستندات الافتراضية"
          items={form.documentTypes}
          onAdd={() => canManageSettings && addArrayValue('documentTypes', createDocumentType())}
          onChange={(index, value) => canManageSettings && updateArrayValue('documentTypes', index, value)}
          onRemove={index => canManageSettings && removeArrayValue('documentTypes', index)}
          placeholder="نوع المستند"
          withRequired
          disabled={!canManageSettings}
        />

        <Card className="settings-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">المستندات والقبول</p>
              <h2>قوالب Checklist حسب الجامعة</h2>
            </div>
            <ListChecks />
          </div>

          <div className="notes-box">
            <strong>كيف تعمل القوالب الذكية؟</strong>
            <p>يمكنك تعريف قالب عام أو قالب أدق حسب الجامعة أو البرنامج أو الدولة. عند تطابق الطلب مع القالب، تُحتسب المتطلبات والتقدم والنواقص بناءً عليه تلقائيًا.</p>
          </div>

          <div className="templates-stack">
            {form.documentChecklistTemplates.map(template => (
              <article className="template-card" key={template.id}>
                <div className="template-card-head">
                  <div>
                    <h3>{template.name || 'قالب جديد'}</h3>
                    <span>{template.university || 'كل الجامعات'} · {template.program || 'كل البرامج'} · {template.country || 'كل الدول'}</span>
                  </div>
                  <button className="icon-btn small danger" disabled={!canManageChecklists} type="button" onClick={() => setForm(current => ({ ...current, documentChecklistTemplates: current.documentChecklistTemplates.filter(item => item.id !== template.id) }))}>
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="form-grid">
                  <Field label="اسم القالب"><input disabled={!canManageChecklists} value={template.name} onChange={event => updateChecklistTemplate(template.id, current => ({ ...current, name: event.target.value }))} /></Field>
                  <Field label="الجامعة"><input disabled={!canManageChecklists} value={template.university} onChange={event => updateChecklistTemplate(template.id, current => ({ ...current, university: event.target.value }))} /></Field>
                  <Field label="البرنامج"><input disabled={!canManageChecklists} value={template.program} onChange={event => updateChecklistTemplate(template.id, current => ({ ...current, program: event.target.value }))} /></Field>
                  <Field label="الدولة"><input disabled={!canManageChecklists} value={template.country} onChange={event => updateChecklistTemplate(template.id, current => ({ ...current, country: event.target.value }))} /></Field>
                </div>

                <div className="settings-list">
                  {template.documentTypes.map((item, index) => (
                    <div className="settings-row" key={`${template.id}-${index}`}>
                      <input
                        disabled={!canManageChecklists}
                        value={item.name}
                        onChange={event => updateChecklistTemplate(template.id, current => ({
                          ...current,
                          documentTypes: current.documentTypes.map((doc, itemIndex) => (itemIndex === index ? { ...doc, name: event.target.value } : doc))
                        }))}
                      />
                      <label className="required-toggle">
                        <input
                          disabled={!canManageChecklists}
                          type="checkbox"
                          checked={item.required}
                          onChange={event => updateChecklistTemplate(template.id, current => ({
                            ...current,
                            documentTypes: current.documentTypes.map((doc, itemIndex) => (itemIndex === index ? { ...doc, required: event.target.checked } : doc))
                          }))}
                        />
                        <span>إلزامي</span>
                      </label>
                      <button className="icon-btn small danger" disabled={!canManageChecklists} type="button" onClick={() => updateChecklistTemplate(template.id, current => ({ ...current, documentTypes: current.documentTypes.filter((_, itemIndex) => itemIndex !== index) }))}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                <Button disabled={!canManageChecklists} variant="secondary" type="button" onClick={() => updateChecklistTemplate(template.id, current => ({ ...current, documentTypes: [...current.documentTypes, createDocumentType()] }))}>
                  <Plus /> إضافة مستند للقالب
                </Button>
              </article>
            ))}
          </div>

          <Button disabled={!canManageChecklists} type="button" variant="secondary" onClick={() => setForm(current => ({ ...current, documentChecklistTemplates: [...current.documentChecklistTemplates, createChecklistTemplate()] }))}>
            <Building2 /> إضافة قالب Checklist
          </Button>
        </Card>

        <Card className="settings-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">المتابعة التشغيلية</p>
              <h2>قوالب مراحل المتابعة حسب الجامعة</h2>
            </div>
            <Clock3 />
          </div>

          <div className="notes-box">
            <strong>كيف تعمل مراحل المتابعة؟</strong>
            <p>كل قالب يحدد قائمة خطوات تشغيلية للطلب. أي مرحلة غير مكتملة تتحول تلقائيًا إلى مهمة متابعة في النظام حسب القسم والأولوية والموعد.</p>
          </div>

          <div className="templates-stack">
            {form.applicationWorkflowTemplates.map(template => (
              <article className="template-card" key={template.id}>
                <div className="template-card-head">
                  <div>
                    <h3>{template.name || 'قالب متابعة جديد'}</h3>
                    <span>{template.university || 'كل الجامعات'} · {template.program || 'كل البرامج'} · {template.country || 'كل الدول'}</span>
                  </div>
                  <button className="icon-btn small danger" disabled={!canManageWorkflows} type="button" onClick={() => setForm(current => ({ ...current, applicationWorkflowTemplates: current.applicationWorkflowTemplates.filter(item => item.id !== template.id) }))}>
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="form-grid">
                  <Field label="اسم القالب"><input disabled={!canManageWorkflows} value={template.name} onChange={event => updateWorkflowTemplate(template.id, current => ({ ...current, name: event.target.value }))} /></Field>
                  <Field label="الجامعة"><input disabled={!canManageWorkflows} value={template.university} onChange={event => updateWorkflowTemplate(template.id, current => ({ ...current, university: event.target.value }))} /></Field>
                  <Field label="البرنامج"><input disabled={!canManageWorkflows} value={template.program} onChange={event => updateWorkflowTemplate(template.id, current => ({ ...current, program: event.target.value }))} /></Field>
                  <Field label="الدولة"><input disabled={!canManageWorkflows} value={template.country} onChange={event => updateWorkflowTemplate(template.id, current => ({ ...current, country: event.target.value }))} /></Field>
                </div>

                <div className="templates-stack">
                  {template.stages.map(stage => (
                    <article className="template-card" key={stage.id}>
                      <div className="form-grid">
                        <Field label="اسم المرحلة"><input disabled={!canManageWorkflows} value={stage.title} onChange={event => updateWorkflowTemplate(template.id, current => ({ ...current, stages: current.stages.map(item => (item.id === stage.id ? { ...item, title: event.target.value } : item)) }))} /></Field>
                        <Field label="القسم المسؤول">
                          <select disabled={!canManageWorkflows} value={stage.assignedRole} onChange={event => updateWorkflowTemplate(template.id, current => ({ ...current, stages: current.stages.map(item => (item.id === stage.id ? { ...item, assignedRole: event.target.value } : item)) }))}>
                            <option value="admissions">القبول</option>
                            <option value="consultant">الاستشاري</option>
                            <option value="management">الإدارة</option>
                            <option value="finance">المالية</option>
                            <option value="reception">الاستقبال</option>
                          </select>
                        </Field>
                        <Field label="الأولوية">
                          <select disabled={!canManageWorkflows} value={stage.priority} onChange={event => updateWorkflowTemplate(template.id, current => ({ ...current, stages: current.stages.map(item => (item.id === stage.id ? { ...item, priority: event.target.value } : item)) }))}>
                            <option value="Low">منخفضة</option>
                            <option value="Medium">متوسطة</option>
                            <option value="High">مرتفعة</option>
                          </select>
                        </Field>
                        <Field label="بعد كم يوم">
                          <input disabled={!canManageWorkflows} type="number" value={stage.dueOffsetDays} onChange={event => updateWorkflowTemplate(template.id, current => ({ ...current, stages: current.stages.map(item => (item.id === stage.id ? { ...item, dueOffsetDays: Number(event.target.value || 0) } : item)) }))} />
                        </Field>
                        <Field label="الوصف" className="field-full">
                          <textarea disabled={!canManageWorkflows} value={stage.description} onChange={event => updateWorkflowTemplate(template.id, current => ({ ...current, stages: current.stages.map(item => (item.id === stage.id ? { ...item, description: event.target.value } : item)) }))} />
                        </Field>
                      </div>
                      <div className="task-actions">
                        <Button disabled={!canManageWorkflows} variant="ghost" type="button" onClick={() => updateWorkflowTemplate(template.id, current => ({ ...current, stages: current.stages.filter(item => item.id !== stage.id) }))}>
                          <Trash2 /> حذف المرحلة
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>

                <Button disabled={!canManageWorkflows} variant="secondary" type="button" onClick={() => updateWorkflowTemplate(template.id, current => ({ ...current, stages: [...current.stages, createWorkflowStage()] }))}>
                  <Plus /> إضافة مرحلة متابعة
                </Button>
              </article>
            ))}
          </div>

          <Button disabled={!canManageWorkflows} type="button" variant="secondary" onClick={() => setForm(current => ({ ...current, applicationWorkflowTemplates: [...current.applicationWorkflowTemplates, createWorkflowTemplate()] }))}>
            <Clock3 /> إضافة قالب متابعة
          </Button>
        </Card>

        {canManageUsers && (
          <Card className="settings-card">
            <div className="section-head">
              <div>
                <p className="eyebrow">إدارة المستخدمين</p>
                <h2>الحسابات والصلاحيات</h2>
              </div>
              <div className="settings-users-head">
                <Badge tone="purple">{form.users.length} مستخدم</Badge>
                <Button
                  type="button"
                  onClick={() => {
                    setUserForm(blankUser);
                    setCreateOpen(true);
                  }}
                ><Plus /> أدمن جديد</Button>
              </div>
            </div>

            <div className="notes-box">
              <strong>مصدر موحّد للفريق</strong>
              <p>أي حساب غير أدمن مرتبط تلقائيًا بسجل الموارد البشرية، لذلك أي تعديل للاسم أو القسم أو حالة التفعيل هنا ينعكس مباشرة في شاشة HR.</p>
            </div>

            <div className="settings-user-sections">
              <div className="settings-user-group">
                <div className="settings-user-group-head">
                  <div>
                    <strong>حسابات الإدارة والنظام</strong>
                    <span>هذه الحسابات لا تظهر داخل الموارد البشرية.</span>
                  </div>
                  <Badge tone="purple">{adminUsers.length}</Badge>
                </div>

                <div className="users-grid">
                  {adminUsers.map(item => (
                    <article className="user-card" key={item.id}>
                      <div className="user-card-top">
                        <div className="avatar soft">{item.avatar || item.name?.slice(0, 2)}</div>
                        <Badge tone={item.isActive === false ? 'red' : 'green'}>{item.isActive === false ? 'موقوف' : 'نشط'}</Badge>
                      </div>
                      <h3>{item.name}</h3>
                      <p>{item.email}</p>
                      <div className="user-badges">
                        <Badge tone="purple">{tr(item.role)}</Badge>
                        <Badge tone="neutral">{tr(item.department)}</Badge>
                      </div>
                      <div className="user-permissions">
                        <div><ShieldCheck size={16} /><span>صلاحيات كاملة على النظام</span></div>
                        <div><UserCog size={16} /><span>{item.isActive === false ? 'تسجيل الدخول معطل' : 'يمكنه الدخول للنظام'}</span></div>
                      </div>
                      <div className="task-actions">
                        <Button variant="ghost" type="button" onClick={() => startEditUser(item)}>تعديل المستخدم</Button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <div className="settings-user-group">
                <div className="settings-user-group-head">
                  <div>
                    <strong>حسابات الفريق المرتبطة بالموارد البشرية</strong>
                    <span>تم تبسيط عرضها هنا لتجنب تكرار نفس بطاقات الفريق بين الإعدادات وHR. إضافة أعضاء الفريق تتم من HR فقط.</span>
                  </div>
                  <Badge tone="blue">{teamUsers.length}</Badge>
                </div>

                <div className="users-grid users-grid-linked">
                  {teamUsers.map(item => (
                    <article className="user-card linked-user-card" key={item.id}>
                      <div className="user-card-top">
                        <div className="avatar soft">{item.avatar || item.name?.slice(0, 2)}</div>
                        <Badge tone={item.isActive === false ? 'red' : 'green'}>{item.isActive === false ? 'موقوف' : 'نشط'}</Badge>
                      </div>
                      <h3>{item.name}</h3>
                      <p>{item.email}</p>
                      <div className="user-badges">
                        <Badge tone="purple">{tr(item.role)}</Badge>
                        <Badge tone="neutral">{tr(item.department)}</Badge>
                        <Badge tone="blue">مرتبط بـ HR</Badge>
                      </div>
                      <div className="user-permissions compact">
                        <div><UserCog size={16} /><span>{item.isActive === false ? 'الحساب وسجل HR متوقفان' : 'الحساب وسجل HR نشطان'}</span></div>
                      </div>
                      <div className="task-actions">
                        <Button variant="ghost" type="button" onClick={() => startEditUser(item)}>تعديل الحساب</Button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        )}

        {canManageSettings && (
          <div className="settings-actions">
            <Button type="submit"><Save /> {saving ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}</Button>
          </div>
        )}
      </form>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="إضافة أدمن جديد" subtitle="إنشاء حساب إداري داخلي للنظام" size="lg">
        <form className="form-grid" onSubmit={createUser}>
          <Field label="الاسم"><input required value={userForm.name} onChange={event => setUserForm({ ...userForm, name: event.target.value })} /></Field>
          <Field label="البريد الإلكتروني"><input required type="email" value={userForm.email} onChange={event => setUserForm({ ...userForm, email: event.target.value })} /></Field>
          <Field label="الدور">
            <select value="admin" disabled>
              <option value="admin">مسؤول النظام</option>
            </select>
          </Field>
          <Field label="القسم">
            <select value={userForm.department} onChange={event => setUserForm({ ...userForm, department: event.target.value })}>
              {departments.map(department => <option key={department} value={department}>{tr(department)}</option>)}
            </select>
          </Field>
          <Field label="كلمة المرور" className="field-full"><input required minLength="6" type="password" value={userForm.password} onChange={event => setUserForm({ ...userForm, password: event.target.value })} /></Field>
          <label className="required-toggle field-full">
            <input type="checkbox" checked={userForm.isActive} onChange={event => setUserForm({ ...userForm, isActive: event.target.checked })} />
            <span>الحساب مفعل ويمكنه تسجيل الدخول</span>
          </label>
          <div className="form-actions field-full">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>إلغاء</Button>
            <Button type="submit">إنشاء الأدمن</Button>
          </div>
        </form>
      </Modal>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="تعديل المستخدم" subtitle={selectedUser ? `تحديث حساب ${selectedUser.name}` : ''} size="lg">
        <form className="form-grid" onSubmit={updateUser}>
          <Field label="الاسم"><input required value={userForm.name} onChange={event => setUserForm({ ...userForm, name: event.target.value })} /></Field>
          <Field label="البريد الإلكتروني"><input required type="email" value={userForm.email} onChange={event => setUserForm({ ...userForm, email: event.target.value })} /></Field>
          <Field label="الدور">
            <select value={userForm.role} onChange={event => setUserForm({ ...userForm, role: event.target.value })}>
              <option value="admin">مسؤول النظام</option>
              <option value="management">الإدارة</option>
              <option value="consultant">مستشار</option>
              <option value="admissions">القبول</option>
              <option value="reception">الاستقبال</option>
              <option value="hr">الموارد البشرية</option>
              <option value="finance">المالية</option>
            </select>
          </Field>
          <Field label="القسم">
            <select value={userForm.department} onChange={event => setUserForm({ ...userForm, department: event.target.value })}>
              {departments.map(department => <option key={department} value={department}>{tr(department)}</option>)}
            </select>
          </Field>
          <Field label="كلمة مرور جديدة" className="field-full" hint="اتركها فارغة إذا لم ترد تغيير كلمة المرور">
            <input type="password" value={userForm.password} onChange={event => setUserForm({ ...userForm, password: event.target.value })} />
          </Field>
          <label className="required-toggle field-full">
            <input type="checkbox" checked={userForm.isActive} onChange={event => setUserForm({ ...userForm, isActive: event.target.checked })} />
            <span>الحساب مفعل ويمكنه تسجيل الدخول</span>
          </label>
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
