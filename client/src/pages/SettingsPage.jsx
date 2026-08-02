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
          <p className="eyebrow">Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„Ù†Ø¸Ø§Ù…</p>
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
                <span>Ø¥Ù„Ø²Ø§Ù…ÙŠ</span>
              </label>
            )}
            <button className="icon-btn small danger" disabled={disabled} type="button" onClick={() => onRemove(index)}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <Button disabled={disabled} variant="secondary" type="button" onClick={onAdd}>
        <Plus /> Ø¥Ø¶Ø§ÙØ© Ø¹Ù†ØµØ±
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
  const [catalogLinks, setCatalogLinks] = useState({});
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
        setCatalogLinks(settings.catalogLinks || {});
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

  const countryOptions = useMemo(() => catalogLinks.countries || [], [catalogLinks.countries]);
  const universityOptions = useMemo(() => catalogLinks.universities || [], [catalogLinks.universities]);
  const programOptions = useMemo(() => catalogLinks.programs || [], [catalogLinks.programs]);

  const getUniversityOptions = templateCountry => {
    if (templateCountry && Array.isArray(catalogLinks.universitiesByCountry?.[templateCountry])) {
      return catalogLinks.universitiesByCountry[templateCountry];
    }
    return universityOptions;
  };

  const getProgramOptions = (templateCountry, templateUniversity) => {
    if (templateUniversity && Array.isArray(catalogLinks.programsByUniversity?.[templateUniversity])) {
      return catalogLinks.programsByUniversity[templateUniversity];
    }
    if (templateCountry && Array.isArray(catalogLinks.programsByCountry?.[templateCountry])) {
      return catalogLinks.programsByCountry[templateCountry];
    }
    return programOptions;
  };

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
      setToast({ message: 'ØªÙ… Ø­ÙØ¸ Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø¨Ù†Ø¬Ø§Ø­' });
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
    if (!window.confirm('Ù‡Ù„ ØªØ±ÙŠØ¯ ÙØµÙ„ ØªÙƒØ§Ù…Ù„ Meta Ø¨Ø§Ù„ÙƒØ§Ù…Ù„ØŸ')) return;
    try {
      await api('/api/integrations/meta/disconnect', { method: 'DELETE' });
      setMetaSession(null);
      setSelectedAssetIds([]);
      await load();
      setToast({ message: 'ØªÙ… ÙØµÙ„ ØªÙƒØ§Ù…Ù„ Meta' });
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
      setToast({ message: 'ØªÙ… Ø±Ø¨Ø· Ø£ØµÙˆÙ„ Meta Ø§Ù„Ù…Ø­Ø¯Ø¯Ø© Ø¨Ù†Ø¬Ø§Ø­' });
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
      setToast({ message: 'ØªÙ…Øª Ø¥Ø¶Ø§ÙØ© Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ø¨Ù†Ø¬Ø§Ø­' });
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
      setToast({ message: 'ØªÙ… ØªØ­Ø¯ÙŠØ« Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  if (loading) return <div className="loading-page"><Spinner />Ø¬Ø§Ø±Ù ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª...</div>;

  return (
    <>
      <form className="settings-layout" onSubmit={submit}>
        <Card className="settings-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„Ø¹Ø§Ù…Ø©</p>
              <h2>Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø´Ø±ÙƒØ©</h2>
            </div>
            <Settings2 />
          </div>

          <div className="form-grid">
            <Field label="Ø§Ø³Ù… Ø§Ù„Ø´Ø±ÙƒØ©"><input disabled={!canManageSettings} value={form.companyName} onChange={event => setForm({ ...form, companyName: event.target.value })} /></Field>
            <Field label="Ø§Ø³Ù… Ù…Ø³Ø§Ø­Ø© Ø§Ù„Ø¹Ù…Ù„"><input disabled={!canManageSettings} value={form.workspace} onChange={event => setForm({ ...form, workspace: event.target.value })} /></Field>
            <Field label="Ø§Ù„Ø¹Ù…Ù„Ø©">
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
              <div><strong>{metaStatus.configured ? 'Ø¬Ø§Ù‡Ø²' : 'ØºÙŠØ± Ù…Ù‡ÙŠØ£'}</strong><span>Ø­Ø§Ù„Ø© Ø¥Ø¹Ø¯Ø§Ø¯ Ø§Ù„ØªØ·Ø¨ÙŠÙ‚</span></div>
            </div>
            <div className="summary-tile">
              <div><strong>{metaStatus.integration?.status || 'disconnected'}</strong><span>Ø­Ø§Ù„Ø© Ø§Ù„Ø±Ø¨Ø·</span></div>
            </div>
            <div className="summary-tile warning">
              <div><strong>{metaStatus.channels?.filter(item => item.channelType === 'whatsapp').length || 0}</strong><span>Ù‚Ù†ÙˆØ§Øª ÙˆØ§ØªØ³Ø§Ø¨</span></div>
            </div>
            <div className="summary-tile soft">
              <div><strong>{metaStatus.channels?.length || 0}</strong><span>Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ù‚Ù†ÙˆØ§Øª</span></div>
            </div>
          </div>

          <div className="notes-box">
            <strong>Ø§Ù„ØªØ¯ÙÙ‚ Ø§Ù„Ø­Ø§Ù„ÙŠ</strong>
            <p>Ø§Ø¨Ø¯Ø£ Ø§Ù„Ø±Ø¨Ø· Ø§Ù„Ø±Ø³Ù…ÙŠ Ø¹Ø¨Ø± Meta OAuthØŒ Ø«Ù… Ø§Ø®ØªØ± ØµÙØ­Ø§Øª ÙÙŠØ³Ø¨ÙˆÙƒ ÙˆØ­Ø³Ø§Ø¨Ø§Øª Ø¥Ù†Ø³ØªØºØ±Ø§Ù… ÙˆØ£Ø±Ù‚Ø§Ù… ÙˆØ§ØªØ³Ø§Ø¨ Ø§Ù„ØªÙŠ ØªØ±ÙŠØ¯ Ø±Ø¨Ø·Ù‡Ø§ Ø¨Ø§Ù„Ø´Ø±ÙƒØ© Ø§Ù„Ø­Ø§Ù„ÙŠØ© ÙÙ‚Ø·.</p>
          </div>

          <div className="form-actions">
            <Button type="button" onClick={startMetaConnect}>Ø¨Ø¯Ø¡ Ø§Ù„Ø±Ø¨Ø· Ø§Ù„Ø±Ø³Ù…ÙŠ</Button>
            {!!metaStatus.integration && <Button type="button" variant="secondary" onClick={reconnectMeta}>Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„Ø±Ø¨Ø·</Button>}
            {!!metaStatus.integration && <Button type="button" variant="ghost" onClick={disconnectMeta}>ÙØµÙ„ Ø§Ù„ØªÙƒØ§Ù…Ù„</Button>}
          </div>

          {!!metaStatus.channels?.length && (
            <div className="templates-stack">
              {metaStatus.channels.map(channel => (
                <article className="template-card" key={channel.id}>
                  <div className="template-card-head">
                    <div>
                      <h3>{channel.channelType}</h3>
                      <span>{channel.pageName || channel.instagramUsername || channel.displayPhoneNumber || 'Ù‚Ù†Ø§Ø© Meta'}</span>
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
                    <h3>Ø£ØµÙˆÙ„ Meta Ø§Ù„Ù…ÙƒØªØ´ÙØ©</h3>
                    <span>Ø§Ø®ØªØ± Ø§Ù„Ø£ØµÙˆÙ„ Ø§Ù„ØªÙŠ ØªØ±ÙŠØ¯ Ø±Ø¨Ø·Ù‡Ø§ Ø¨Ù‡Ø°Ù‡ Ø§Ù„Ø´Ø±ÙƒØ© Ù‚Ø¨Ù„ Ø§Ù†ØªÙ‡Ø§Ø¡ Ø§Ù„Ø¬Ù„Ø³Ø©.</span>
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
                        <strong>{asset.channelType} Â· {asset.pageName || asset.instagramUsername || asset.displayPhoneNumber || asset.verifiedName || 'Meta Asset'}</strong>
                        <small>{asset.pageId || asset.instagramAccountId || asset.phoneNumberId}</small>
                      </div>
                    </label>
                  ))}
                </div>

                <div className="form-actions">
                  <Button type="button" onClick={connectSelectedAssets}>Ø±Ø¨Ø· Ø§Ù„Ø£ØµÙˆÙ„ Ø§Ù„Ù…Ø­Ø¯Ø¯Ø©</Button>
                </div>
              </article>
            </div>
          )}
        </Card>

        <ArrayEditor
          title="Ù…Ø±Ø§Ø­Ù„ Ù…Ø³Ø§Ø± Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡"
          items={form.pipelineStages}
          onAdd={() => canManageSettings && addArrayValue('pipelineStages', '')}
          onChange={(index, value) => canManageSettings && updateArrayValue('pipelineStages', index, value)}
          onRemove={index => canManageSettings && removeArrayValue('pipelineStages', index)}
          placeholder="Ø§Ø³Ù… Ø§Ù„Ù…Ø±Ø­Ù„Ø©"
          disabled={!canManageSettings}
        />

        <ArrayEditor
          title="Ø­Ø§Ù„Ø§Øª Ø·Ù„Ø¨Ø§Øª Ø§Ù„Ù‚Ø¨ÙˆÙ„"
          items={form.applicationStatuses}
          onAdd={() => canManageSettings && addArrayValue('applicationStatuses', '')}
          onChange={(index, value) => canManageSettings && updateArrayValue('applicationStatuses', index, value)}
          onRemove={index => canManageSettings && removeArrayValue('applicationStatuses', index)}
          placeholder="Ø§Ø³Ù… Ø§Ù„Ø­Ø§Ù„Ø©"
          disabled={!canManageSettings}
        />

        <ArrayEditor
          title="Ø£Ù†ÙˆØ§Ø¹ Ø§Ù„Ù…Ø³ØªÙ†Ø¯Ø§Øª Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠØ©"
          items={form.documentTypes}
          onAdd={() => canManageSettings && addArrayValue('documentTypes', createDocumentType())}
          onChange={(index, value) => canManageSettings && updateArrayValue('documentTypes', index, value)}
          onRemove={index => canManageSettings && removeArrayValue('documentTypes', index)}
          placeholder="Ù†ÙˆØ¹ Ø§Ù„Ù…Ø³ØªÙ†Ø¯"
          withRequired
          disabled={!canManageSettings}
        />

        <Card className="settings-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">Ø§Ù„Ù…Ø³ØªÙ†Ø¯Ø§Øª ÙˆØ§Ù„Ù‚Ø¨ÙˆÙ„</p>
              <h2>Ù‚ÙˆØ§Ù„Ø¨ Checklist Ø­Ø³Ø¨ Ø§Ù„Ø¬Ø§Ù…Ø¹Ø©</h2>
            </div>
            <ListChecks />
          </div>

          <div className="notes-box">
            <strong>ÙƒÙŠÙ ØªØ¹Ù…Ù„ Ø§Ù„Ù‚ÙˆØ§Ù„Ø¨ Ø§Ù„Ø°ÙƒÙŠØ©ØŸ</strong>
            <p>ÙŠÙ…ÙƒÙ†Ùƒ ØªØ¹Ø±ÙŠÙ Ù‚Ø§Ù„Ø¨ Ø¹Ø§Ù… Ø£Ùˆ Ù‚Ø§Ù„Ø¨ Ø£Ø¯Ù‚ Ø­Ø³Ø¨ Ø§Ù„Ø¬Ø§Ù…Ø¹Ø© Ø£Ùˆ Ø§Ù„Ø¨Ø±Ù†Ø§Ù…Ø¬ Ø£Ùˆ Ø§Ù„Ø¯ÙˆÙ„Ø©. Ø¹Ù†Ø¯ ØªØ·Ø§Ø¨Ù‚ Ø§Ù„Ø·Ù„Ø¨ Ù…Ø¹ Ø§Ù„Ù‚Ø§Ù„Ø¨ØŒ ØªÙØ­ØªØ³Ø¨ Ø§Ù„Ù…ØªØ·Ù„Ø¨Ø§Øª ÙˆØ§Ù„ØªÙ‚Ø¯Ù… ÙˆØ§Ù„Ù†ÙˆØ§Ù‚Øµ Ø¨Ù†Ø§Ø¡Ù‹ Ø¹Ù„ÙŠÙ‡ ØªÙ„Ù‚Ø§Ø¦ÙŠÙ‹Ø§.</p>
          </div>

          <div className="templates-stack">
            {form.documentChecklistTemplates.map(template => (
              <article className="template-card" key={template.id}>
                <div className="template-card-head">
                  <div>
                    <h3>{template.name || 'Ù‚Ø§Ù„Ø¨ Ø¬Ø¯ÙŠØ¯'}</h3>
                    <span>{template.university || 'ÙƒÙ„ Ø§Ù„Ø¬Ø§Ù…Ø¹Ø§Øª'} Â· {template.program || 'ÙƒÙ„ Ø§Ù„Ø¨Ø±Ø§Ù…Ø¬'} Â· {template.country || 'ÙƒÙ„ Ø§Ù„Ø¯ÙˆÙ„'}</span>
                  </div>
                  <button className="icon-btn small danger" disabled={!canManageChecklists} type="button" onClick={() => setForm(current => ({ ...current, documentChecklistTemplates: current.documentChecklistTemplates.filter(item => item.id !== template.id) }))}>
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="form-grid">
                  <Field label="Ø§Ø³Ù… Ø§Ù„Ù‚Ø§Ù„Ø¨"><input disabled={!canManageChecklists} value={template.name} onChange={event => updateChecklistTemplate(template.id, current => ({ ...current, name: event.target.value }))} /></Field>
                  <Field label="Ø§Ù„Ø¯ÙˆÙ„Ø©">
                    <select
                      disabled={!canManageChecklists}
                      value={template.country}
                      onChange={event => updateChecklistTemplate(template.id, current => ({ ...current, country: event.target.value, university: '', program: '' }))}
                    >
                      <option value="">ÙƒÙ„ Ø§Ù„Ø¯ÙˆÙ„</option>
                      {countryOptions.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </Field>
                  <Field label="Ø§Ù„Ø¬Ø§Ù…Ø¹Ø©">
                    <select
                      disabled={!canManageChecklists}
                      value={template.university}
                      onChange={event => updateChecklistTemplate(template.id, current => ({
                        ...current,
                        university: event.target.value,
                        country: catalogLinks.countryByUniversity?.[event.target.value] || current.country,
                        program: ''
                      }))}
                    >
                      <option value="">ÙƒÙ„ Ø§Ù„Ø¬Ø§Ù…Ø¹Ø§Øª</option>
                      {getUniversityOptions(template.country).map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </Field>
                  <Field label="Ø§Ù„Ø¨Ø±Ù†Ø§Ù…Ø¬">
                    <select
                      disabled={!canManageChecklists}
                      value={template.program}
                      onChange={event => updateChecklistTemplate(template.id, current => ({ ...current, program: event.target.value }))}
                    >
                      <option value="">ÙƒÙ„ Ø§Ù„Ø¨Ø±Ø§Ù…Ø¬</option>
                      {getProgramOptions(template.country, template.university).map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </Field>
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
                        <span>Ø¥Ù„Ø²Ø§Ù…ÙŠ</span>
                      </label>
                      <button className="icon-btn small danger" disabled={!canManageChecklists} type="button" onClick={() => updateChecklistTemplate(template.id, current => ({ ...current, documentTypes: current.documentTypes.filter((_, itemIndex) => itemIndex !== index) }))}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                <Button disabled={!canManageChecklists} variant="secondary" type="button" onClick={() => updateChecklistTemplate(template.id, current => ({ ...current, documentTypes: [...current.documentTypes, createDocumentType()] }))}>
                  <Plus /> Ø¥Ø¶Ø§ÙØ© Ù…Ø³ØªÙ†Ø¯ Ù„Ù„Ù‚Ø§Ù„Ø¨
                </Button>
              </article>
            ))}
          </div>

          <Button disabled={!canManageChecklists} type="button" variant="secondary" onClick={() => setForm(current => ({ ...current, documentChecklistTemplates: [...current.documentChecklistTemplates, createChecklistTemplate()] }))}>
            <Building2 /> Ø¥Ø¶Ø§ÙØ© Ù‚Ø§Ù„Ø¨ Checklist
          </Button>
        </Card>

        <Card className="settings-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">Ø§Ù„Ù…ØªØ§Ø¨Ø¹Ø© Ø§Ù„ØªØ´ØºÙŠÙ„ÙŠØ©</p>
              <h2>Ù‚ÙˆØ§Ù„Ø¨ Ù…Ø±Ø§Ø­Ù„ Ø§Ù„Ù…ØªØ§Ø¨Ø¹Ø© Ø­Ø³Ø¨ Ø§Ù„Ø¬Ø§Ù…Ø¹Ø©</h2>
            </div>
            <Clock3 />
          </div>

          <div className="notes-box">
            <strong>ÙƒÙŠÙ ØªØ¹Ù…Ù„ Ù…Ø±Ø§Ø­Ù„ Ø§Ù„Ù…ØªØ§Ø¨Ø¹Ø©ØŸ</strong>
            <p>ÙƒÙ„ Ù‚Ø§Ù„Ø¨ ÙŠØ­Ø¯Ø¯ Ù‚Ø§Ø¦Ù…Ø© Ø®Ø·ÙˆØ§Øª ØªØ´ØºÙŠÙ„ÙŠØ© Ù„Ù„Ø·Ù„Ø¨. Ø£ÙŠ Ù…Ø±Ø­Ù„Ø© ØºÙŠØ± Ù…ÙƒØªÙ…Ù„Ø© ØªØªØ­ÙˆÙ„ ØªÙ„Ù‚Ø§Ø¦ÙŠÙ‹Ø§ Ø¥Ù„Ù‰ Ù…Ù‡Ù…Ø© Ù…ØªØ§Ø¨Ø¹Ø© ÙÙŠ Ø§Ù„Ù†Ø¸Ø§Ù… Ø­Ø³Ø¨ Ø§Ù„Ù‚Ø³Ù… ÙˆØ§Ù„Ø£ÙˆÙ„ÙˆÙŠØ© ÙˆØ§Ù„Ù…ÙˆØ¹Ø¯.</p>
          </div>

          <div className="templates-stack">
            {form.applicationWorkflowTemplates.map(template => (
              <article className="template-card" key={template.id}>
                <div className="template-card-head">
                  <div>
                    <h3>{template.name || 'Ù‚Ø§Ù„Ø¨ Ù…ØªØ§Ø¨Ø¹Ø© Ø¬Ø¯ÙŠØ¯'}</h3>
                    <span>{template.university || 'ÙƒÙ„ Ø§Ù„Ø¬Ø§Ù…Ø¹Ø§Øª'} Â· {template.program || 'ÙƒÙ„ Ø§Ù„Ø¨Ø±Ø§Ù…Ø¬'} Â· {template.country || 'ÙƒÙ„ Ø§Ù„Ø¯ÙˆÙ„'}</span>
                  </div>
                  <button className="icon-btn small danger" disabled={!canManageWorkflows} type="button" onClick={() => setForm(current => ({ ...current, applicationWorkflowTemplates: current.applicationWorkflowTemplates.filter(item => item.id !== template.id) }))}>
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="form-grid">
                  <Field label="Ø§Ø³Ù… Ø§Ù„Ù‚Ø§Ù„Ø¨"><input disabled={!canManageWorkflows} value={template.name} onChange={event => updateWorkflowTemplate(template.id, current => ({ ...current, name: event.target.value }))} /></Field>
                  <Field label="Ø§Ù„Ø¯ÙˆÙ„Ø©">
                    <select
                      disabled={!canManageWorkflows}
                      value={template.country}
                      onChange={event => updateWorkflowTemplate(template.id, current => ({ ...current, country: event.target.value, university: '', program: '' }))}
                    >
                      <option value="">ÙƒÙ„ Ø§Ù„Ø¯ÙˆÙ„</option>
                      {countryOptions.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </Field>
                  <Field label="Ø§Ù„Ø¬Ø§Ù…Ø¹Ø©">
                    <select
                      disabled={!canManageWorkflows}
                      value={template.university}
                      onChange={event => updateWorkflowTemplate(template.id, current => ({
                        ...current,
                        university: event.target.value,
                        country: catalogLinks.countryByUniversity?.[event.target.value] || current.country,
                        program: ''
                      }))}
                    >
                      <option value="">ÙƒÙ„ Ø§Ù„Ø¬Ø§Ù…Ø¹Ø§Øª</option>
                      {getUniversityOptions(template.country).map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </Field>
                  <Field label="Ø§Ù„Ø¨Ø±Ù†Ø§Ù…Ø¬">
                    <select
                      disabled={!canManageWorkflows}
                      value={template.program}
                      onChange={event => updateWorkflowTemplate(template.id, current => ({ ...current, program: event.target.value }))}
                    >
                      <option value="">ÙƒÙ„ Ø§Ù„Ø¨Ø±Ø§Ù…Ø¬</option>
                      {getProgramOptions(template.country, template.university).map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </Field>
                </div>

                <div className="templates-stack">
                  {template.stages.map(stage => (
                    <article className="template-card" key={stage.id}>
                      <div className="form-grid">
                        <Field label="Ø§Ø³Ù… Ø§Ù„Ù…Ø±Ø­Ù„Ø©"><input disabled={!canManageWorkflows} value={stage.title} onChange={event => updateWorkflowTemplate(template.id, current => ({ ...current, stages: current.stages.map(item => (item.id === stage.id ? { ...item, title: event.target.value } : item)) }))} /></Field>
                        <Field label="Ø§Ù„Ù‚Ø³Ù… Ø§Ù„Ù…Ø³Ø¤ÙˆÙ„">
                          <select disabled={!canManageWorkflows} value={stage.assignedRole} onChange={event => updateWorkflowTemplate(template.id, current => ({ ...current, stages: current.stages.map(item => (item.id === stage.id ? { ...item, assignedRole: event.target.value } : item)) }))}>
                            <option value="admissions">Ø§Ù„Ù‚Ø¨ÙˆÙ„</option>
                            <option value="consultant">Ø§Ù„Ø§Ø³ØªØ´Ø§Ø±ÙŠ</option>
                            <option value="management">Ø§Ù„Ø¥Ø¯Ø§Ø±Ø©</option>
                            <option value="finance">Ø§Ù„Ù…Ø§Ù„ÙŠØ©</option>
                            <option value="reception">Ø§Ù„Ø§Ø³ØªÙ‚Ø¨Ø§Ù„</option>
                          </select>
                        </Field>
                        <Field label="Ø§Ù„Ø£ÙˆÙ„ÙˆÙŠØ©">
                          <select disabled={!canManageWorkflows} value={stage.priority} onChange={event => updateWorkflowTemplate(template.id, current => ({ ...current, stages: current.stages.map(item => (item.id === stage.id ? { ...item, priority: event.target.value } : item)) }))}>
                            <option value="Low">Ù…Ù†Ø®ÙØ¶Ø©</option>
                            <option value="Medium">Ù…ØªÙˆØ³Ø·Ø©</option>
                            <option value="High">Ù…Ø±ØªÙØ¹Ø©</option>
                          </select>
                        </Field>
                        <Field label="Ø¨Ø¹Ø¯ ÙƒÙ… ÙŠÙˆÙ…">
                          <input disabled={!canManageWorkflows} type="number" value={stage.dueOffsetDays} onChange={event => updateWorkflowTemplate(template.id, current => ({ ...current, stages: current.stages.map(item => (item.id === stage.id ? { ...item, dueOffsetDays: Number(event.target.value || 0) } : item)) }))} />
                        </Field>
                        <Field label="Ø§Ù„ÙˆØµÙ" className="field-full">
                          <textarea disabled={!canManageWorkflows} value={stage.description} onChange={event => updateWorkflowTemplate(template.id, current => ({ ...current, stages: current.stages.map(item => (item.id === stage.id ? { ...item, description: event.target.value } : item)) }))} />
                        </Field>
                      </div>
                      <div className="task-actions">
                        <Button disabled={!canManageWorkflows} variant="ghost" type="button" onClick={() => updateWorkflowTemplate(template.id, current => ({ ...current, stages: current.stages.filter(item => item.id !== stage.id) }))}>
                          <Trash2 /> Ø­Ø°Ù Ø§Ù„Ù…Ø±Ø­Ù„Ø©
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>

                <Button disabled={!canManageWorkflows} variant="secondary" type="button" onClick={() => updateWorkflowTemplate(template.id, current => ({ ...current, stages: [...current.stages, createWorkflowStage()] }))}>
                  <Plus /> Ø¥Ø¶Ø§ÙØ© Ù…Ø±Ø­Ù„Ø© Ù…ØªØ§Ø¨Ø¹Ø©
                </Button>
              </article>
            ))}
          </div>

          <Button disabled={!canManageWorkflows} type="button" variant="secondary" onClick={() => setForm(current => ({ ...current, applicationWorkflowTemplates: [...current.applicationWorkflowTemplates, createWorkflowTemplate()] }))}>
            <Clock3 /> Ø¥Ø¶Ø§ÙØ© Ù‚Ø§Ù„Ø¨ Ù…ØªØ§Ø¨Ø¹Ø©
          </Button>
        </Card>

        {canManageUsers && (
          <Card className="settings-card">
            <div className="section-head">
              <div>
                <p className="eyebrow">Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…ÙŠÙ†</p>
                <h2>Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª ÙˆØ§Ù„ØµÙ„Ø§Ø­ÙŠØ§Øª</h2>
              </div>
              <div className="settings-users-head">
                <Badge tone="purple">{form.users.length} Ù…Ø³ØªØ®Ø¯Ù…</Badge>
                <Button
                  type="button"
                  onClick={() => {
                    setUserForm(blankUser);
                    setCreateOpen(true);
                  }}
                ><Plus /> Ø£Ø¯Ù…Ù† Ø¬Ø¯ÙŠØ¯</Button>
              </div>
            </div>

            <div className="notes-box">
              <strong>Ù…ØµØ¯Ø± Ù…ÙˆØ­Ù‘Ø¯ Ù„Ù„ÙØ±ÙŠÙ‚</strong>
              <p>Ø£ÙŠ Ø­Ø³Ø§Ø¨ ØºÙŠØ± Ø£Ø¯Ù…Ù† Ù…Ø±ØªØ¨Ø· ØªÙ„Ù‚Ø§Ø¦ÙŠÙ‹Ø§ Ø¨Ø³Ø¬Ù„ Ø§Ù„Ù…ÙˆØ§Ø±Ø¯ Ø§Ù„Ø¨Ø´Ø±ÙŠØ©ØŒ Ù„Ø°Ù„Ùƒ Ø£ÙŠ ØªØ¹Ø¯ÙŠÙ„ Ù„Ù„Ø§Ø³Ù… Ø£Ùˆ Ø§Ù„Ù‚Ø³Ù… Ø£Ùˆ Ø­Ø§Ù„Ø© Ø§Ù„ØªÙØ¹ÙŠÙ„ Ù‡Ù†Ø§ ÙŠÙ†Ø¹ÙƒØ³ Ù…Ø¨Ø§Ø´Ø±Ø© ÙÙŠ Ø´Ø§Ø´Ø© HR.</p>
            </div>

            <div className="settings-user-sections">
              <div className="settings-user-group">
                <div className="settings-user-group-head">
                  <div>
                    <strong>Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ø¥Ø¯Ø§Ø±Ø© ÙˆØ§Ù„Ù†Ø¸Ø§Ù…</strong>
                    <span>Ù‡Ø°Ù‡ Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª Ù„Ø§ ØªØ¸Ù‡Ø± Ø¯Ø§Ø®Ù„ Ø§Ù„Ù…ÙˆØ§Ø±Ø¯ Ø§Ù„Ø¨Ø´Ø±ÙŠØ©.</span>
                  </div>
                  <Badge tone="purple">{adminUsers.length}</Badge>
                </div>

                <div className="users-grid">
                  {adminUsers.map(item => (
                    <article className="user-card" key={item.id}>
                      <div className="user-card-top">
                        <div className="avatar soft">{item.avatar || item.name?.slice(0, 2)}</div>
                        <Badge tone={item.isActive === false ? 'red' : 'green'}>{item.isActive === false ? 'Ù…ÙˆÙ‚ÙˆÙ' : 'Ù†Ø´Ø·'}</Badge>
                      </div>
                      <h3>{item.name}</h3>
                      <p>{item.email}</p>
                      <div className="user-badges">
                        <Badge tone="purple">{tr(item.role)}</Badge>
                        <Badge tone="neutral">{tr(item.department)}</Badge>
                      </div>
                      <div className="user-permissions">
                        <div><ShieldCheck size={16} /><span>ØµÙ„Ø§Ø­ÙŠØ§Øª ÙƒØ§Ù…Ù„Ø© Ø¹Ù„Ù‰ Ø§Ù„Ù†Ø¸Ø§Ù…</span></div>
                        <div><UserCog size={16} /><span>{item.isActive === false ? 'ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ù…Ø¹Ø·Ù„' : 'ÙŠÙ…ÙƒÙ†Ù‡ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ù„Ù„Ù†Ø¸Ø§Ù…'}</span></div>
                      </div>
                      <div className="task-actions">
                        <Button variant="ghost" type="button" onClick={() => startEditUser(item)}>ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…</Button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <div className="settings-user-group">
                <div className="settings-user-group-head">
                  <div>
                    <strong>Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„ÙØ±ÙŠÙ‚ Ø§Ù„Ù…Ø±ØªØ¨Ø·Ø© Ø¨Ø§Ù„Ù…ÙˆØ§Ø±Ø¯ Ø§Ù„Ø¨Ø´Ø±ÙŠØ©</strong>
                    <span>ØªÙ… ØªØ¨Ø³ÙŠØ· Ø¹Ø±Ø¶Ù‡Ø§ Ù‡Ù†Ø§ Ù„ØªØ¬Ù†Ø¨ ØªÙƒØ±Ø§Ø± Ù†ÙØ³ Ø¨Ø·Ø§Ù‚Ø§Øª Ø§Ù„ÙØ±ÙŠÙ‚ Ø¨ÙŠÙ† Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª ÙˆHR. Ø¥Ø¶Ø§ÙØ© Ø£Ø¹Ø¶Ø§Ø¡ Ø§Ù„ÙØ±ÙŠÙ‚ ØªØªÙ… Ù…Ù† HR ÙÙ‚Ø·.</span>
                  </div>
                  <Badge tone="blue">{teamUsers.length}</Badge>
                </div>

                <div className="users-grid users-grid-linked">
                  {teamUsers.map(item => (
                    <article className="user-card linked-user-card" key={item.id}>
                      <div className="user-card-top">
                        <div className="avatar soft">{item.avatar || item.name?.slice(0, 2)}</div>
                        <Badge tone={item.isActive === false ? 'red' : 'green'}>{item.isActive === false ? 'Ù…ÙˆÙ‚ÙˆÙ' : 'Ù†Ø´Ø·'}</Badge>
                      </div>
                      <h3>{item.name}</h3>
                      <p>{item.email}</p>
                      <div className="user-badges">
                        <Badge tone="purple">{tr(item.role)}</Badge>
                        <Badge tone="neutral">{tr(item.department)}</Badge>
                        <Badge tone="blue">Ù…Ø±ØªØ¨Ø· Ø¨Ù€ HR</Badge>
                      </div>
                      <div className="user-permissions compact">
                        <div><UserCog size={16} /><span>{item.isActive === false ? 'Ø§Ù„Ø­Ø³Ø§Ø¨ ÙˆØ³Ø¬Ù„ HR Ù…ØªÙˆÙ‚ÙØ§Ù†' : 'Ø§Ù„Ø­Ø³Ø§Ø¨ ÙˆØ³Ø¬Ù„ HR Ù†Ø´Ø·Ø§Ù†'}</span></div>
                      </div>
                      <div className="task-actions">
                        <Button variant="ghost" type="button" onClick={() => startEditUser(item)}>ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„Ø­Ø³Ø§Ø¨</Button>
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
            <Button type="submit"><Save /> {saving ? 'Ø¬Ø§Ø±Ù Ø§Ù„Ø­ÙØ¸...' : 'Ø­ÙØ¸ Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª'}</Button>
          </div>
        )}
      </form>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Ø¥Ø¶Ø§ÙØ© Ø£Ø¯Ù…Ù† Ø¬Ø¯ÙŠØ¯" subtitle="Ø¥Ù†Ø´Ø§Ø¡ Ø­Ø³Ø§Ø¨ Ø¥Ø¯Ø§Ø±ÙŠ Ø¯Ø§Ø®Ù„ÙŠ Ù„Ù„Ù†Ø¸Ø§Ù…" size="lg">
        <form className="form-grid" onSubmit={createUser}>
          <Field label="Ø§Ù„Ø§Ø³Ù…"><input required value={userForm.name} onChange={event => setUserForm({ ...userForm, name: event.target.value })} /></Field>
          <Field label="Ø§Ù„Ø¨Ø±ÙŠØ¯ Ø§Ù„Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ"><input required type="email" value={userForm.email} onChange={event => setUserForm({ ...userForm, email: event.target.value })} /></Field>
          <Field label="Ø§Ù„Ø¯ÙˆØ±">
            <select value="admin" disabled>
              <option value="admin">Ù…Ø³Ø¤ÙˆÙ„ Ø§Ù„Ù†Ø¸Ø§Ù…</option>
            </select>
          </Field>
          <Field label="Ø§Ù„Ù‚Ø³Ù…">
            <select value={userForm.department} onChange={event => setUserForm({ ...userForm, department: event.target.value })}>
              {departments.map(department => <option key={department} value={department}>{tr(department)}</option>)}
            </select>
          </Field>
          <Field label="ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±" className="field-full"><input required minLength="6" type="password" value={userForm.password} onChange={event => setUserForm({ ...userForm, password: event.target.value })} /></Field>
          <label className="required-toggle field-full">
            <input type="checkbox" checked={userForm.isActive} onChange={event => setUserForm({ ...userForm, isActive: event.target.checked })} />
            <span>Ø§Ù„Ø­Ø³Ø§Ø¨ Ù…ÙØ¹Ù„ ÙˆÙŠÙ…ÙƒÙ†Ù‡ ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„</span>
          </label>
          <div className="form-actions field-full">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Ø¥Ù„ØºØ§Ø¡</Button>
            <Button type="submit">Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø£Ø¯Ù…Ù†</Button>
          </div>
        </form>
      </Modal>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…" subtitle={selectedUser ? `ØªØ­Ø¯ÙŠØ« Ø­Ø³Ø§Ø¨ ${selectedUser.name}` : ''} size="lg">
        <form className="form-grid" onSubmit={updateUser}>
          <Field label="Ø§Ù„Ø§Ø³Ù…"><input required value={userForm.name} onChange={event => setUserForm({ ...userForm, name: event.target.value })} /></Field>
          <Field label="Ø§Ù„Ø¨Ø±ÙŠØ¯ Ø§Ù„Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ"><input required type="email" value={userForm.email} onChange={event => setUserForm({ ...userForm, email: event.target.value })} /></Field>
          <Field label="Ø§Ù„Ø¯ÙˆØ±">
            <select value={userForm.role} onChange={event => setUserForm({ ...userForm, role: event.target.value })}>
              <option value="admin">Ù…Ø³Ø¤ÙˆÙ„ Ø§Ù„Ù†Ø¸Ø§Ù…</option>
              <option value="management">Ø§Ù„Ø¥Ø¯Ø§Ø±Ø©</option>
              <option value="consultant">Ù…Ø³ØªØ´Ø§Ø±</option>
              <option value="admissions">Ø§Ù„Ù‚Ø¨ÙˆÙ„</option>
              <option value="reception">Ø§Ù„Ø§Ø³ØªÙ‚Ø¨Ø§Ù„</option>
              <option value="hr">Ø§Ù„Ù…ÙˆØ§Ø±Ø¯ Ø§Ù„Ø¨Ø´Ø±ÙŠØ©</option>
              <option value="finance">Ø§Ù„Ù…Ø§Ù„ÙŠØ©</option>
            </select>
          </Field>
          <Field label="Ø§Ù„Ù‚Ø³Ù…">
            <select value={userForm.department} onChange={event => setUserForm({ ...userForm, department: event.target.value })}>
              {departments.map(department => <option key={department} value={department}>{tr(department)}</option>)}
            </select>
          </Field>
          <Field label="ÙƒÙ„Ù…Ø© Ù…Ø±ÙˆØ± Ø¬Ø¯ÙŠØ¯Ø©" className="field-full" hint="Ø§ØªØ±ÙƒÙ‡Ø§ ÙØ§Ø±ØºØ© Ø¥Ø°Ø§ Ù„Ù… ØªØ±Ø¯ ØªØºÙŠÙŠØ± ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±">
            <input type="password" value={userForm.password} onChange={event => setUserForm({ ...userForm, password: event.target.value })} />
          </Field>
          <label className="required-toggle field-full">
            <input type="checkbox" checked={userForm.isActive} onChange={event => setUserForm({ ...userForm, isActive: event.target.checked })} />
            <span>Ø§Ù„Ø­Ø³Ø§Ø¨ Ù…ÙØ¹Ù„ ÙˆÙŠÙ…ÙƒÙ†Ù‡ ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„</span>
          </label>
          <div className="form-actions field-full">
            <Button type="button" variant="secondary" onClick={() => setEditOpen(false)}>Ø¥Ù„ØºØ§Ø¡</Button>
            <Button type="submit">Ø­ÙØ¸ Ø§Ù„ØªØ¹Ø¯ÙŠÙ„Ø§Øª</Button>
          </div>
        </form>
      </Modal>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}


