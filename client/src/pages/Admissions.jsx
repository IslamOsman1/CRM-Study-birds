import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleDot, Clock3, File, FilePlus2, FileUp, GraduationCap, History, MessageSquareWarning, Search, ShieldCheck, Trash2, UploadCloud } from 'lucide-react';
import { api, formatDate, initials } from '../api.js';
import { Badge, Button, Card, Field, Modal, Progress, Spinner, Toast } from '../components/UI.jsx';
import { useAuth } from '../auth.jsx';
import { tr } from '../i18n.js';
import { can } from '../permissions.js';

const tone = status => (status.includes('Acceptance') ? 'green' : status.includes('Rejected') ? 'red' : status.includes('Submitted') || status.includes('Review') ? 'blue' : 'amber');
const documentTone = status => (
  status === 'Approved'
    ? 'green'
    : status === 'Rejected'
      ? 'red'
      : status === 'Needs Resubmission'
        ? 'amber'
        : 'blue'
);

const createBlank = {
  studentId: '',
  university: '',
  program: '',
  country: '',
  intake: '',
  assignedTo: '',
  status: 'Preparing Documents',
  notes: ''
};

const reviewBlank = {
  status: 'Approved',
  reviewNote: ''
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
  const [toast, setToast] = useState(null);

  const canCreateApplication = can(user.role, 'createApplication');
  const canUpdateStatus = can(user.role, 'updateApplicationStatus');
  const canUploadDocument = can(user.role, 'uploadDocument');
  const canReviewDocument = can(user.role, 'reviewDocument');
  const canDeleteDocument = can(user.role, 'deleteDocument');
  const canManageFollowUp = can(user.role, 'manageApplicationFollowUp');

  const load = () =>
    Promise.all([api('/api/applications'), api('/api/settings'), api('/api/students')])
      .then(([applications, settingData, studentData]) => {
        setApps(applications);
        setSettings(settingData);
        setStudents(studentData);
        if (selected) {
          const updated = applications.find(item => item.id === selected.id);
          setSelected(updated || applications[0] || null);
        } else {
          setSelected(applications[0] || null);
        }
      })
      .catch(error => setToast({ type: 'error', message: error.message }))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const shown = useMemo(() => {
    const base = apps.filter(app =>
      [app.student?.name, app.university, app.program, app.country, app.status, app.checklistTemplate?.name, app.workflowTemplate?.name]
        .some(value => String(value || '').toLowerCase().includes(query.toLowerCase()))
    );

    if (statusFilter === 'missing') return base.filter(app => (app.docsSummary?.missingTypes || []).length > 0);
    if (statusFilter === 'rejected') return base.filter(app => (app.docsSummary?.rejectedCount || 0) > 0);
    if (statusFilter === 'ready') return base.filter(app => (app.docsSummary?.missingTypes || []).length === 0 && (app.docsSummary?.rejectedCount || 0) === 0);

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

  const updateStatus = async (appId, status) => {
    try {
      await api(`/api/applications/${appId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await load();
      setToast({ message: 'تم تحديث حالة الطلب' });
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
      setToast({ message: 'تم رفع المستند بنجاح' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const createApplication = async event => {
    event.preventDefault();
    try {
      await api('/api/applications', { method: 'POST', body: JSON.stringify(createForm) });
      setCreateOpen(false);
      setCreateForm(createBlank);
      await load();
      setToast({ message: 'تم إنشاء طلب القبول بنجاح' });
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
      setToast({ message: 'تم حذف المستند' });
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

    try {
      await api(`/api/applications/${selected.id}/documents/${activeDocument.id}`, {
        method: 'PATCH',
        body: JSON.stringify(reviewForm)
      });
      setReviewOpen(false);
      setActiveDocument(null);
      await load();
      setToast({ message: 'تم حفظ مراجعة المستند' });
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
      setToast({ message: stage.done ? 'تمت إعادة فتح المرحلة' : 'تم إكمال المرحلة' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  if (loading) return <div className="loading-page"><Spinner />جارٍ تحميل الطلبات...</div>;

  return (
    <>
      <div className="admissions-layout">
        <Card className="applications-panel">
          <div className="panel-toolbar">
            <div className="search-box">
              <Search />
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث عن طلب..." />
            </div>
            <div className="toolbar-right">
              <Badge tone="purple">{shown.length} سجل</Badge>
              {canCreateApplication && <Button onClick={() => setCreateOpen(true)} type="button"><FilePlus2 /> طلب جديد</Button>}
            </div>
          </div>

          <div className="admissions-filters">
            {[
              ['all', 'كل الطلبات'],
              ['missing', 'الناقصة'],
              ['rejected', 'المرفوضة'],
              ['ready', 'الجاهزة']
            ].map(([value, label]) => (
              <button key={value} type="button" className={statusFilter === value ? 'filter-chip active' : 'filter-chip'} onClick={() => setStatusFilter(value)}>
                {label}
              </button>
            ))}
          </div>

          <div className="applications-list">
            {shown.map(app => (
              <button key={app.id} onClick={() => setSelected(app)} className={`application-row ${selected?.id === app.id ? 'selected' : ''}`} type="button">
                <div className="avatar soft">{initials(app.student?.name)}</div>
                <div className="application-main">
                  <div>
                    <strong>{app.student?.name}</strong>
                    <Badge tone={tone(app.status)}>{tr(app.status)}</Badge>
                  </div>
                  <p>{app.program}</p>
                  <span>{app.university} · {app.country}</span>
                  {app.workflowTemplate?.name && <small>متابعة: {app.workflowTemplate.name}</small>}
                  <div className="row-progress">
                    <Progress value={app.documentProgress} />
                    <small>{app.documentProgress}% اكتمال المستندات</small>
                  </div>
                  <div className="application-flags">
                    {(app.docsSummary?.missingTypes || []).length > 0 && <Badge tone="amber">ناقص {app.docsSummary.missingTypes.length}</Badge>}
                    {(app.followUpSummary?.pending || 0) > 0 && <Badge tone="blue">متابعة {app.followUpSummary.pending}</Badge>}
                    {(app.docsSummary?.approvedCount || 0) > 0 && <Badge tone="green">معتمد {app.docsSummary.approvedCount}</Badge>}
                  </div>
                </div>
                <div className="app-date">
                  <span>{app.intake}</span>
                  <small>{formatDate(app.updatedAt)}</small>
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="application-detail">
          {selected ? (
            <>
              <div className="detail-hero">
                <div className="hero-icon"><GraduationCap /></div>
                <div>
                  <p className="eyebrow">طلب الطالب</p>
                  <h2>{selected.student?.name}</h2>
                  <span>{selected.program} في {selected.university}</span>
                </div>
                <Badge tone={tone(selected.status)}>{tr(selected.status)}</Badge>
              </div>

              <div className="detail-grid">
                <div><span>الوجهة</span><strong>{selected.country}</strong></div>
                <div><span>الفصل الدراسي</span><strong>{selected.intake}</strong></div>
                <div><span>المسؤول المختص</span><strong>{settings?.employees.find(employee => employee.id === selected.assignedTo)?.name || 'غير مسند'}</strong></div>
                <div><span>آخر تحديث</span><strong>{formatDate(selected.updatedAt)}</strong></div>
              </div>

              <div className="status-control">
                <Field label="حالة الطلب">
                  <select disabled={!canUpdateStatus} value={selected.status} onChange={event => updateStatus(selected.id, event.target.value)}>
                    {settings?.applicationStatuses.map(status => <option key={status} value={status}>{tr(status)}</option>)}
                  </select>
                </Field>
                <div>
                  <span>اكتمال المستندات</span>
                  <strong>{selected.documentProgress}%</strong>
                  <Progress value={selected.documentProgress} />
                </div>
              </div>

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
                  <div><strong>{selected.followUpSummary?.pending || 0}</strong><span>مهام متابعة مفتوحة</span></div>
                </div>
                <div className="summary-tile soft">
                  <History />
                  <div><strong>{archivedDocuments.length}</strong><span>نسخ سابقة</span></div>
                </div>
              </div>

              <div className="notes-box">
                <strong>{selected.checklistTemplate?.name ? 'القالب المطبق على هذا الطلب' : 'المتطلبات الافتراضية المطبقة'}</strong>
                <p>{selected.checklistTemplate?.name ? `${selected.checklistTemplate.name} · ${selected.checklistTemplate.university || 'كل الجامعات'} · ${selected.checklistTemplate.program || 'كل البرامج'} · ${selected.checklistTemplate.country || 'كل الدول'}` : 'لا يوجد قالب مخصص مطابق، لذلك يتم استخدام قائمة المستندات الافتراضية.'}</p>
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

              <div className="notes-box">
                <strong>{selected.workflowTemplate?.name ? 'قالب المتابعة المطبق' : 'لا توجد مراحل متابعة مخصصة'}</strong>
                <p>{selected.workflowTemplate?.name ? `${selected.workflowTemplate.name} · تُحوّل المراحل غير المكتملة تلقائيًا إلى مهام داخل النظام.` : 'يمكنك إضافة قالب متابعة من صفحة الإعدادات لربط الجامعة بخطوات تشغيلية تلقائية.'}</p>
              </div>

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
                          <Badge tone="neutral">بعد {stage.dueOffsetDays || 0} يوم</Badge>
                        </div>
                      </div>
                      {stage.completedAt && <small>اكتملت في {formatDate(stage.completedAt)} بواسطة {stage.completedBy}</small>}
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

              {!!selected.docsSummary?.missingTypes?.length && (
                <div className="notes-box">
                  <strong>المستندات المطلوبة الناقصة</strong>
                  <p>{selected.docsSummary.missingTypes.map(typeName => tr(typeName)).join('، ')}</p>
                </div>
              )}

              <div className="documents-head">
                <div>
                  <h3>المستندات الحالية</h3>
                  <span>النسخة الأحدث من كل مستند تظهر هنا مع حالة المراجعة.</span>
                </div>
                {canUploadDocument && <Button onClick={() => setUploadOpen(true)} type="button"><FileUp /> رفع ملف</Button>}
              </div>

              <div className="document-grid">
                {currentDocuments.map(doc => (
                  <article key={doc.id} className="document-card document-card-rich">
                    <div className="doc-icon"><File /></div>
                    <div>
                      <div className="document-line">
                        <strong>{tr(doc.type)}</strong>
                        <div className="document-badges">
                          <Badge tone={documentTone(doc.status)}>{tr(doc.status)}</Badge>
                          <Badge tone="neutral">v{doc.version || 1}</Badge>
                        </div>
                      </div>
                      <span>{doc.originalName}</span>
                      <small>{formatDate(doc.uploadedAt)} · {doc.uploadedBy}</small>
                      {doc.reviewNote && <p className="document-note">{doc.reviewNote}</p>}
                    </div>
                    <div className="document-actions">
                      {doc.url ? <a target="_blank" rel="noreferrer" href={doc.url}>فتح</a> : <Badge tone="neutral">بدون ملف</Badge>}
                      {canReviewDocument && <button className="icon-btn small" onClick={() => openReview(doc)} type="button" title="مراجعة المستند"><ShieldCheck size={14} /></button>}
                      {canDeleteDocument && <button className="icon-btn small danger" onClick={() => deleteDocument(doc)} type="button" title="حذف المستند"><Trash2 size={14} /></button>}
                    </div>
                  </article>
                ))}

                {currentDocuments.length === 0 && (
                  <div className="document-empty">
                    <UploadCloud />
                    <strong>لا توجد مستندات مرفوعة</strong>
                    <span>ابدأ بجواز السفر أو كشف الدرجات حسب متطلبات الجامعة.</span>
                  </div>
                )}
              </div>

              {!!archivedDocuments.length && (
                <div className="student-section">
                  <div className="documents-head compact-head">
                    <div>
                      <h3>سجل النسخ السابقة</h3>
                      <span>كل رفع جديد لنفس النوع يحتفظ بالنسخ الأقدم للرجوع إليها.</span>
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

              {selected.notes && <div className="notes-box"><strong>ملاحظة داخلية</strong><p>{selected.notes}</p></div>}
            </>
          ) : (
            <div className="select-placeholder">
              <GraduationCap />
              <h3>اختر طلبًا</h3>
              <p>اختر طالبًا من القائمة لمراجعة المستندات وتحديث حالة التقديم الجامعي.</p>
            </div>
          )}
        </Card>
      </div>

      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="رفع مستند للطالب" subtitle={selected ? `إرفاق ملف في طلب ${selected.student?.name}.` : ''}>
        <form className="stack-form" onSubmit={upload}>
          <Field label="نوع المستند">
            <select value={type} onChange={event => setType(event.target.value)}>
              {uploadOptions.map(item => <option key={item.name} value={item.name}>{tr(item.name)}</option>)}
            </select>
          </Field>
          <Field label="اختر الملف" hint="إذا كان هناك مستند من نفس النوع فسيتم حفظه كإصدار جديد">
            <input required type="file" onChange={event => setFile(event.target.files[0])} />
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
          <Field label="ملاحظة المراجع">
            <textarea value={reviewForm.reviewNote} onChange={event => setReviewForm({ ...reviewForm, reviewNote: event.target.value })} />
          </Field>
          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={() => setReviewOpen(false)}>إلغاء</Button>
            <Button type="submit">حفظ المراجعة</Button>
          </div>
        </form>
      </Modal>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="إنشاء طلب قبول جديد" subtitle="إضافة طلب يدوي لطالب موجود في النظام" size="lg">
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
          <Field label="الفصل الدراسي"><input value={createForm.intake} onChange={event => setCreateForm({ ...createForm, intake: event.target.value })} placeholder="مثال: Spring 2027" /></Field>
          <Field label="المسؤول المختص">
            <select value={createForm.assignedTo} onChange={event => setCreateForm({ ...createForm, assignedTo: event.target.value })}>
              <option value="">غير مسند</option>
              {admissionsEmployees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
            </select>
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
