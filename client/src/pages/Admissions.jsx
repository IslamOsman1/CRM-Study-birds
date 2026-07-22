import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleDot, Clock3, Eye, EyeOff, File, FilePlus2, FileUp, GraduationCap, History, KeyRound, Link as LinkIcon, Save, Search, ShieldCheck, Trash2, UploadCloud, WalletCards } from 'lucide-react';
import { api, formatDate, initials } from '../api.js';
import { Badge, Button, Card, Field, Modal, Progress, Spinner, Toast } from '../components/UI.jsx';
import { useAuth } from '../auth.jsx';
import { tr } from '../i18n.js';
import { can } from '../permissions.js';

const tone = status => (status.includes('Acceptance') ? 'green' : status.includes('Rejected') ? 'red' : status.includes('Submitted') || status.includes('Review') ? 'blue' : 'amber');
const seasons = ['Fall', 'Spring', 'Summer'];
const currentYear = 2026;

const createBlank = {
  studentId: '',
  university: '',
  program: '',
  country: '',
  intakeSeason: 'Fall',
  intakeYear: String(currentYear),
  applicationRefNo: '',
  portalUrl: '',
  portalUsername: '',
  portalPassword: '',
  assignedTo: '',
  status: 'Preparing Documents',
  offerType: '',
  offerConditions: '',
  rejectionReason: '',
  notes: ''
};

const reviewBlank = {
  status: 'Approved',
  reviewNote: ''
};

const joinIntake = (season, year) => `${season} ${year}`.trim();
const splitIntake = intake => {
  const [season = 'Fall', year = String(currentYear)] = String(intake || '').split(' ');
  return { intakeSeason: seasons.includes(season) ? season : 'Fall', intakeYear: year || String(currentYear) };
};

function getChecklistStatus(typeName, currentDocuments) {
  const document = currentDocuments.find(item => item.type === typeName);
  if (!document) return { tone: 'neutral', label: 'غير مرفوع' };
  if (document.status === 'Approved') return { tone: 'green', label: 'معتمد' };
  if (document.status === 'Rejected') return { tone: 'red', label: 'مرفوض' };
  if (document.status === 'Needs Resubmission') return { tone: 'amber', label: 'يحتاج إعادة رفع' };
  return { tone: 'blue', label: 'قيد المراجعة' };
}

