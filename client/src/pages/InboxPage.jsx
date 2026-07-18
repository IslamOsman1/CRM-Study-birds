import React, { useEffect, useMemo, useState } from 'react';
import { Link2, MessageCircleMore, Search, Send, ShieldAlert, UserSquare2 } from 'lucide-react';
import { api, formatDate } from '../api.js';
import { Badge, Button, Card, Field, Spinner, Toast } from '../components/UI.jsx';
import { useAuth } from '../auth.jsx';

const channelTone = {
  whatsapp: 'green',
  facebook: 'blue',
  instagram: 'purple'
};

const conversationStatuses = ['open', 'pending', 'resolved'];
const conversationPriorities = ['low', 'medium', 'high', 'urgent'];

const statusTone = {
  open: 'red',
  pending: 'amber',
  resolved: 'green'
};

const statusLabel = {
  open: 'مفتوحة',
  pending: 'معلقة',
  resolved: 'منتهية'
};

const priorityTone = {
  low: 'neutral',
  medium: 'blue',
  high: 'amber',
  urgent: 'red'
};

const priorityLabel = {
  low: 'منخفضة',
  medium: 'متوسطة',
  high: 'مرتفعة',
  urgent: 'عاجلة'
};

const todayKey = '2026-07-18';

function contactSubtitle(contact) {
  return contact.phone || contact.email || 'بدون وسيلة تواصل';
}

function contactMeta(contact) {
  return contact.country || contact.nationality || contact.source || '';
}

