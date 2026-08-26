import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CalendarClock,
  ChevronDown,
  CircleAlert,
  FileUp,
  GripVertical,
  Mail,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Wallet
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
const defaultVisibleCards = 10;

const blankLead = {
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

const blankFilters = {
  consultantId: '',
  priority: '',
  targetCountry: '',
  currentLevel: '',
  university: '',
  source: '',
  stage: '',
  overdueOnly: false
};

const fallbackLeadDocumentTypes = [
  { name: 'Passport', required: true },
  { name: 'Transcript', required: true },
  { name: 'Personal Photo', required: true },
  { name: 'English Certificate', required: true },
  { name: 'Motivation Letter', required: false },
  { name: 'Recommendation Letter', required: false },
  { name: 'Acceptance Letter', required: false },
  { name: 'Other', required: false }
];

function collectUniqueOptions(...groups) {
  const values = groups
    .flatMap(group => group || [])
    .map(value => String(value || '').trim())
    .filter(Boolean);
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'ar'));
}

function parseUniversitySelection(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function serializeUniversitySelection(values) {
  return collectUniqueOptions(values).join(', ');
}

function getUniversitiesLabel(value) {
  const selected = parseUniversitySelection(value);
  if (!selected.length) return 'اختر جامعة أو أكثر';
  if (selected.length === 1) return selected[0];
  return `${selected.length} جامعات محددة`;
}

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

function gmailComposeLink(email) {
  const normalized = String(email || '').trim();
  return normalized ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(normalized)}` : '#';
}

function phoneLink(phone) {
  const normalized = String(phone || '').replace(/[^\d+]/g, '');
  return normalized ? `tel:${normalized}` : '#';
}

function WhatsAppIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M19.05 4.91A9.82 9.82 0 0 0 12.03 2c-5.44 0-9.87 4.43-9.87 9.87 0 1.74.45 3.44 1.31 4.95L2 22l5.33-1.4a9.8 9.8 0 0 0 4.7 1.2h.01c5.44 0 9.87-4.43 9.87-9.87 0-2.64-1.03-5.12-2.86-7.02Zm-7.02 15.22h-.01a8.13 8.13 0 0 1-4.14-1.13l-.3-.18-3.16.83.84-3.08-.2-.32a8.17 8.17 0 0 1 1.25-10.1 8.12 8.12 0 0 1 5.79-2.4c4.52 0 8.2 3.68 8.2 8.2a8.21 8.21 0 0 1-8.27 8.18Zm4.5-6.15c-.25-.13-1.47-.72-1.7-.8-.22-.08-.39-.12-.55.13-.17.25-.64.8-.79.96-.14.17-.29.19-.54.06-.25-.12-1.03-.38-1.97-1.22-.73-.65-1.23-1.46-1.38-1.7-.14-.25-.02-.38.1-.5.11-.11.25-.29.37-.43.12-.15.16-.25.25-.42.08-.17.04-.31-.02-.44-.07-.13-.55-1.33-.76-1.82-.2-.48-.4-.41-.55-.42h-.47c-.16 0-.42.06-.64.31-.22.25-.84.82-.84 2 0 1.18.86 2.32.98 2.48.12.17 1.7 2.59 4.12 3.63.57.25 1.02.4 1.37.51.58.18 1.11.15 1.53.09.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.05-.1-.21-.16-.46-.28Z" />
    </svg>
  );
}

export default function Consultancy() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [leads, setLeads] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [formUniversitiesMenuOpen, setFormUniversitiesMenuOpen] = useState(false);
  const [editUniversitiesMenuOpen, setEditUniversitiesMenuOpen] = useState(false);
  const [form, setForm] = useState(blankLead);
  const [editForm, setEditForm] = useState(blankLead);
  const [leadDocumentType, setLeadDocumentType] = useState('Passport');
  const [leadDocumentFile, setLeadDocumentFile] = useState(null);
  const [followUpValue, setFollowUpValue] = useState('');
  const [editingLead, setEditingLead] = useState(null);
  const [followUpLead, setFollowUpLead] = useState(null);
  const [filters, setFilters] = useState(blankFilters);
  const [focusedStage, setFocusedStage] = useState('');
  const [columnLimits, setColumnLimits] = useState({});
  const [toast, setToast] = useState(null);
  const formUniversitiesMenuRef = useRef(null);
  const editUniversitiesMenuRef = useRef(null);

  const canCreateLead = can(user.role, 'createLead');
  const canEditLead = can(user.role, 'editLead');
  const canDeleteLead = can(user.role, 'deleteLead');
  const canMoveLead = can(user.role, 'moveLead');

  const load = async () => {
    try {
      const [leadData, settingData] = await Promise.all([api('/api/leads'), api('/api/settings')]);
      setLeads(leadData);
      setSettings(settingData);
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const catalogLinks = settings?.catalogLinks || {};
  const consultants = useMemo(
    () => settings?.employees?.filter(employee => employee.department === 'Consultancy') || [],
    [settings]
  );
  const targetCountryOptions = useMemo(
    () => collectUniqueOptions(catalogLinks.countries, settings?.availableCountries),
    [catalogLinks.countries, settings?.availableCountries]
  );
  const stages = settings?.pipelineStages || [];
  const sourceOptions = useMemo(() => collectUniqueOptions(leads.map(lead => lead.source)), [leads]);
  const currentLevelFilterOptions = useMemo(() => collectUniqueOptions(leads.map(lead => lead.currentLevel)), [leads]);
  const universityFilterOptions = useMemo(
    () => collectUniqueOptions(leads.flatMap(lead => parseUniversitySelection(lead.university))),
    [leads]
  );

  const majorOptions = useMemo(() => {
    const selectedCountry = editOpen ? (editForm.targetCountry || editForm.country) : (form.targetCountry || form.country);
    if (selectedCountry && Array.isArray(catalogLinks.programsByCountry?.[selectedCountry])) {
      return collectUniqueOptions(catalogLinks.programsByCountry[selectedCountry]);
    }
    return collectUniqueOptions(catalogLinks.programs, settings?.availablePrograms);
  }, [
    catalogLinks.programs,
    catalogLinks.programsByCountry,
    editForm.country,
    editForm.targetCountry,
    editOpen,
    form.country,
    form.targetCountry,
    settings?.availablePrograms
  ]);

  const universityOptions = useMemo(() => {
    const selectedCountry = editOpen ? (editForm.targetCountry || editForm.country) : (form.targetCountry || form.country);
    const selectedMajor = editOpen ? (editForm.targetMajor || editForm.program) : (form.targetMajor || form.program);
    const byCountry = selectedCountry && Array.isArray(catalogLinks.universitiesByCountry?.[selectedCountry])
      ? catalogLinks.universitiesByCountry[selectedCountry]
      : collectUniqueOptions(catalogLinks.universities, settings?.availableUniversities);
    if (selectedMajor && Array.isArray(catalogLinks.universitiesByProgram?.[selectedMajor])) {
      return byCountry.filter(option => catalogLinks.universitiesByProgram[selectedMajor].includes(option));
    }
    return byCountry;
  }, [
    catalogLinks.universities,
    catalogLinks.universitiesByCountry,
    catalogLinks.universitiesByProgram,
    editForm.country,
    editForm.program,
    editForm.targetCountry,
    editForm.targetMajor,
    editOpen,
    form.country,
    form.program,
    form.targetCountry,
    form.targetMajor,
    settings?.availableUniversities
  ]);

  const leadDocumentOptions = useMemo(
    () => (settings?.documentTypes?.length ? settings.documentTypes : fallbackLeadDocumentTypes),
    [settings?.documentTypes]
  );
  const formUniversityOptions = useMemo(
    () => collectUniqueOptions(universityOptions, parseUniversitySelection(form.university)),
    [form.university, universityOptions]
  );
  const editUniversityOptions = useMemo(
    () => collectUniqueOptions(universityOptions, parseUniversitySelection(editForm.university)),
    [editForm.university, universityOptions]
  );
  const formUniversitiesLabel = useMemo(() => getUniversitiesLabel(form.university), [form.university]);
  const editUniversitiesLabel = useMemo(() => getUniversitiesLabel(editForm.university), [editForm.university]);
  const leadDocumentsByType = useMemo(() => {
    const map = new Map();
    (editingLead?.documents || []).forEach(document => {
      const current = map.get(document.type);
      if (!current || String(document.uploadedAt || '').localeCompare(String(current.uploadedAt || '')) > 0) {
        map.set(document.type, document);
      }
    });
    return map;
  }, [editingLead?.documents]);

  const shown = useMemo(
    () =>
      leads.filter(lead => {
        const matchesSearch = [
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
        ].some(value => String(value || '').toLowerCase().includes(search.toLowerCase()));
        const matchesConsultant = !filters.consultantId || lead.consultantId === filters.consultantId;
        const matchesPriority = !filters.priority || lead.priority === filters.priority;
        const matchesCountry = !filters.targetCountry || (lead.targetCountry || lead.country) === filters.targetCountry;
        const matchesLevel = !filters.currentLevel || lead.currentLevel === filters.currentLevel;
        const matchesUniversity = !filters.university || parseUniversitySelection(lead.university).includes(filters.university);
        const matchesSource = !filters.source || lead.source === filters.source;
        const matchesStage = !filters.stage || lead.stage === filters.stage;
        const matchesOverdue = !filters.overdueOnly || isOverdue(lead);
        const matchesFocusedStage = !focusedStage || lead.stage === focusedStage;
        return matchesSearch && matchesConsultant && matchesPriority && matchesCountry && matchesLevel && matchesUniversity && matchesSource && matchesStage && matchesOverdue && matchesFocusedStage;
      }),
    [filters, focusedStage, leads, search]
  );

  useEffect(() => {
    const leadId = searchParams.get('leadId');
    if (!leadId || !leads.length) return;
    const target = leads.find(item => item.id === leadId);
    if (!target) return;
    setSearch(target.name || '');
    if (target.stage) setFocusedStage(target.stage);
  }, [leads, searchParams]);

  useEffect(() => {
    if (!editOpen || !editingLead) return;
    const refreshedLead = leads.find(item => item.id === editingLead.id);
    if (refreshedLead) setEditingLead(refreshedLead);
  }, [editOpen, editingLead, leads]);

  useEffect(() => {
    if (leadDocumentOptions.length && !leadDocumentOptions.some(item => item.name === leadDocumentType)) {
      setLeadDocumentType(leadDocumentOptions[0].name);
    }
  }, [leadDocumentOptions, leadDocumentType]);

  useEffect(() => {
    setColumnLimits({});
  }, [search, filters, focusedStage, leads.length]);

  useEffect(() => {
    if (!open) {
      setFormUniversitiesMenuOpen(false);
      return undefined;
    }
    const handleClickOutside = event => {
      if (formUniversitiesMenuRef.current && !formUniversitiesMenuRef.current.contains(event.target)) {
        setFormUniversitiesMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (!editOpen) {
      setEditUniversitiesMenuOpen(false);
      return undefined;
    }
    const handleClickOutside = event => {
      if (editUniversitiesMenuRef.current && !editUniversitiesMenuRef.current.contains(event.target)) {
        setEditUniversitiesMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [editOpen]);

  const toggleFormUniversitySelection = university => {
    const currentSelection = parseUniversitySelection(form.university);
    const nextSelection = currentSelection.includes(university)
      ? currentSelection.filter(item => item !== university)
      : [...currentSelection, university];
    setForm(current => ({ ...current, university: serializeUniversitySelection(nextSelection) }));
  };

  const toggleEditUniversitySelection = university => {
    const currentSelection = parseUniversitySelection(editForm.university);
    const nextSelection = currentSelection.includes(university)
      ? currentSelection.filter(item => item !== university)
      : [...currentSelection, university];
    setEditForm(current => ({ ...current, university: serializeUniversitySelection(nextSelection) }));
  };

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
          university: serializeUniversitySelection(parseUniversitySelection(form.university)),
          nextFollowUp: toIsoFromDateTimeLocal(form.nextFollowUp)
        })
      });
      setOpen(false);
      setForm(blankLead);
      await load();
      setToast({ message: 'تمت إضافة العميل المحتمل بنجاح.' });
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
          university: serializeUniversitySelection(parseUniversitySelection(editForm.university)),
          nextFollowUp: toIsoFromDateTimeLocal(editForm.nextFollowUp)
        })
      });
      setEditOpen(false);
      setEditingLead(null);
      await load();
      setToast({ message: 'تم تحديث بيانات العميل المحتمل.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const uploadLeadDocument = async event => {
    event.preventDefault();
    if (!editingLead || !leadDocumentFile) return;
    const body = new FormData();
    body.append('file', leadDocumentFile);
    body.append('type', leadDocumentType);
    try {
      const result = await api(`/api/leads/${editingLead.id}/documents`, { method: 'POST', body });
      setEditingLead(result.lead);
      setLeadDocumentFile(null);
      setLeadDocumentType('Passport');
      await load();
      setToast({ message: 'تم رفع مستند الطالب بنجاح.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const deleteLeadDocument = async document => {
    if (!editingLead) return;
    if (!window.confirm(`هل تريد حذف المستند ${document.originalName}؟`)) return;
    try {
      await api(`/api/leads/${editingLead.id}/documents/${document.id}`, { method: 'DELETE' });
      setEditingLead(current => current ? { ...current, documents: (current.documents || []).filter(item => item.id !== document.id) } : current);
      await load();
      setToast({ message: 'تم حذف المستند.' });
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
      setToast({ message: 'تم تحديد موعد المتابعة القادم.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const removeLead = async lead => {
    if (!window.confirm(`هل تريد حذف العميل المحتمل ${lead.name}؟`)) return;
    try {
      await api(`/api/leads/${lead.id}`, { method: 'DELETE' });
      await load();
      setToast({ message: 'تم حذف العميل المحتمل.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  if (loading) return <div className="loading-page"><Spinner />جارٍ تحميل مسار العملاء...</div>;

  const activeFiltersCount =
    Number(Boolean(filters.consultantId)) +
    Number(Boolean(filters.priority)) +
    Number(Boolean(filters.targetCountry)) +
    Number(Boolean(filters.currentLevel)) +
    Number(Boolean(filters.university)) +
    Number(Boolean(filters.source)) +
    Number(Boolean(filters.stage)) +
    Number(Boolean(filters.overdueOnly)) +
    Number(Boolean(focusedStage));

  const visibleStages = stages.filter(stage => !focusedStage || stage === focusedStage);

  return (
    <>
      <div className="kpi-grid reports-kpis">
        <div className="card kpi-card">
          <div className="kpi-meta">
            <span>إجمالي العملاء الظاهرين</span>
            <strong>{shown.length}</strong>
            <small>بعد البحث والتصفية الحالية</small>
          </div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-meta">
            <span>المتابعات المتأخرة</span>
            <strong>{shown.filter(isOverdue).length}</strong>
            <small>تحتاج تدخلًا سريعًا</small>
          </div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-meta">
            <span>جاهزون للقبول</span>
            <strong>{shown.filter(lead => lead.stage === 'Closed / Won').length}</strong>
            <small>يمكن تحويلهم مباشرة</small>
          </div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-meta">
            <span>عالي الأولوية</span>
            <strong>{shown.filter(lead => lead.priority === 'High').length}</strong>
            <small>Hot leads في اللوحة الحالية</small>
          </div>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <Search />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث داخل مسار الاستشارات..." />
        </div>
        <div className="toolbar-right">
          <Button variant="secondary" onClick={() => setFiltersOpen(true)} type="button">
            <SlidersHorizontal /> تصفية {activeFiltersCount ? `(${activeFiltersCount})` : ''}
          </Button>
          {canCreateLead && <Button onClick={() => setOpen(true)} type="button"><Plus /> عميل جديد</Button>}
        </div>
      </div>

      <div className="pipeline-board">
        {visibleStages.map(stage => {
          const stageLeads = shown.filter(lead => lead.stage === stage);
          const visibleCount = columnLimits[stage] || defaultVisibleCards;
          const visibleLeads = stageLeads.slice(0, visibleCount);
          return (
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
                  <span>{stageLeads.length}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const nextStage = focusedStage === stage ? '' : stage;
                    setFocusedStage(nextStage);
                    setSearchParams(current => {
                      const next = new URLSearchParams(current);
                      next.delete('leadId');
                      return next;
                    });
                  }}
                  title={focusedStage === stage ? 'إظهار كل المراحل' : 'التركيز على هذه المرحلة'}
                >
                  {focusedStage === stage ? 'الكل' : '...'}
                </button>
              </header>

              <div
                className="kanban-stack"
                onDragOver={event => event.preventDefault()}
                onDrop={event => canMoveLead && move(event.dataTransfer.getData('text/plain'), stage)}
              >
                {visibleLeads.map(lead => {
                  const consultant = consultants.find(item => item.id === lead.consultantId);
                  const overdue = isOverdue(lead);
                  return (
                    <article
                      className={`lead-card consultancy-lead-card ${overdue ? 'is-overdue' : ''}`}
                      draggable={canMoveLead}
                      onDragStart={event => canMoveLead && event.dataTransfer.setData('text/plain', lead.id)}
                      key={lead.id}
                    >
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
                      <div className="lead-country">{lead.targetCountry || lead.country || 'الدولة المستهدفة قيد التحديد'}</div>

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
                        {lead.phone && <span><Phone /> {lead.phone}</span>}
                        {lead.email && <span><Mail /> {lead.email}</span>}
                        {lead.nextFollowUp && (
                          <span className={overdue ? 'overdue' : ''}>
                            <CalendarClock /> {formatDate(lead.nextFollowUp)} · {formatArabicTime(lead.nextFollowUp)}
                          </span>
                        )}
                        {stage === 'Lost' && lead.lostReason && (
                          <span><Wallet /> سبب الفقد: {lead.lostReason}</span>
                        )}
                      </div>

                      {canMoveLead && lead.stage !== 'Closed / Won' && (
                        <button
                          className="btn btn-secondary lead-transfer-btn"
                          onClick={() => move(lead.id, 'Closed / Won')}
                          type="button"
                        >
                          نقل إلى القبول والتسجيل
                        </button>
                      )}

                      <footer className="lead-footer">
                        <div className="lead-meta">
                          <div className="mini-avatar" title={consultant?.name}>{initials(consultant?.name || '?')}</div>
                          <span>{consultant?.name || 'غير مسند'} · {tr(lead.source)}</span>
                        </div>
                        <button className="btn btn-ghost lead-view-btn" onClick={() => startEdit(lead)} type="button">
                          View Details
                        </button>
                        <div className="card-actions">
                          <a className="icon-btn small whatsapp-btn" href={whatsappLink(lead.phone)} target="_blank" rel="noreferrer" title="واتساب مباشر">
                            <WhatsAppIcon width={14} height={14} />
                          </a>
                          <a className="icon-btn small gmail-btn" href={gmailComposeLink(lead.email)} target="_blank" rel="noreferrer" title="إرسال عبر Gmail">
                            <Mail size={14} />
                          </a>
                          <a className="icon-btn small phone-btn" href={phoneLink(lead.phone)} title="اتصال هاتفي">
                            <Phone size={14} />
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

                {!stageLeads.length && <div className="kanban-empty">لا توجد بطاقات في هذه المرحلة</div>}
                {!!stageLeads.length && <div className="kanban-drop-zone">اسحب البطاقة وأفلتها هنا</div>}
                {stageLeads.length > visibleLeads.length && (
                  <button
                    className="btn btn-secondary show-more-btn"
                    onClick={() => setColumnLimits(current => ({ ...current, [stage]: visibleCount + defaultVisibleCards }))}
                    type="button"
                  >
                    عرض المزيد ({stageLeads.length - visibleLeads.length})
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <Modal open={filtersOpen} onClose={() => setFiltersOpen(false)} title="تصفية مسار الاستشارات" subtitle="اعرض البطاقات الأكثر أهمية فقط">
        <div className="stack-form">
          <Field label="المستشار المسؤول">
            <select value={filters.consultantId} onChange={event => setFilters(current => ({ ...current, consultantId: event.target.value }))}>
              <option value="">كل المستشارين</option>
              {consultants.map(consultant => <option key={consultant.id} value={consultant.id}>{consultant.name}</option>)}
            </select>
          </Field>
          <Field label="الأولوية">
            <select value={filters.priority} onChange={event => setFilters(current => ({ ...current, priority: event.target.value }))}>
              <option value="">كل الأولويات</option>
              <option value="High">مرتفعة</option>
              <option value="Medium">متوسطة</option>
              <option value="Low">منخفضة</option>
            </select>
          </Field>
          <Field label="الدولة المستهدفة">
            <select value={filters.targetCountry} onChange={event => setFilters(current => ({ ...current, targetCountry: event.target.value }))}>
              <option value="">كل الدول</option>
              {targetCountryOptions.map(option => <option value={option} key={option}>{tr(option)}</option>)}
            </select>
          </Field>
          <Field label="الدرجة">
            <select value={filters.currentLevel} onChange={event => setFilters(current => ({ ...current, currentLevel: event.target.value }))}>
              <option value="">كل الدرجات</option>
              {currentLevelFilterOptions.map(option => <option value={option} key={option}>{tr(option)}</option>)}
            </select>
          </Field>
          <Field label="الجامعة">
            <select value={filters.university} onChange={event => setFilters(current => ({ ...current, university: event.target.value }))}>
              <option value="">كل الجامعات</option>
              {universityFilterOptions.map(option => <option value={option} key={option}>{option}</option>)}
            </select>
          </Field>
          <Field label="المصدر / الحملة">
            <select value={filters.source} onChange={event => setFilters(current => ({ ...current, source: event.target.value }))}>
              <option value="">كل المصادر</option>
              {sourceOptions.map(option => <option value={option} key={option}>{tr(option)}</option>)}
            </select>
          </Field>
          <Field label="الحالة">
            <select value={filters.stage} onChange={event => setFilters(current => ({ ...current, stage: event.target.value }))}>
              <option value="">كل المراحل</option>
              {stages.map(option => <option value={option} key={option}>{tr(option)}</option>)}
            </select>
          </Field>
          <label className="check-row">
            <input type="checkbox" checked={filters.overdueOnly} onChange={event => setFilters(current => ({ ...current, overdueOnly: event.target.checked }))} />
            <span>
              <strong>إظهار المتابعات المتأخرة فقط</strong>
              <small>يعرض العملاء الذين تجاوزوا موعد المتابعة بدون نشاط جديد.</small>
            </span>
          </label>
          <div className="form-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setFilters(blankFilters);
                setFocusedStage('');
                setFiltersOpen(false);
              }}
            >
              إعادة ضبط
            </Button>
            <Button type="button" onClick={() => setFiltersOpen(false)}>تطبيق</Button>
          </div>
        </div>
      </Modal>

      <Modal open={open} onClose={() => setOpen(false)} title="إضافة عميل استشارات جديد" subtitle="سيظهر مباشرة داخل مسار الاستشارات." size="lg">
        <form className="form-grid" autoComplete="off" onSubmit={create}>
          <Field label="اسم الطالب"><input required autoComplete="off" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></Field>
          <Field label="رقم الهاتف"><input required autoComplete="off" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} /></Field>
          <Field label="البريد الإلكتروني"><input type="email" autoComplete="off" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></Field>
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
          <Field label="الجامعات" className="field-full" hint="يمكنك اختيار أكثر من جامعة من الخيارات المتاحة.">
            <div className="multi-select" ref={formUniversitiesMenuRef}>
              <button className={`multi-select-trigger ${formUniversitiesMenuOpen ? 'is-open' : ''}`} onClick={() => setFormUniversitiesMenuOpen(value => !value)} type="button">
                <span className={parseUniversitySelection(form.university).length ? '' : 'is-placeholder'}>{formUniversitiesLabel}</span>
                <ChevronDown size={16} />
              </button>
              {formUniversitiesMenuOpen && (
                <div className="multi-select-menu">
                  {formUniversityOptions.length ? formUniversityOptions.map(option => (
                    <label className="multi-select-option" key={option}>
                      <input type="checkbox" checked={parseUniversitySelection(form.university).includes(option)} onChange={() => toggleFormUniversitySelection(option)} />
                      <span>{option}</span>
                    </label>
                  )) : (
                    <div className="multi-select-empty">أضف جامعات أولًا من قسم الجامعات والبرامج.</div>
                  )}
                </div>
              )}
            </div>
            {!!parseUniversitySelection(form.university).length && (
              <div className="multi-select-tags">
                {parseUniversitySelection(form.university).map(option => <Badge key={option} tone="purple">{option}</Badge>)}
              </div>
            )}
          </Field>
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
          <Field label="الجامعات" className="field-full" hint="يمكنك اختيار أكثر من جامعة من الخيارات المتاحة.">
            <div className="multi-select" ref={editUniversitiesMenuRef}>
              <button className={`multi-select-trigger ${editUniversitiesMenuOpen ? 'is-open' : ''}`} onClick={() => setEditUniversitiesMenuOpen(value => !value)} type="button">
                <span className={parseUniversitySelection(editForm.university).length ? '' : 'is-placeholder'}>{editUniversitiesLabel}</span>
                <ChevronDown size={16} />
              </button>
              {editUniversitiesMenuOpen && (
                <div className="multi-select-menu">
                  {editUniversityOptions.length ? editUniversityOptions.map(option => (
                    <label className="multi-select-option" key={option}>
                      <input type="checkbox" checked={parseUniversitySelection(editForm.university).includes(option)} onChange={() => toggleEditUniversitySelection(option)} />
                      <span>{option}</span>
                    </label>
                  )) : (
                    <div className="multi-select-empty">أضف جامعات أولًا من قسم الجامعات والبرامج.</div>
                  )}
                </div>
              )}
            </div>
            {!!parseUniversitySelection(editForm.university).length && (
              <div className="multi-select-tags">
                {parseUniversitySelection(editForm.university).map(option => <Badge key={option} tone="purple">{option}</Badge>)}
              </div>
            )}
          </Field>

          <div className="field-full lead-documents-panel">
            <div className="documents-head compact-head">
              <div>
                <h3>مستندات الطالب</h3>
                <span>رفع وحفظ المستندات الأولية داخل بطاقة العميل مباشرة.</span>
              </div>
            </div>
            <form className="lead-document-upload" onSubmit={uploadLeadDocument}>
              <div className="lead-document-upload-grid">
                <Field label="نوع المستند">
                  <select value={leadDocumentType} onChange={event => setLeadDocumentType(event.target.value)}>
                    {leadDocumentOptions.map(option => <option key={option.name} value={option.name}>{tr(option.name)}</option>)}
                  </select>
                </Field>
                <Field label="اختر الملف">
                  <input type="file" onChange={event => setLeadDocumentFile(event.target.files?.[0] || null)} />
                </Field>
              </div>
              <div className="form-actions">
                <Button type="submit" disabled={!leadDocumentFile}><FileUp /> رفع المستند</Button>
              </div>
            </form>
            <div className="lead-document-checklist">
              {leadDocumentOptions.map(option => {
                const uploadedDocument = leadDocumentsByType.get(option.name);
                return (
                  <article key={option.name} className={`lead-document-check-card ${uploadedDocument ? 'is-uploaded' : ''}`}>
                    <div className="lead-document-check-head">
                      <div className="document-badges">
                        <Badge tone={option.required ? 'amber' : 'neutral'}>{option.required ? 'إلزامي' : 'اختياري'}</Badge>
                        <Badge tone={uploadedDocument ? 'green' : 'neutral'}>{uploadedDocument ? 'مرفوع' : 'غير مرفوع'}</Badge>
                      </div>
                      <strong>{tr(option.name)}</strong>
                    </div>
                    <p>{uploadedDocument ? uploadedDocument.originalName : 'لم يتم رفع هذا المستند بعد'}</p>
                    <div className="lead-document-check-foot">
                      <button className="icon-btn small" onClick={() => setLeadDocumentType(option.name)} type="button" title="اختيار هذا النوع للرفع">
                        <Paperclip size={14} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="lead-document-list">
              {(editingLead?.documents || []).map(document => (
                <article key={document.id} className="lead-document-item">
                  <div className="lead-document-meta">
                    <div className="doc-icon"><Paperclip /></div>
                    <div>
                      <strong>{document.originalName}</strong>
                      <span>{tr(document.type)} · {formatDate(document.uploadedAt)} · {document.uploadedBy}</span>
                    </div>
                  </div>
                  <div className="lead-document-actions">
                    {document.url ? <a href={document.url} target="_blank" rel="noreferrer">فتح</a> : null}
                    <button className="icon-btn small danger" onClick={() => deleteLeadDocument(document)} type="button" title="حذف">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </article>
              ))}
              {!(editingLead?.documents || []).length && (
                <div className="document-empty compact-empty">
                  <Paperclip />
                  <strong>لا توجد مستندات مرفوعة</strong>
                  <span>ابدأ برفع جواز السفر أو أي ملف تم استلامه من الطالب.</span>
                </div>
              )}
            </div>
          </div>

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