export default function Admissions() {
  const { user } = useAuth();
  const [apps, setApps] = useState([]);
  const [settings, setSettings] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detailForm, setDetailForm] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [type, setType] = useState('Passport');
  const [activeDocument, setActiveDocument] = useState(null);
  const [reviewForm, setReviewForm] = useState(reviewBlank);
  const [createForm, setCreateForm] = useState(createBlank);
  const [showPortalPassword, setShowPortalPassword] = useState(false);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [toast, setToast] = useState(null);

  const canCreateApplication = can(user.role, 'createApplication');
  const canUpdateStatus = can(user.role, 'updateApplicationStatus');
  const canUploadDocument = can(user.role, 'uploadDocument');
  const canReviewDocument = can(user.role, 'reviewDocument');
  const canDeleteDocument = can(user.role, 'deleteDocument');
  const canManageFollowUp = can(user.role, 'manageApplicationFollowUp');

  const applySelection = applications => {
    const nextSelected = selected ? applications.find(item => item.id === selected.id) || applications[0] || null : applications[0] || null;
    setSelected(nextSelected);
    if (nextSelected) {
      const intake = splitIntake(nextSelected.intake);
      setDetailForm({
        university: nextSelected.university || '',
        program: nextSelected.program || '',
        country: nextSelected.country || '',
        status: nextSelected.status || 'Preparing Documents',
        assignedTo: nextSelected.assignedTo || '',
        applicationRefNo: nextSelected.applicationRefNo || '',
        portalUrl: nextSelected.portalUrl || '',
        portalUsername: nextSelected.portalUsername || '',
        portalPassword: nextSelected.portalPassword || '',
        intakeSeason: intake.intakeSeason,
        intakeYear: intake.intakeYear,
        offerType: nextSelected.offerType || '',
        offerConditions: nextSelected.offerConditions || '',
        rejectionReason: nextSelected.rejectionReason || '',
        notes: nextSelected.notes || ''
      });
    } else {
      setDetailForm(null);
    }
  };

  const load = () =>
    Promise.all([api('/api/applications'), api('/api/settings'), api('/api/students')])
      .then(([applications, settingData, studentData]) => {
        setApps(applications);
        setSettings(settingData);
        setStudents(studentData);
        applySelection(applications);
      })
      .catch(error => setToast({ type: 'error', message: error.message }))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const shown = useMemo(() => {
    const base = apps.filter(app =>
      [
        app.student?.name,
        app.university,
        app.program,
        app.country,
        app.status,
        app.applicationRefNo,
        app.intake
      ].some(value => String(value || '').toLowerCase().includes(query.toLowerCase()))
    );

    if (statusFilter === 'missing') return base.filter(app => (app.docsSummary?.missingTypes || []).length > 0);
    if (statusFilter === 'rejected') return base.filter(app => (app.docsSummary?.rejectedCount || 0) > 0 || app.status === 'Rejected');
    if (statusFilter === 'accepted') return base.filter(app => ['Conditional Acceptance', 'Final Acceptance'].includes(app.status));
    return base;
  }, [apps, query, statusFilter]);

  const admissionsEmployees = settings?.employees.filter(employee => employee.department === 'Admissions') || [];
  const currentDocuments = selected?.currentDocuments || [];
  const archivedDocuments = (selected?.documents || []).filter(doc => doc.current === false);
  const effectiveDocumentTypes = selected?.effectiveDocumentTypes || settings?.documentTypes || [];
  const effectiveFollowUpStages = selected?.effectiveFollowUpStages || [];
  const uploadOptions = useMemo(() => {
    const map = new Map();
    [...effectiveDocumentTypes, ...(settings?.documentTypes || [])].forEach(item => {
      if (item?.name && !map.has(item.name)) map.set(item.name, item);
    });
    return [...map.values()];
  }, [effectiveDocumentTypes, settings?.documentTypes]);

  useEffect(() => {
    if (uploadOptions.length && !uploadOptions.some(item => item.name === type)) {
      setType(uploadOptions[0].name);
    }
  }, [type, uploadOptions]);

  const selectApplication = application => {
    setSelected(application);
    const intake = splitIntake(application.intake);
    setDetailForm({
      university: application.university || '',
      program: application.program || '',
      country: application.country || '',
      status: application.status || 'Preparing Documents',
      assignedTo: application.assignedTo || '',
      applicationRefNo: application.applicationRefNo || '',
      portalUrl: application.portalUrl || '',
      portalUsername: application.portalUsername || '',
      portalPassword: application.portalPassword || '',
      intakeSeason: intake.intakeSeason,
      intakeYear: intake.intakeYear,
      offerType: application.offerType || '',
      offerConditions: application.offerConditions || '',
      rejectionReason: application.rejectionReason || '',
      notes: application.notes || ''
    });
    setShowPortalPassword(false);
  };

  const saveApplicationDetails = async event => {
    event.preventDefault();
    if (!selected || !detailForm) return;

    const payload = {
      university: detailForm.university,
      program: detailForm.program,
      country: detailForm.country,
      status: detailForm.status,
      assignedTo: detailForm.assignedTo,
      applicationRefNo: detailForm.applicationRefNo,
      portalUrl: detailForm.portalUrl,
      portalUsername: detailForm.portalUsername,
      portalPassword: detailForm.portalPassword,
      intake: joinIntake(detailForm.intakeSeason, detailForm.intakeYear),
      offerType: detailForm.offerType,
      offerConditions: detailForm.offerConditions,
      rejectionReason: detailForm.rejectionReason,
      notes: detailForm.notes
    };

    try {
      await api(`/api/applications/${selected.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      await load();
      setToast({ message: 'تم حفظ بيانات الطلب الجامعي.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const upload = async event => {
    event.preventDefault();
    if (!file || !selected) return;
    const body = new FormData();
    body.append('file', file);
    body.append('type', type);

    try {
      await api(`/api/applications/${selected.id}/documents`, { method: 'POST', body });
      setUploadOpen(false);
      setFile(null);
      await load();
      setToast({ message: 'تم رفع المستند بنجاح.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const createApplication = async event => {
    event.preventDefault();
    try {
      await api('/api/applications', {
        method: 'POST',
        body: JSON.stringify({
          ...createForm,
          intake: joinIntake(createForm.intakeSeason, createForm.intakeYear)
        })
      });
      setCreateOpen(false);
      setCreateForm(createBlank);
      await load();
      setToast({ message: 'تم إنشاء طلب تقديم جديد داخل ملف الطالب.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const deleteDocument = async document => {
    if (!selected) return;
    if (!window.confirm(`هل تريد حذف المستند ${tr(document.type)}؟`)) return;

    try {
      await api(`/api/applications/${selected.id}/documents/${document.id}`, { method: 'DELETE' });
      await load();
      setToast({ message: 'تم حذف المستند.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const openReview = document => {
    setActiveDocument(document);
    setReviewForm({
      status: document.status === 'Pending Review' ? 'Approved' : document.status,
      reviewNote: document.reviewNote || ''
    });
    setReviewOpen(true);
  };

  const submitReview = async event => {
    event.preventDefault();
    if (!selected || !activeDocument) return;
    if (reviewForm.status === 'Rejected' && !reviewForm.reviewNote.trim()) {
      setToast({ type: 'error', message: 'سبب الرفض مطلوب عند رفض المستند.' });
      return;
    }

    try {
      await api(`/api/applications/${selected.id}/documents/${activeDocument.id}`, {
        method: 'PATCH',
        body: JSON.stringify(reviewForm)
      });
      setReviewOpen(false);
      setActiveDocument(null);
      await load();
      setToast({ message: 'تم حفظ مراجعة المستند.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const toggleFollowUpStage = async stage => {
    if (!selected) return;
    try {
      await api(`/api/applications/${selected.id}/follow-up/${stage.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ done: !stage.done, note: stage.note || '' })
      });
      await load();
      setToast({ message: stage.done ? 'تمت إعادة فتح المرحلة.' : 'تم إكمال المرحلة.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  if (loading) return <div className="loading-page"><Spinner />جارٍ تحميل طلبات القبول...</div>;

  return (
    <>
      <div className="admissions-layout">
        <Card className="applications-panel">
          <div className="panel-toolbar">
            <div className="search-box">
              <Search />
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث عن طلب أو جامعة..." />
            </div>
            <div className="toolbar-right">
              <Badge tone="purple">{shown.length} طلب</Badge>
              {canCreateApplication && <Button onClick={() => setCreateOpen(true)} type="button"><FilePlus2 /> طلب جديد</Button>}
            </div>
          </div>

          <div className="admissions-filters">
            {[
              ['all', 'كل الطلبات'],
              ['missing', 'الناقصة'],
              ['rejected', 'المرفوضة'],
              ['accepted', 'المقبولة']
            ].map(([value, label]) => (
              <button key={value} type="button" className={statusFilter === value ? 'filter-chip active' : 'filter-chip'} onClick={() => setStatusFilter(value)}>
                {label}
              </button>
            ))}
          </div>

          <div className="applications-list">
            {shown.map(app => (
              <button key={app.id} onClick={() => selectApplication(app)} className={`application-row ${selected?.id === app.id ? 'selected' : ''}`} type="button">
                <div className="avatar soft">{initials(app.student?.name)}</div>
                <div className="application-main">
                  <div>
                    <strong>{app.student?.name}</strong>
                    <Badge tone={tone(app.status)}>{tr(app.status)}</Badge>
                  </div>
                  <p>{app.program}</p>
                  <span>{app.university} · {app.country}</span>
                  <small>{app.applicationRefNo || 'بدون رقم مرجعي'} · {app.intake || 'Intake غير محدد'}</small>
                  <div className="row-progress">
                    <Progress value={app.documentProgress} />
                    <small>{app.documentProgress}% اكتمال المستندات</small>
                  </div>
                  <div className="application-flags">
                    {(app.docsSummary?.missingTypes || []).length > 0 && <Badge tone="amber">ناقص {app.docsSummary.missingTypes.length}</Badge>}
                    {(app.docsSummary?.rejectedCount || 0) > 0 && <Badge tone="red">مرفوض {app.docsSummary.rejectedCount}</Badge>}
                    <Badge tone={app.applicationFeeStatus === 'Paid' ? 'green' : 'red'}>{app.applicationFeeStatus === 'Paid' ? 'رسوم التقديم مدفوعة' : 'رسوم التقديم غير مدفوعة'}</Badge>
                  </div>
                </div>
                <div className="app-date">
                  <span>{app.offerType ? tr(app.offerType) : app.intake}</span>
                  <small>{formatDate(app.updatedAt)}</small>
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="application-detail">
          {selected && detailForm ? (
            <>
              <div className="detail-hero">
                <div className="hero-icon"><GraduationCap /></div>
                <div>
                  <p className="eyebrow">طلب تقديم جامعي مستقل</p>
                  <h2>{selected.student?.name}</h2>
                  <span>{selected.program} في {selected.university}</span>
                </div>
                <Badge tone={tone(selected.status)}>{tr(selected.status)}</Badge>
              </div>

              <div className="detail-grid">
                <div><span>رقم الطلب</span><strong>{selected.applicationRefNo || '—'}</strong></div>
                <div><span>الفصل الدراسي</span><strong>{selected.intake || '—'}</strong></div>
                <div><span>المسؤول المختص</span><strong>{settings?.employees.find(employee => employee.id === selected.assignedTo)?.name || 'غير مسند'}</strong></div>
                <div><span>رسوم التقديم</span><strong>{selected.applicationFeeStatus === 'Paid' ? 'مدفوع' : 'غير مدفوع'}</strong></div>
              </div>

              <form className="form-grid admissions-edit-grid" onSubmit={saveApplicationDetails}>
                <Field label="الجامعة"><input required value={detailForm.university} onChange={event => setDetailForm({ ...detailForm, university: event.target.value })} /></Field>
                <Field label="البرنامج"><input required value={detailForm.program} onChange={event => setDetailForm({ ...detailForm, program: event.target.value })} /></Field>
                <Field label="الدولة"><input required value={detailForm.country} onChange={event => setDetailForm({ ...detailForm, country: event.target.value })} /></Field>
                <Field label="رقم الطلب في الجامعة"><input value={detailForm.applicationRefNo} onChange={event => setDetailForm({ ...detailForm, applicationRefNo: event.target.value })} /></Field>
                <Field label="Intake">
                  <div className="dual-input">
                    <select value={detailForm.intakeSeason} onChange={event => setDetailForm({ ...detailForm, intakeSeason: event.target.value })}>
                      {seasons.map(option => <option value={option} key={option}>{option}</option>)}
                    </select>
                    <input type="number" min="2026" value={detailForm.intakeYear} onChange={event => setDetailForm({ ...detailForm, intakeYear: event.target.value })} />
                  </div>
                </Field>
                <Field label="المسؤول المختص">
                  <select value={detailForm.assignedTo} onChange={event => setDetailForm({ ...detailForm, assignedTo: event.target.value })}>
                    <option value="">غير مسند</option>
                    {admissionsEmployees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                  </select>
                </Field>
                <Field label="حالة الطلب">
                  <select disabled={!canUpdateStatus} value={detailForm.status} onChange={event => setDetailForm({ ...detailForm, status: event.target.value })}>
                    {settings?.applicationStatuses.map(status => <option key={status} value={status}>{tr(status)}</option>)}
                  </select>
                </Field>
                <Field label="رابط بورتال الجامعة">
                  <div className="inline-icon-input">
                    <LinkIcon size={15} />
                    <input value={detailForm.portalUrl} onChange={event => setDetailForm({ ...detailForm, portalUrl: event.target.value })} placeholder="https://..." />
                  </div>
                </Field>
                <Field label="Username البورتال">
                  <div className="inline-icon-input">
                    <KeyRound size={15} />
                    <input value={detailForm.portalUsername} onChange={event => setDetailForm({ ...detailForm, portalUsername: event.target.value })} />
                  </div>
                </Field>
                <Field label="Password البورتال">
                  <div className="password-field">
                    <input type={showPortalPassword ? 'text' : 'password'} value={detailForm.portalPassword} onChange={event => setDetailForm({ ...detailForm, portalPassword: event.target.value })} />
                    <button className="icon-btn small" type="button" onClick={() => setShowPortalPassword(value => !value)}>
                      {showPortalPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </Field>

                {['Conditional Acceptance', 'Final Acceptance', 'Rejected'].includes(detailForm.status) && (
                  <Field label="نوع قرار الجامعة" className="field-full">
                    <select value={detailForm.offerType} onChange={event => setDetailForm({ ...detailForm, offerType: event.target.value })}>
                      <option value="">اختر نوع القرار</option>
                      <option value="Conditional Offer">Conditional Offer</option>
                      <option value="Unconditional Offer">Unconditional Offer</option>
                      <option value="Rejected">Rejected</option>
                    </select>
                  </Field>
                )}

                {detailForm.offerType === 'Conditional Offer' && (
                  <Field label="شروط القبول المشروط" className="field-full">
                    <textarea value={detailForm.offerConditions} onChange={event => setDetailForm({ ...detailForm, offerConditions: event.target.value })} />
                  </Field>
                )}

                {detailForm.offerType === 'Rejected' && (
                  <Field label="سبب الرفض" className="field-full">
                    <textarea value={detailForm.rejectionReason} onChange={event => setDetailForm({ ...detailForm, rejectionReason: event.target.value })} />
                  </Field>
                )}

                <Field label="ملاحظات داخلية" className="field-full">
                  <textarea value={detailForm.notes} onChange={event => setDetailForm({ ...detailForm, notes: event.target.value })} />
                </Field>

                <div className="form-actions field-full">
                  <Button type="submit"><Save /> حفظ بيانات الطلب</Button>
                </div>
              </form>

              <div className="admissions-summary-grid">
                <div className="summary-tile">
                  <CheckCircle2 />
                  <div><strong>{selected.docsSummary?.approvedCount || 0}</strong><span>مستندات معتمدة</span></div>
                </div>
                <div className="summary-tile warning">
                  <AlertTriangle />
                  <div><strong>{selected.docsSummary?.missingTypes?.length || 0}</strong><span>مستندات ناقصة</span></div>
                </div>
                <div className="summary-tile soft">
                  <Clock3 />
                  <div><strong>{selected.followUpSummary?.pending || 0}</strong><span>مهام متابعة</span></div>
                </div>
                <div className="summary-tile soft">
                  <WalletCards />
                  <div><strong>{selected.applicationFeeStatus === 'Paid' ? 'مدفوع' : 'غير مدفوع'}</strong><span>حالة سداد رسوم التقديم</span></div>
                </div>
              </div>

              <div className="document-grid checklist-grid">
                {effectiveDocumentTypes.map(item => {
                  const current = currentDocuments.find(doc => doc.type === item.name);
                  const statusBadge = getChecklistStatus(item.name, currentDocuments);
                  return (
                    <article key={item.name} className={`document-card checklist-card ${item.required ? 'required' : 'optional'}`}>
                      <div className="doc-icon"><CircleDot /></div>
                      <div>
                        <div className="document-line">
                          <strong>{tr(item.name)}</strong>
                          <div className="document-badges">
                            <Badge tone={item.required ? 'amber' : 'neutral'}>{item.required ? 'إلزامي' : 'اختياري'}</Badge>
                            <Badge tone={statusBadge.tone}>{statusBadge.label}</Badge>
                          </div>
                        </div>
                        <span>{current ? current.originalName : 'لم يتم رفع هذا المستند بعد'}</span>
                        {current?.reviewNote && <p className="document-note">{current.reviewNote}</p>}
                      </div>
                    </article>
                  );
                })}
              </div>

              {!!selected.offerType && (
                <div className="notes-box">
                  <strong>قرار القبول الحالي</strong>
                  <p>
                    {selected.offerType === 'Conditional Offer' && `قبول مشروط: ${selected.offerConditions || 'لم تُكتب الشروط بعد'}`}
                    {selected.offerType === 'Unconditional Offer' && 'قبول نهائي غير مشروط.'}
                    {selected.offerType === 'Rejected' && `مرفوض: ${selected.rejectionReason || 'لم يُكتب السبب بعد'}`}
                  </p>
                </div>
              )}

              {!!effectiveFollowUpStages.length && (
                <div className="templates-stack">
                  {effectiveFollowUpStages.map(stage => (
                    <article key={stage.id} className="template-card">
                      <div className="template-card-head">
                        <div>
                          <h3>{stage.title}</h3>
                          <span>{stage.description || 'بدون وصف'} · {tr(stage.assignedRole)} · {stage.priority}</span>
                        </div>
                        <div className="document-badges">
                          <Badge tone={stage.done ? 'green' : 'blue'}>{stage.done ? 'مكتملة' : 'مفتوحة'}</Badge>
                        </div>
                      </div>
                      {canManageFollowUp && (
                        <div className="task-actions">
                          <Button type="button" variant={stage.done ? 'secondary' : 'ghost'} onClick={() => toggleFollowUpStage(stage)}>
                            <Clock3 /> {stage.done ? 'إعادة فتح المرحلة' : 'تعليم كمكتملة'}
                          </Button>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}

              <div className="documents-head">
                <div>
                  <h3>المستندات الحالية</h3>
                  <span>كل طلب له مستنداته الخاصة بصورة مستقلة.</span>
                </div>
                {canUploadDocument && <Button onClick={() => setUploadOpen(true)} type="button"><FileUp /> رفع مستند</Button>}
              </div>

              <div className="document-grid">
                {currentDocuments.map(doc => (
                  <article key={doc.id} className="document-card document-card-rich">
                    <div className="doc-icon"><File /></div>
                    <div>
                      <div className="document-line">
                        <strong>{tr(doc.type)}</strong>
                        <div className="document-badges">
                          <Badge tone={doc.status === 'Approved' ? 'green' : doc.status === 'Rejected' ? 'red' : 'blue'}>{tr(doc.status)}</Badge>
                          <Badge tone="neutral">v{doc.version || 1}</Badge>
                        </div>
                      </div>
                      <span>{doc.originalName}</span>
                      <small>{formatDate(doc.uploadedAt)} · {doc.uploadedBy}</small>
                      {doc.reviewNote && <p className="document-note">{doc.reviewNote}</p>}
                    </div>
                    <div className="document-actions">
                      {doc.url ? <a target="_blank" rel="noreferrer" href={doc.url}>فتح</a> : <Badge tone="neutral">بدون ملف</Badge>}
                      {canReviewDocument && <button className="icon-btn small" onClick={() => openReview(doc)} type="button"><ShieldCheck size={14} /></button>}
                      {canDeleteDocument && <button className="icon-btn small danger" onClick={() => deleteDocument(doc)} type="button"><Trash2 size={14} /></button>}
                    </div>
                  </article>
                ))}

                {currentDocuments.length === 0 && (
                  <div className="document-empty">
                    <UploadCloud />
                    <strong>لا توجد مستندات مرفوعة</strong>
                    <span>يمكنك رفع مستندات هذا الطلب بشكل مستقل عن باقي طلبات الطالب.</span>
                  </div>
                )}
              </div>

              {!!archivedDocuments.length && (
                <div className="student-section">
                  <div className="documents-head compact-head">
                    <div>
                      <h3>النسخ السابقة</h3>
                      <span>الاحتفاظ بالإصدارات القديمة للمستندات.</span>
                    </div>
                  </div>
                  <div className="document-grid">
                    {archivedDocuments.map(doc => (
                      <article key={doc.id} className="document-card archived-document">
                        <div className="doc-icon"><History /></div>
                        <div>
                          <strong>{tr(doc.type)} · v{doc.version || 1}</strong>
                          <span>{doc.originalName}</span>
                          <small>{formatDate(doc.uploadedAt)} · {doc.uploadedBy}</small>
                        </div>
                        <div className="document-actions">
                          {doc.url ? <a target="_blank" rel="noreferrer" href={doc.url}>فتح</a> : <Badge tone="neutral">بدون ملف</Badge>}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="select-placeholder">
              <GraduationCap />
              <h3>اختر طلبًا</h3>
              <p>اختر أحد طلبات الطالب لمراجعة القبول والمستندات وبيانات بوابة الجامعة.</p>
            </div>
          )}
        </Card>
      </div>

      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="رفع مستند للطلب" subtitle={selected ? `${selected.student?.name} · ${selected.university}` : ''}>
        <form className="stack-form" onSubmit={upload}>
          <Field label="نوع المستند">
            <select value={type} onChange={event => setType(event.target.value)}>
              {uploadOptions.map(item => <option key={item.name} value={item.name}>{tr(item.name)}</option>)}
            </select>
          </Field>
          <Field label="اختر الملف">
            <input required type="file" onChange={event => setFile(event.target.files?.[0] || null)} />
          </Field>
          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={() => setUploadOpen(false)}>إلغاء</Button>
            <Button type="submit"><UploadCloud /> رفع المستند</Button>
          </div>
        </form>
      </Modal>

      <Modal open={reviewOpen} onClose={() => setReviewOpen(false)} title="مراجعة المستند" subtitle={activeDocument ? `${tr(activeDocument.type)} · الإصدار ${activeDocument.version || 1}` : ''}>
        <form className="stack-form" onSubmit={submitReview}>
          <Field label="حالة المراجعة">
            <select value={reviewForm.status} onChange={event => setReviewForm({ ...reviewForm, status: event.target.value })}>
              <option value="Pending Review">قيد المراجعة</option>
              <option value="Approved">معتمد</option>
              <option value="Rejected">مرفوض</option>
              <option value="Needs Resubmission">يحتاج إعادة رفع</option>
            </select>
          </Field>
          <Field label="ملاحظة المراجعة">
            <textarea value={reviewForm.reviewNote} onChange={event => setReviewForm({ ...reviewForm, reviewNote: event.target.value })} />
          </Field>
          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={() => setReviewOpen(false)}>إلغاء</Button>
            <Button type="submit">حفظ المراجعة</Button>
          </div>
        </form>
      </Modal>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="إنشاء طلب تقديم جديد" subtitle="الطالب الواحد يمكنه امتلاك أكثر من طلب مستقل" size="lg">
        <form className="form-grid" onSubmit={createApplication}>
          <Field label="الطالب" className="field-full">
            <select required value={createForm.studentId} onChange={event => setCreateForm({ ...createForm, studentId: event.target.value })}>
              <option value="">اختر الطالب</option>
              {students.map(student => <option key={student.id} value={student.id}>{student.name}</option>)}
            </select>
          </Field>
          <Field label="الجامعة"><input required value={createForm.university} onChange={event => setCreateForm({ ...createForm, university: event.target.value })} /></Field>
          <Field label="البرنامج"><input required value={createForm.program} onChange={event => setCreateForm({ ...createForm, program: event.target.value })} /></Field>
          <Field label="الدولة"><input required value={createForm.country} onChange={event => setCreateForm({ ...createForm, country: event.target.value })} /></Field>
          <Field label="رقم الطلب في الجامعة"><input value={createForm.applicationRefNo} onChange={event => setCreateForm({ ...createForm, applicationRefNo: event.target.value })} /></Field>
          <Field label="Intake">
            <div className="dual-input">
              <select value={createForm.intakeSeason} onChange={event => setCreateForm({ ...createForm, intakeSeason: event.target.value })}>
                {seasons.map(option => <option value={option} key={option}>{option}</option>)}
              </select>
              <input type="number" min="2026" value={createForm.intakeYear} onChange={event => setCreateForm({ ...createForm, intakeYear: event.target.value })} />
            </div>
          </Field>
          <Field label="المسؤول المختص">
            <select value={createForm.assignedTo} onChange={event => setCreateForm({ ...createForm, assignedTo: event.target.value })}>
              <option value="">غير مسند</option>
              {admissionsEmployees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
            </select>
          </Field>
          <Field label="رابط البورتال"><input value={createForm.portalUrl} onChange={event => setCreateForm({ ...createForm, portalUrl: event.target.value })} /></Field>
          <Field label="Username البورتال"><input value={createForm.portalUsername} onChange={event => setCreateForm({ ...createForm, portalUsername: event.target.value })} /></Field>
          <Field label="Password البورتال">
            <div className="password-field">
              <input type={showCreatePassword ? 'text' : 'password'} value={createForm.portalPassword} onChange={event => setCreateForm({ ...createForm, portalPassword: event.target.value })} />
              <button className="icon-btn small" type="button" onClick={() => setShowCreatePassword(value => !value)}>
                {showCreatePassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </Field>
          <Field label="حالة الطلب">
            <select value={createForm.status} onChange={event => setCreateForm({ ...createForm, status: event.target.value })}>
              {settings?.applicationStatuses.map(status => <option key={status} value={status}>{tr(status)}</option>)}
            </select>
          </Field>
          <Field label="ملاحظات" className="field-full">
            <textarea value={createForm.notes} onChange={event => setCreateForm({ ...createForm, notes: event.target.value })} />
          </Field>
          <div className="form-actions field-full">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>إلغاء</Button>
            <Button type="submit">إنشاء الطلب</Button>
          </div>
        </form>
      </Modal>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