export default function InboxPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [allConversations, setAllConversations] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [channels, setChannels] = useState([]);
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [leads, setLeads] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [assignedUserFilter, setAssignedUserFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [activeView, setActiveView] = useState('all');
  const [selectedConversationIds, setSelectedConversationIds] = useState([]);
  const [bulkForm, setBulkForm] = useState({ assignedUserId: '', status: 'open', priority: 'medium', tags: '' });
  const [composer, setComposer] = useState({ text: '', templateName: '' });
  const [linkForm, setLinkForm] = useState({ contactId: '', contactType: 'lead' });
  const [linkSearch, setLinkSearch] = useState('');
  const [assignmentForm, setAssignmentForm] = useState({ assignedUserId: '', status: 'open' });
  const [classificationForm, setClassificationForm] = useState({ priority: 'medium', tags: '' });

  const load = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (channelFilter) params.set('channelType', channelFilter);
      if (assignedUserFilter) params.set('assignedUserId', assignedUserFilter);
      if (statusFilter) params.set('status', statusFilter);
      const queryString = params.toString();

      const [allConversationItems, conversationItems, metaStatus, settings, leadItems, studentItems] = await Promise.all([
        api('/api/conversations'),
        api(`/api/conversations${queryString ? `?${queryString}` : ''}`),
        api('/api/integrations/meta/status'),
        api('/api/settings'),
        api('/api/leads'),
        api('/api/students')
      ]);

      setAllConversations(allConversationItems || []);
      setConversations(conversationItems || []);
      setChannels(metaStatus.channels || []);
      setUsers(settings.users || []);
      setLeads(leadItems || []);
      setStudents(studentItems || []);

      setSelectedId(currentSelectedId => {
        if (!conversationItems?.length) return '';
        if (currentSelectedId && conversationItems.some(item => item.id === currentSelectedId)) return currentSelectedId;
        return conversationItems[0].id;
      });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadMessages = async conversationId => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    try {
      const items = await api(`/api/conversations/${conversationId}/messages`);
      setMessages(items || []);
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load({ silent: true }), 20000);
    return () => window.clearInterval(timer);
  }, [channelFilter, assignedUserFilter, statusFilter]);

  useEffect(() => {
    loadMessages(selectedId);
  }, [selectedId]);

  useEffect(() => {
    const knownIds = new Set(allConversations.map(item => item.id));
    setSelectedConversationIds(current => current.filter(item => knownIds.has(item)));
  }, [allConversations]);

  const shownConversations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return conversations;

    return conversations.filter(item =>
      [
        item.externalUserName,
        item.externalUserId,
        item.contact?.name,
        item.contact?.phone,
        item.lastMessage?.text
      ].some(value => String(value || '').toLowerCase().includes(normalizedQuery))
    );
  }, [conversations, query]);

  const selected = useMemo(
    () => conversations.find(item => item.id === selectedId) || null,
    [conversations, selectedId]
  );

  const savedViews = useMemo(() => {
    const items = allConversations || [];
    return [
      {
        id: 'all',
        label: 'كل المحادثات',
        count: items.length,
        apply: () => {
          setChannelFilter('');
          setAssignedUserFilter('');
          setStatusFilter('');
        }
      },
      {
        id: 'unassigned',
        label: 'غير مسندة',
        count: items.filter(item => !item.assignedUserId).length,
        apply: () => {
          setChannelFilter('');
          setAssignedUserFilter('');
          setStatusFilter('');
        }
      },
      {
        id: 'mine-open',
        label: 'مفتوحة لي',
        count: items.filter(item => item.assignedUserId === user?.id && item.status === 'open').length,
        apply: () => {
          setChannelFilter('');
          setAssignedUserFilter(user?.id || '');
          setStatusFilter('open');
        }
      },
      {
        id: 'pending-today',
        label: 'معلقة اليوم',
        count: items.filter(item => item.status === 'pending' && String(item.lastMessageAt || '').slice(0, 10) === todayKey).length,
        apply: () => {
          setChannelFilter('');
          setAssignedUserFilter('');
          setStatusFilter('pending');
        }
      }
    ];
  }, [allConversations, user?.id]);

  const visibleConversations = useMemo(() => {
    if (activeView === 'unassigned') {
      return shownConversations.filter(item => !item.assignedUserId);
    }
    if (activeView === 'pending-today') {
      return shownConversations.filter(
        item => item.status === 'pending' && String(item.lastMessageAt || '').slice(0, 10) === todayKey
      );
    }
    return shownConversations;
  }, [activeView, shownConversations]);

  const allVisibleSelected = useMemo(
    () => visibleConversations.length > 0 && visibleConversations.every(item => selectedConversationIds.includes(item.id)),
    [visibleConversations, selectedConversationIds]
  );

  useEffect(() => {
    if (!selected) {
      setLinkForm({ contactId: '', contactType: 'lead' });
      setLinkSearch('');
      setAssignmentForm({ assignedUserId: '', status: 'open' });
      return;
    }

    setLinkForm({
      contactId: selected.contact?.id || '',
      contactType: selected.contact?.type || 'lead'
    });
    setLinkSearch(selected.contact?.name || '');
    setAssignmentForm({
      assignedUserId: selected.assignedUserId || '',
      status: selected.status || 'open'
    });
    setClassificationForm({
      priority: selected.priority || 'medium',
      tags: (selected.tags || []).join(', ')
    });
  }, [selected]);

  const filteredContacts = useMemo(() => {
    const source = linkForm.contactType === 'student' ? students : leads;
    const normalizedSearch = linkSearch.trim().toLowerCase();

    const matched = !normalizedSearch
      ? source
      : source.filter(item =>
          [item.name, item.phone, item.email]
            .some(value => String(value || '').toLowerCase().includes(normalizedSearch))
        );

    return matched.slice(0, 8);
  }, [leads, students, linkForm.contactType, linkSearch]);

  useEffect(() => {
    if (!user?.id && activeView === 'mine-open') {
      setActiveView('all');
      setAssignedUserFilter('');
      setStatusFilter('');
    }
  }, [activeView, user?.id]);

  const assignedUser = useMemo(
    () => users.find(item => item.id === selected?.assignedUserId) || null,
    [users, selected?.assignedUserId]
  );

  const selectedContact = useMemo(() => {
    if (!linkForm.contactId) return null;
    const source = linkForm.contactType === 'student' ? students : leads;
    return source.find(item => item.id === linkForm.contactId) || null;
  }, [leads, students, linkForm.contactId, linkForm.contactType]);

  const toggleConversationSelection = (conversationId, checked) => {
    setSelectedConversationIds(current => {
      if (checked) return current.includes(conversationId) ? current : [...current, conversationId];
      return current.filter(item => item !== conversationId);
    });
  };

  const toggleSelectAllVisible = checked => {
    setSelectedConversationIds(current => {
      if (checked) {
        return [...new Set([...current, ...visibleConversations.map(item => item.id)])];
      }
      const visibleIds = new Set(visibleConversations.map(item => item.id));
      return current.filter(item => !visibleIds.has(item));
    });
  };

  const runBulkAction = async operation => {
    if (!selectedConversationIds.length) return;

    const payload = {
      ids: selectedConversationIds,
      operation
    };

    if (operation === 'assign') payload.assignedUserId = bulkForm.assignedUserId;
    if (operation === 'status') payload.status = bulkForm.status;
    if (operation === 'priority') payload.priority = bulkForm.priority;
    if (operation === 'tags') {
      payload.tags = bulkForm.tags
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
    }

    try {
      const result = await api('/api/conversations/bulk', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      await load({ silent: true });
      if (selectedId && selectedConversationIds.includes(selectedId)) {
        await loadMessages(selectedId);
      }
      setSelectedConversationIds([]);
      setToast({
        message:
          operation === 'assign'
            ? `تم تعيين ${result.updatedCount} محادثة`
            : operation === 'status'
              ? `تم تحديث حالة ${result.updatedCount} محادثة`
              : operation === 'priority'
                ? `تم تحديث أولوية ${result.updatedCount} محادثة`
                : operation === 'tags'
                  ? `تم تحديث وسوم ${result.updatedCount} محادثة`
              : `تم تعليم ${result.updatedCount} محادثة كمقروءة`
      });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const sendMessage = async event => {
    event.preventDefault();
    if (!selected || (!composer.text.trim() && !composer.templateName.trim())) return;

    try {
      await api(`/api/conversations/${selected.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          text: composer.text.trim(),
          templateName: composer.templateName.trim()
        })
      });
      setComposer({ text: '', templateName: '' });
      await loadMessages(selected.id);
      await load({ silent: true });
      setToast({ message: 'تم إرسال الرسالة بنجاح' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const linkContact = async event => {
    event.preventDefault();
    if (!selected || !linkForm.contactId) return;

    try {
      await api(`/api/conversations/${selected.id}/link-contact`, {
        method: 'POST',
        body: JSON.stringify(linkForm)
      });
      await load({ silent: true });
      setToast({ message: 'تم ربط المحادثة بملف العميل' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const assignConversation = async event => {
    event.preventDefault();
    if (!selected) return;

    try {
      await api(`/api/conversations/${selected.id}/assign`, {
        method: 'POST',
        body: JSON.stringify({ assignedUserId: assignmentForm.assignedUserId })
      });
      await load({ silent: true });
      setToast({ message: 'تم تحديث الموظف المسؤول' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const updateConversationStatus = async event => {
    event.preventDefault();
    if (!selected) return;

    try {
      await api(`/api/conversations/${selected.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: assignmentForm.status })
      });
      await load({ silent: true });
      setToast({ message: 'تم تحديث حالة المحادثة' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const updateConversationClassification = async event => {
    event.preventDefault();
    if (!selected) return;

    try {
      await api(`/api/conversations/${selected.id}/classification`, {
        method: 'PATCH',
        body: JSON.stringify({
          priority: classificationForm.priority,
          tags: classificationForm.tags
            .split(',')
            .map(item => item.trim())
            .filter(Boolean)
        })
      });
      await load({ silent: true });
      setToast({ message: 'تم تحديث الأولوية والوسوم' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  if (loading) {
    return <div className="loading-page"><Spinner />جارٍ تحميل صندوق الوارد...</div>;
  }

  return (
    <>
      <div className="admissions-layout">
        <Card className="applications-panel">
          <div className="panel-toolbar">
            <div className="search-box">
              <Search />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="ابحث باسم العميل أو نص الرسالة..."
              />
            </div>
            <div className="toolbar-right">
              <select
                value={channelFilter}
                onChange={event => {
                  setActiveView('custom');
                  setChannelFilter(event.target.value);
                }}
              >
                <option value="">كل القنوات</option>
                <option value="whatsapp">واتساب</option>
                <option value="facebook">ماسنجر</option>
                <option value="instagram">إنستغرام</option>
              </select>
              <select
                value={assignedUserFilter}
                onChange={event => {
                  setActiveView('custom');
                  setAssignedUserFilter(event.target.value);
                }}
              >
                <option value="">كل الموظفين</option>
                {users.map(item => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={event => {
                  setActiveView('custom');
                  setStatusFilter(event.target.value);
                }}
              >
                <option value="">كل الحالات</option>
                {conversationStatuses.map(status => (
                  <option key={status} value={status}>{statusLabel[status]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="inbox-saved-views">
            {savedViews.map(view => (
              <button
                key={view.id}
                type="button"
                className={`inbox-view-chip ${activeView === view.id ? 'active' : ''}`}
                onClick={() => {
                  setActiveView(view.id);
                  view.apply();
                }}
              >
                <span>{view.label}</span>
                <strong>{view.count}</strong>
              </button>
            ))}
          </div>

          {!!selectedConversationIds.length && (
            <div className="bulk-actions-bar">
              <div className="bulk-actions-meta">
                <label className="required-toggle">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={event => toggleSelectAllVisible(event.target.checked)}
                  />
                  <span>تحديد كل الظاهر</span>
                </label>
                <Badge tone="purple">{selectedConversationIds.length} محددة</Badge>
              </div>

              <div className="bulk-actions-controls">
                <select
                  value={bulkForm.assignedUserId}
                  onChange={event => setBulkForm(current => ({ ...current, assignedUserId: event.target.value }))}
                >
                  <option value="">غير مسند</option>
                  {users.map(item => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
                <Button type="button" variant="secondary" onClick={() => runBulkAction('assign')}>
                  تعيين جماعي
                </Button>

                <select
                  value={bulkForm.status}
                  onChange={event => setBulkForm(current => ({ ...current, status: event.target.value }))}
                >
                  {conversationStatuses.map(status => (
                    <option key={status} value={status}>{statusLabel[status]}</option>
                  ))}
                </select>
                <Button type="button" variant="secondary" onClick={() => runBulkAction('status')}>
                  تغيير الحالة
                </Button>

                <select
                  value={bulkForm.priority}
                  onChange={event => setBulkForm(current => ({ ...current, priority: event.target.value }))}
                >
                  {conversationPriorities.map(priority => (
                    <option key={priority} value={priority}>{priorityLabel[priority]}</option>
                  ))}
                </select>
                <Button type="button" variant="secondary" onClick={() => runBulkAction('priority')}>
                  تغيير الأولوية
                </Button>

                <input
                  value={bulkForm.tags}
                  onChange={event => setBulkForm(current => ({ ...current, tags: event.target.value }))}
                  placeholder="وسوم جماعية: VIP, متابعة"
                />
                <Button type="button" variant="secondary" onClick={() => runBulkAction('tags')}>
                  تحديث الوسوم
                </Button>

                <Button type="button" variant="ghost" onClick={() => runBulkAction('mark_read')}>
                  تعليم كمقروءة
                </Button>
                <Button type="button" variant="ghost" onClick={() => setSelectedConversationIds([])}>
                  إلغاء التحديد
                </Button>
              </div>
            </div>
          )}

          <div className="applications-list">
            {visibleConversations.map(conversation => (
              <button
                key={conversation.id}
                onClick={() => setSelectedId(conversation.id)}
                className={`application-row ${selectedId === conversation.id ? 'selected' : ''}`}
                type="button"
              >
                <label
                  className="row-selector"
                  onClick={event => event.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={selectedConversationIds.includes(conversation.id)}
                    onChange={event => toggleConversationSelection(conversation.id, event.target.checked)}
                  />
                </label>
                <div className="avatar soft">
                  {String(conversation.externalUserName || conversation.externalUserId || '?').slice(0, 2)}
                </div>
                <div className="application-main">
                  <div>
                    <strong>{conversation.externalUserName || conversation.externalUserId}</strong>
                    <div className="document-badges">
                      <Badge tone={channelTone[conversation.channelType] || 'neutral'}>
                        {conversation.channelType}
                      </Badge>
                      <Badge tone={statusTone[conversation.status] || 'neutral'}>
                        {statusLabel[conversation.status] || conversation.status || 'مفتوحة'}
                      </Badge>
                      <Badge tone={priorityTone[conversation.priority || 'medium'] || 'neutral'}>
                        {priorityLabel[conversation.priority || 'medium'] || 'متوسطة'}
                      </Badge>
                    </div>
                  </div>
                  <p>{conversation.lastMessage?.text || 'لا يوجد نص ظاهر في آخر رسالة'}</p>
                  <span>
                    {conversation.contact?.name || conversation.channel?.pageName || conversation.channel?.displayPhoneNumber || 'قناة مرتبطة'}
                    {conversation.assignedUserId && users.find(item => item.id === conversation.assignedUserId)
                      ? ` • ${users.find(item => item.id === conversation.assignedUserId)?.name}`
                      : ''}
                  </span>
                </div>
                <div className="app-date">
                  <span>{conversation.unreadCount || 0} غير مقروءة</span>
                  <small>{formatDate(conversation.lastMessageAt)}</small>
                </div>
              </button>
            ))}

            {!visibleConversations.length && (
              <div className="select-placeholder">
                <Search />
                <h3>لا توجد نتائج</h3>
                <p>جرّب تغيير البحث أو القناة لعرض محادثات أخرى.</p>
              </div>
            )}
          </div>
        </Card>

        <Card className="application-detail">
          {selected ? (
            <>
              <div className="detail-hero">
                <div className="hero-icon"><MessageCircleMore /></div>
                <div>
                  <p className="eyebrow">المحادثة</p>
                  <h2>{selected.externalUserName || selected.externalUserId}</h2>
                  <span>
                    {selected.channel?.pageName || selected.channel?.instagramUsername || selected.channel?.displayPhoneNumber || selected.channelType}
                  </span>
                </div>
                <div className="document-badges">
                  <Badge tone={channelTone[selected.channelType] || 'neutral'}>{selected.channelType}</Badge>
                  <Badge tone={statusTone[selected.status] || 'neutral'}>
                    {statusLabel[selected.status] || selected.status || 'مفتوحة'}
                  </Badge>
                  <Badge tone={priorityTone[selected.priority || 'medium'] || 'neutral'}>
                    {priorityLabel[selected.priority || 'medium'] || 'متوسطة'}
                  </Badge>
                </div>
              </div>

              <div className="detail-grid">
                <div><span>الملف المرتبط</span><strong>{selected.contact?.name || 'غير مرتبط بعد'}</strong></div>
                <div><span>نوع الملف</span><strong>{selected.contact?.type || 'بدون'}</strong></div>
                <div><span>الهاتف أو المعرف</span><strong>{selected.contact?.phone || selected.externalUserId}</strong></div>
                <div><span>الحالة</span><strong>{statusLabel[selected.status] || selected.status || 'مفتوحة'}</strong></div>
              </div>

              <div className="detail-grid">
                <div><span>الموظف المسؤول</span><strong>{assignedUser?.name || 'غير مسند'}</strong></div>
                <div><span>البريد</span><strong>{assignedUser?.email || '—'}</strong></div>
                <div><span>الأولوية</span><strong>{priorityLabel[selected.priority || 'medium'] || 'متوسطة'}</strong></div>
                <div><span>غير مقروءة</span><strong>{selected.unreadCount || 0}</strong></div>
              </div>

              {!!selected.tags?.length && (
                <div className="notes-box">
                  <strong>وسوم المحادثة</strong>
                  <div className="document-badges compact-head">
                    {selected.tags.map(tag => <Badge key={tag} tone="purple">{tag}</Badge>)}
                  </div>
                </div>
              )}

              {selected.channelType === 'whatsapp' && selected.messagingWindowExpiresAt && new Date(selected.messagingWindowExpiresAt).getTime() < Date.now() && (
                <div className="notes-box">
                  <strong><ShieldAlert size={14} /> نافذة واتساب الحرة منتهية</strong>
                  <p>يمكنك الآن الإرسال عبر قالب واتساب معتمد فقط إلى أن تُفتح نافذة مراسلة جديدة.</p>
                </div>
              )}

              <div className="templates-stack">
                {messages.map(message => (
                  <article key={message.id} className="template-card">
                    <div className="template-card-head">
                      <div>
                        <h3>{message.direction === 'outbound' ? 'أنت' : selected.externalUserName || 'العميل'}</h3>
                        <span>{formatDate(message.createdAt)} · {message.providerStatus || message.status}</span>
                      </div>
                      <div className="document-badges">
                        <Badge tone={message.direction === 'outbound' ? 'purple' : 'blue'}>{message.messageType}</Badge>
                        <Badge tone={message.status === 'failed' ? 'red' : message.status === 'read' ? 'green' : message.status === 'delivered' ? 'blue' : 'neutral'}>
                          {message.status}
                        </Badge>
                      </div>
                    </div>
                    <p>{message.text || 'رسالة بدون نص أو تحتوي على مرفقات فقط.'}</p>
                    {message.errorMessage && <small>{message.errorMessage}</small>}
                  </article>
                ))}
              </div>

              <form className="stack-form" onSubmit={linkContact}>
                <Field label="ربط المحادثة بملف موجود" hint="اختر النوع ثم ابحث بالاسم أو الهاتف أو البريد، وبعدها اختر السجل المناسب.">
                  <div className="form-grid">
                    <select
                      value={linkForm.contactType}
                      onChange={event => {
                        setLinkForm({ contactId: '', contactType: event.target.value });
                        setLinkSearch('');
                      }}
                    >
                      <option value="lead">Lead</option>
                      <option value="student">Student</option>
                    </select>
                    <input
                      value={linkSearch}
                      onChange={event => {
                        setLinkSearch(event.target.value);
                        if (linkForm.contactId) {
                          setLinkForm(current => ({ ...current, contactId: '' }));
                        }
                      }}
                      placeholder="ابحث بالاسم أو الهاتف أو البريد"
                    />
                  </div>
                </Field>

                {selectedContact && (
                  <div className="notes-box">
                    <strong>العنصر المحدد</strong>
                    <p>{selectedContact.name} · {contactSubtitle(selectedContact)}</p>
                  </div>
                )}

                {!!filteredContacts.length && (
                  <div className="templates-stack">
                    {filteredContacts.map(contact => (
                      <button
                        key={contact.id}
                        className={linkForm.contactId === contact.id ? 'application-row selected' : 'application-row'}
                        type="button"
                        onClick={() => {
                          setLinkForm(current => ({ ...current, contactId: contact.id }));
                          setLinkSearch(contact.name);
                        }}
                      >
                        <div className="application-main">
                          <div>
                            <strong>{contact.name}</strong>
                            <Badge tone="neutral">{linkForm.contactType}</Badge>
                          </div>
                          <p>{contactSubtitle(contact)}</p>
                          <span>{contactMeta(contact)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {!filteredContacts.length && linkSearch.trim() && (
                  <div className="notes-box">
                    <strong>لا توجد نتائج مطابقة</strong>
                    <p>لم نجد أي {linkForm.contactType === 'student' ? 'طالب' : 'عميل محتمل'} يطابق البحث الحالي.</p>
                  </div>
                )}

                <div className="form-actions">
                  <Button type="submit" variant="secondary" disabled={!linkForm.contactId}>
                    <Link2 /> ربط الملف
                  </Button>
                </div>
              </form>

              <div className="form-grid">
                <form className="stack-form" onSubmit={assignConversation}>
                  <Field label="تعيين الموظف">
                    <select
                      value={assignmentForm.assignedUserId}
                      onChange={event => setAssignmentForm(current => ({ ...current, assignedUserId: event.target.value }))}
                    >
                      <option value="">غير مسند</option>
                      {users.map(item => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </Field>
                  <div className="form-actions">
                    <Button type="submit" variant="secondary">حفظ التعيين</Button>
                  </div>
                </form>

                <form className="stack-form" onSubmit={updateConversationStatus}>
                  <Field label="حالة المحادثة">
                    <select
                      value={assignmentForm.status}
                      onChange={event => setAssignmentForm(current => ({ ...current, status: event.target.value }))}
                    >
                      {conversationStatuses.map(status => (
                        <option key={status} value={status}>{statusLabel[status]}</option>
                      ))}
                    </select>
                  </Field>
                  <div className="form-actions">
                    <Button type="submit" variant="secondary">حفظ الحالة</Button>
                  </div>
                </form>
              </div>

              <form className="stack-form" onSubmit={updateConversationClassification}>
                <div className="form-grid">
                  <Field label="أولوية المحادثة">
                    <select
                      value={classificationForm.priority}
                      onChange={event => setClassificationForm(current => ({ ...current, priority: event.target.value }))}
                    >
                      {conversationPriorities.map(priority => (
                        <option key={priority} value={priority}>{priorityLabel[priority]}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="وسوم المحادثة" hint="افصل بين الوسوم بفاصلة مثل: VIP, ممول, متابعة سريعة">
                    <input
                      value={classificationForm.tags}
                      onChange={event => setClassificationForm(current => ({ ...current, tags: event.target.value }))}
                    />
                  </Field>
                </div>
                <div className="form-actions">
                  <Button type="submit" variant="secondary">حفظ التصنيف</Button>
                </div>
              </form>

              <form className="stack-form" onSubmit={sendMessage}>
                <Field label="اسم قالب واتساب" hint="اتركه فارغًا لإرسال رسالة نصية عادية داخل نافذة المراسلة المسموح بها.">
                  <input
                    value={composer.templateName}
                    onChange={event => setComposer(current => ({ ...current, templateName: event.target.value }))}
                    placeholder="مثال: follow_up_template"
                  />
                </Field>
                <Field label="الرسالة">
                  <textarea
                    value={composer.text}
                    onChange={event => setComposer(current => ({ ...current, text: event.target.value }))}
                  />
                </Field>
                <div className="form-actions">
                  <Button type="submit">
                    <Send /> إرسال
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <div className="select-placeholder">
              <UserSquare2 />
              <h3>اختر محادثة</h3>
              <p>اختر محادثة من القائمة لعرض الرسائل وربط العميل وتحديث المسؤول والحالة.</p>
            </div>
          )}
        </Card>
      </div>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
