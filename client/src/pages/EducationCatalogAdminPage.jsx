import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Plus, Save, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { Button, Card, Field, Modal, Spinner, Toast } from '../components/UI.jsx';
import { useAuth } from '../auth.jsx';
import { can } from '../permissions.js';

function createCountry() {
  return {
    id: `country-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    code: ''
  };
}

function createUniversity() {
  return {
    id: `university-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    country: '',
    city: '',
    website: '',
    address: ''
  };
}

function createProgram() {
  return {
    id: `program-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    university: '',
    country: '',
    city: '',
    degree: '',
    department: '',
    language: '',
    availability: 'Available',
    fees: '',
    discount_fees: '',
    deposit_amount: '',
    prep_school_fee: '',
    currency: 'USD',
    campus_name: ''
  };
}

function createScholarship() {
  return {
    id: `scholarship-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    university: '',
    country: '',
    degree: '',
    language: '',
    program_scope: '',
    amount: '',
    notes: ''
  };
}

function buildCountryRows(catalog) {
  const explicitCountries = Array.isArray(catalog?.countries) ? catalog.countries : [];
  if (explicitCountries.length) return explicitCountries;
  return (catalog?.availableCountries || [])
    .map((name, index) => {
      const normalized = String(name || '').trim();
      if (!normalized) return null;
      return {
        id: `country-derived-${index + 1}`,
        name: normalized,
        code: ''
      };
    })
    .filter(Boolean);
}

export default function EducationCatalogAdminPage() {
  const { user } = useAuth();
  const canManageSettings = can(user, 'manageSettings');
  const [loading, setLoading] = useState(true);
  const [catalogSaving, setCatalogSaving] = useState(false);
  const [catalogImporting, setCatalogImporting] = useState(false);
  const [toast, setToast] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [createDraft, setCreateDraft] = useState(createCountry());
  const [catalogLinks, setCatalogLinks] = useState({});
  const [catalogTab, setCatalogTab] = useState('countries');
  const [catalogSearch, setCatalogSearch] = useState({
    countries: '',
    universities: '',
    programs: '',
    scholarships: ''
  });
  const [catalogSelection, setCatalogSelection] = useState({
    countries: [],
    universities: [],
    programs: [],
    scholarships: []
  });
  const [catalogForm, setCatalogForm] = useState({
    countries: [],
    universities: [],
    programs: [],
    scholarships: []
  });

  const load = () =>
    api('/api/education-catalog')
      .then(catalog => {
        setCatalogLinks(catalog.catalogLinks || {});
        setCatalogForm({
          countries: buildCountryRows(catalog),
          universities: catalog.universities || [],
          programs: catalog.programs || [],
          scholarships: catalog.scholarships || []
        });
        setCatalogSelection({
          countries: [],
          universities: [],
          programs: [],
          scholarships: []
        });
      })
      .catch(error => setToast({ type: 'error', message: error.message }))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const catalogTabs = useMemo(
    () => [
      { key: 'countries', label: 'إنشاء دولة', count: catalogForm.countries.length },
      { key: 'universities', label: 'إنشاء جامعة', count: catalogForm.universities.length },
      { key: 'programs', label: 'إنشاء برنامج', count: catalogForm.programs.length },
      { key: 'scholarships', label: 'إنشاء منحة', count: catalogForm.scholarships.length }
    ],
    [catalogForm]
  );

  const catalogFieldLabels = useMemo(
    () => ({
      countries: 'الدول',
      universities: 'الجامعات',
      programs: 'البرامج',
      scholarships: 'المنح'
    }),
    []
  );

  const catalogImportHints = useMemo(
    () => ({
      countries: 'الأعمدة المقترحة: name, code',
      universities: 'الأعمدة المقترحة: name, country, city, website, address',
      programs: 'الأعمدة المقترحة: university, country, city, degree, department, language, fees',
      scholarships: 'الأعمدة المقترحة: name, university, country, degree, language, program_scope, amount'
    }),
    []
  );
  const catalogCreateMeta = useMemo(
    () => ({
      countries: { label: 'إضافة دولة', factory: createCountry },
      universities: { label: 'إضافة جامعة', factory: createUniversity },
      programs: { label: 'إضافة برنامج', factory: createProgram },
      scholarships: { label: 'إضافة منحة', factory: createScholarship }
    }),
    []
  );
  const createModalTitle = catalogCreateMeta[catalogTab]?.label || 'إضافة عنصر';

  const filteredCatalogRows = useMemo(() => {
    const query = String(catalogSearch[catalogTab] || '').trim().toLowerCase();
    const rows = catalogForm[catalogTab] || [];
    if (!query) return rows;
    return rows.filter(item => Object.values(item || {}).some(value => String(value || '').toLowerCase().includes(query)));
  }, [catalogForm, catalogSearch, catalogTab]);

  const selectedCatalogIds = catalogSelection[catalogTab] || [];
  const allFilteredSelected = !!filteredCatalogRows.length && filteredCatalogRows.every(item => selectedCatalogIds.includes(item.id));

  const updateCatalogRow = (group, rowId, patch) => {
    setCatalogForm(current => ({
      ...current,
      [group]: current[group].map(item => (item.id === rowId ? { ...item, ...patch } : item))
    }));
  };

  const addCatalogRow = (group, factory) => {
    setCatalogForm(current => ({
      ...current,
      [group]: [...current[group], factory()]
    }));
  };

  const getCatalogRowLabel = (group, row) => {
    if (!row) return '';
    if (group === 'countries') return row.name || row.code || '';
    if (group === 'universities') return row.name || '';
    if (group === 'programs') return row.department || row.university || '';
    if (group === 'scholarships') return row.name || row.university || '';
    return '';
  };

  const requestRemoveCatalogRow = (group, rowId) => {
    const row = (catalogForm[group] || []).find(item => item.id === rowId);
    const label = getCatalogRowLabel(group, row);
    setDeleteConfirm({
      type: 'single',
      group,
      rowId,
      title: 'تأكيد الحذف',
      subtitle: label ? `سيتم حذف "${label}" بعد التأكيد.` : 'سيتم حذف هذا العنصر بعد التأكيد.',
      actionLabel: 'تأكيد الحذف'
    });
  };

  const executeRemoveCatalogRow = (group, rowId) => {
    setCatalogForm(current => ({
      ...current,
      [group]: current[group].filter(item => item.id !== rowId)
    }));
    setCatalogSelection(current => ({
      ...current,
      [group]: current[group].filter(item => item !== rowId)
    }));
  };

  const removeCatalogRow = (group, rowId) => {
    const row = (catalogForm[group] || []).find(item => item.id === rowId);
    const label = getCatalogRowLabel(group, row);
    const confirmed = window.confirm(
      label
        ? `هل أنت متأكد من حذف "${label}" من قسم ${catalogFieldLabels[group]}؟`
        : `هل أنت متأكد من حذف هذا العنصر من قسم ${catalogFieldLabels[group]}؟`
    );
    if (!confirmed) return;

    setCatalogForm(current => ({
      ...current,
      [group]: current[group].filter(item => item.id !== rowId)
    }));
    setCatalogSelection(current => ({
      ...current,
      [group]: current[group].filter(item => item !== rowId)
    }));
  };

  const toggleCatalogSelection = (group, rowId) => {
    setCatalogSelection(current => ({
      ...current,
      [group]: current[group].includes(rowId)
        ? current[group].filter(item => item !== rowId)
        : [...current[group], rowId]
    }));
  };

  const toggleSelectAllCatalogRows = group => {
    const visibleIds = filteredCatalogRows.map(item => item.id);
    setCatalogSelection(current => {
      const everySelected = visibleIds.every(id => current[group].includes(id));
      return {
        ...current,
        [group]: everySelected
          ? current[group].filter(id => !visibleIds.includes(id))
          : [...new Set([...current[group], ...visibleIds])]
      };
    });
  };

  const saveCatalogPayload = async (payload, successMessage) => {
    setCatalogSaving(true);
    try {
      await api('/api/education-catalog', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      await load();
      setToast({ message: successMessage });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    } finally {
      setCatalogSaving(false);
    }
  };

  const saveCatalog = async () => {
    await saveCatalogPayload(catalogForm, 'تم حفظ قسم الدول والجامعات والبرامج والمنح بنجاح');
  };

  const deleteSelectedCatalogRows = async () => {
    if (!selectedCatalogIds.length) return;
    const confirmed = window.confirm(`هل أنت متأكد من حذف ${selectedCatalogIds.length} عنصر من قسم ${catalogFieldLabels[catalogTab]}؟`);
    if (!confirmed) return;
    const nextCatalogForm = {
      ...catalogForm,
      [catalogTab]: catalogForm[catalogTab].filter(item => !selectedCatalogIds.includes(item.id))
    };
    setCatalogForm(nextCatalogForm);
    setCatalogSelection(current => ({ ...current, [catalogTab]: [] }));
    await saveCatalogPayload(nextCatalogForm, `تم حذف العناصر المحددة من قسم ${catalogFieldLabels[catalogTab]} بنجاح`);
  };

  const executeBulkDeleteCatalogRows = async () => {
    if (!selectedCatalogIds.length) return;
    const nextCatalogForm = {
      ...catalogForm,
      [catalogTab]: catalogForm[catalogTab].filter(item => !selectedCatalogIds.includes(item.id))
    };
    setCatalogForm(nextCatalogForm);
    setCatalogSelection(current => ({ ...current, [catalogTab]: [] }));
    await saveCatalogPayload(nextCatalogForm, `تم حذف العناصر المحددة من قسم ${catalogFieldLabels[catalogTab]} بنجاح`);
  };

  const requestDeleteSelectedCatalogRows = () => {
    if (!selectedCatalogIds.length) return;
    setDeleteConfirm({
      type: 'bulk',
      title: 'تأكيد الحذف الجماعي',
      subtitle: `سيتم حذف ${selectedCatalogIds.length} عنصر من هذا القسم بعد التأكيد.`,
      actionLabel: `حذف ${selectedCatalogIds.length} عنصر`
    });
  };

  const confirmDeleteAction = async () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === 'single') {
      setDeleteConfirm(null);
      executeRemoveCatalogRow(deleteConfirm.group, deleteConfirm.rowId);
      return;
    }
    if (deleteConfirm.type === 'bulk') {
      setDeleteConfirm(null);
      await executeBulkDeleteCatalogRows();
    }
  };

  const triggerCatalogImport = () => {
    if (!canManageSettings) return;
    document.getElementById('catalog-import-input')?.click();
  };

  const openCreateModal = () => {
    if (!canManageSettings) return;
    setCreateDraft(catalogCreateMeta[catalogTab].factory());
    setCreateOpen(true);
  };

  const submitCreateModal = async event => {
    event.preventDefault();
    const nextCatalogForm = {
      ...catalogForm,
      [catalogTab]: [...catalogForm[catalogTab], createDraft]
    };
    setCatalogForm(nextCatalogForm);
    setCreateOpen(false);
    await saveCatalogPayload(nextCatalogForm, `تم إنشاء العنصر الجديد وربطه بباقي صفحات الدليل الدراسي بنجاح`);
  };

  const importCatalogFile = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('target', catalogTab);
    formData.append('mode', 'append');
    setCatalogImporting(true);
    try {
      const result = await api('/api/education-catalog/import', {
        method: 'POST',
        body: formData
      });
      await load();
      setToast({ message: `تم استيراد ${result.imported || 0} عنصر إلى قسم ${catalogFieldLabels[catalogTab]} بنجاح` });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    } finally {
      setCatalogImporting(false);
      event.target.value = '';
    }
  };

  if (loading) return <div className="loading-page"><Spinner />جارٍ تحميل الدليل الدراسي...</div>;

  return (
    <>
      <Card className="settings-card">
        <div className="section-head">
          <div>
            <p className="eyebrow">الدليل الدراسي</p>
            <h2>إدارة الدول والجامعات والبرامج والمنح</h2>
            <span>هذه الصفحة هي المصدر الموحد الذي يغذي الفلاتر والنماذج ودليل الجامعات داخل النظام كله.</span>
          </div>
          <Building2 />
        </div>

        <div className="hr-filter-bar">
          {catalogTabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              className={catalogTab === tab.key ? 'filter-chip active' : 'filter-chip'}
              onClick={() => setCatalogTab(tab.key)}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        <input id="catalog-import-input" hidden type="file" accept=".xlsx,.xls,.csv,.tsv" onChange={importCatalogFile} />

        <div className="form-grid">
          <Field label={`بحث داخل ${catalogFieldLabels[catalogTab]}`}>
            <input
              disabled={!canManageSettings}
              value={catalogSearch[catalogTab]}
              onChange={event => setCatalogSearch(current => ({ ...current, [catalogTab]: event.target.value }))}
              placeholder="ابحث بالاسم أو الدولة أو الجامعة أو التخصص..."
            />
          </Field>
        </div>

        <div className="notes-box">
          <strong>استيراد سريع من ملف</strong>
          <p>{catalogImportHints[catalogTab]}</p>
        </div>

        <div className="task-actions">
          <Button
            disabled={!canManageSettings}
            variant="secondary"
            type="button"
            onClick={openCreateModal}
          >
            <Plus /> {catalogCreateMeta[catalogTab].label}
          </Button>
          <Button disabled={!canManageSettings || catalogImporting} variant="secondary" type="button" onClick={triggerCatalogImport}>
            <Plus /> {catalogImporting ? 'جارٍ الاستيراد...' : 'استيراد Excel / CSV'}
          </Button>
          <Button
            disabled={!canManageSettings || !filteredCatalogRows.length}
            variant="ghost"
            type="button"
            onClick={() => toggleSelectAllCatalogRows(catalogTab)}
          >
            {allFilteredSelected ? 'إلغاء تحديد الكل' : 'تحديد كل النتائج'}
          </Button>
          <Button
            disabled={!canManageSettings || !selectedCatalogIds.length || catalogSaving}
            variant="ghost"
            type="button"
            onClick={requestDeleteSelectedCatalogRows}
          >
            <Trash2 /> حذف جماعي ({selectedCatalogIds.length})
          </Button>
          <Button disabled={!canManageSettings || catalogSaving} type="button" onClick={saveCatalog}>
            <Save /> {catalogSaving ? 'جارٍ الحفظ...' : 'حفظ قسم الدليل الدراسي'}
          </Button>
        </div>

        {catalogTab === 'countries' && (
          <div className="templates-stack">
            {filteredCatalogRows.map(item => (
              <article className="template-card" key={item.id}>
                <label className="check-row">
                  <input disabled={!canManageSettings} type="checkbox" checked={selectedCatalogIds.includes(item.id)} onChange={() => toggleCatalogSelection('countries', item.id)} />
                  <div>
                    <strong>{item.name || 'دولة جديدة'}</strong>
                    <small>{item.code || 'بدون رمز'}</small>
                  </div>
                </label>
                <div className="form-grid">
                  <Field label="اسم الدولة"><input disabled={!canManageSettings} value={item.name} onChange={event => updateCatalogRow('countries', item.id, { name: event.target.value })} /></Field>
                  <Field label="رمز الدولة"><input disabled={!canManageSettings} value={item.code} onChange={event => updateCatalogRow('countries', item.id, { code: event.target.value })} placeholder="TR / DE / EG" /></Field>
                </div>
                <div className="task-actions">
                  <Button disabled={!canManageSettings} variant="ghost" type="button" onClick={() => requestRemoveCatalogRow('countries', item.id)}><Trash2 /> حذف الدولة</Button>
                </div>
              </article>
            ))}
          </div>
        )}

        {catalogTab === 'universities' && (
          <div className="templates-stack">
            {filteredCatalogRows.map(item => (
              <article className="template-card" key={item.id}>
                <label className="check-row">
                  <input disabled={!canManageSettings} type="checkbox" checked={selectedCatalogIds.includes(item.id)} onChange={() => toggleCatalogSelection('universities', item.id)} />
                  <div>
                    <strong>{item.name || 'جامعة جديدة'}</strong>
                    <small>{[item.country, item.city].filter(Boolean).join(' · ') || 'بدون دولة/مدينة'}</small>
                  </div>
                </label>
                <div className="form-grid">
                  <Field label="اسم الجامعة"><input disabled={!canManageSettings} value={item.name} onChange={event => updateCatalogRow('universities', item.id, { name: event.target.value })} /></Field>
                  <Field label="الدولة">
                    <select disabled={!canManageSettings} value={item.country} onChange={event => updateCatalogRow('universities', item.id, { country: event.target.value })}>
                      <option value="">اختر الدولة</option>
                      {catalogForm.countries.map(country => <option key={country.id} value={country.name}>{country.name}</option>)}
                    </select>
                  </Field>
                  <Field label="المدينة"><input disabled={!canManageSettings} value={item.city} onChange={event => updateCatalogRow('universities', item.id, { city: event.target.value })} /></Field>
                  <Field label="الموقع الإلكتروني"><input disabled={!canManageSettings} value={item.website} onChange={event => updateCatalogRow('universities', item.id, { website: event.target.value })} /></Field>
                  <Field label="العنوان" className="field-full"><textarea disabled={!canManageSettings} value={item.address} onChange={event => updateCatalogRow('universities', item.id, { address: event.target.value })} /></Field>
                </div>
                <div className="task-actions">
                  <Button disabled={!canManageSettings} variant="ghost" type="button" onClick={() => requestRemoveCatalogRow('universities', item.id)}><Trash2 /> حذف الجامعة</Button>
                </div>
              </article>
            ))}
          </div>
        )}

        {catalogTab === 'programs' && (
          <div className="templates-stack">
            {filteredCatalogRows.map(item => (
              <article className="template-card" key={item.id}>
                <label className="check-row">
                  <input disabled={!canManageSettings} type="checkbox" checked={selectedCatalogIds.includes(item.id)} onChange={() => toggleCatalogSelection('programs', item.id)} />
                  <div>
                    <strong>{item.department || 'برنامج جديد'}</strong>
                    <small>{[item.university, item.degree, item.country].filter(Boolean).join(' · ') || 'بيانات البرنامج'}</small>
                  </div>
                </label>
                <div className="form-grid">
                  <Field label="الجامعة">
                    <select disabled={!canManageSettings} value={item.university} onChange={event => updateCatalogRow('programs', item.id, { university: event.target.value, country: catalogLinks.countryByUniversity?.[event.target.value] || item.country })}>
                      <option value="">اختر الجامعة</option>
                      {catalogForm.universities.map(university => <option key={university.id} value={university.name}>{university.name}</option>)}
                    </select>
                  </Field>
                  <Field label="الدولة">
                    <select disabled={!canManageSettings} value={item.country} onChange={event => updateCatalogRow('programs', item.id, { country: event.target.value })}>
                      <option value="">اختر الدولة</option>
                      {catalogForm.countries.map(country => <option key={country.id} value={country.name}>{country.name}</option>)}
                    </select>
                  </Field>
                  <Field label="المدينة"><input disabled={!canManageSettings} value={item.city} onChange={event => updateCatalogRow('programs', item.id, { city: event.target.value })} /></Field>
                  <Field label="الدرجة"><input disabled={!canManageSettings} value={item.degree} onChange={event => updateCatalogRow('programs', item.id, { degree: event.target.value })} placeholder="بكالوريوس / ماجستير" /></Field>
                  <Field label="اسم البرنامج / التخصص"><input disabled={!canManageSettings} value={item.department} onChange={event => updateCatalogRow('programs', item.id, { department: event.target.value, program: event.target.value })} /></Field>
                  <Field label="لغة الدراسة"><input disabled={!canManageSettings} value={item.language} onChange={event => updateCatalogRow('programs', item.id, { language: event.target.value })} /></Field>
                  <Field label="حالة الإتاحة">
                    <select disabled={!canManageSettings} value={item.availability} onChange={event => updateCatalogRow('programs', item.id, { availability: event.target.value })}>
                      <option value="Available">Available</option>
                      <option value="Not Available">Not Available</option>
                      <option value="Quota Full">Quota Full</option>
                    </select>
                  </Field>
                  <Field label="العملة">
                    <select disabled={!canManageSettings} value={item.currency} onChange={event => updateCatalogRow('programs', item.id, { currency: event.target.value })}>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                      <option value="EGP">EGP</option>
                      <option value="TRY">TRY</option>
                    </select>
                  </Field>
                  <Field label="الرسوم الدراسية"><input disabled={!canManageSettings} value={item.fees} onChange={event => updateCatalogRow('programs', item.id, { fees: event.target.value })} /></Field>
                  <Field label="رسوم الكاش / الخصم"><input disabled={!canManageSettings} value={item.discount_fees} onChange={event => updateCatalogRow('programs', item.id, { discount_fees: event.target.value })} /></Field>
                  <Field label="الدفعة الأولى"><input disabled={!canManageSettings} value={item.deposit_amount} onChange={event => updateCatalogRow('programs', item.id, { deposit_amount: event.target.value })} /></Field>
                  <Field label="التحضيري"><input disabled={!canManageSettings} value={item.prep_school_fee} onChange={event => updateCatalogRow('programs', item.id, { prep_school_fee: event.target.value })} /></Field>
                  <Field label="الفرع / الحرم" className="field-full"><input disabled={!canManageSettings} value={item.campus_name} onChange={event => updateCatalogRow('programs', item.id, { campus_name: event.target.value })} /></Field>
                </div>
                <div className="task-actions">
                  <Button disabled={!canManageSettings} variant="ghost" type="button" onClick={() => requestRemoveCatalogRow('programs', item.id)}><Trash2 /> حذف البرنامج</Button>
                </div>
              </article>
            ))}
          </div>
        )}

        {catalogTab === 'scholarships' && (
          <div className="templates-stack">
            {filteredCatalogRows.map(item => (
              <article className="template-card" key={item.id}>
                <label className="check-row">
                  <input disabled={!canManageSettings} type="checkbox" checked={selectedCatalogIds.includes(item.id)} onChange={() => toggleCatalogSelection('scholarships', item.id)} />
                  <div>
                    <strong>{item.name || 'منحة جديدة'}</strong>
                    <small>{[item.university, item.degree, item.country].filter(Boolean).join(' · ') || 'بيانات المنحة'}</small>
                  </div>
                </label>
                <div className="form-grid">
                  <Field label="اسم المنحة"><input disabled={!canManageSettings} value={item.name} onChange={event => updateCatalogRow('scholarships', item.id, { name: event.target.value })} /></Field>
                  <Field label="الجامعة">
                    <select disabled={!canManageSettings} value={item.university} onChange={event => updateCatalogRow('scholarships', item.id, { university: event.target.value, country: catalogLinks.countryByUniversity?.[event.target.value] || item.country })}>
                      <option value="">اختر الجامعة</option>
                      {catalogForm.universities.map(university => <option key={university.id} value={university.name}>{university.name}</option>)}
                    </select>
                  </Field>
                  <Field label="الدولة">
                    <select disabled={!canManageSettings} value={item.country} onChange={event => updateCatalogRow('scholarships', item.id, { country: event.target.value })}>
                      <option value="">اختر الدولة</option>
                      {catalogForm.countries.map(country => <option key={country.id} value={country.name}>{country.name}</option>)}
                    </select>
                  </Field>
                  <Field label="الدرجة"><input disabled={!canManageSettings} value={item.degree} onChange={event => updateCatalogRow('scholarships', item.id, { degree: event.target.value })} /></Field>
                  <Field label="اللغة"><input disabled={!canManageSettings} value={item.language} onChange={event => updateCatalogRow('scholarships', item.id, { language: event.target.value })} /></Field>
                  <Field label="نطاق المنحة / التخصص"><input disabled={!canManageSettings} value={item.program_scope} onChange={event => updateCatalogRow('scholarships', item.id, { program_scope: event.target.value, department: event.target.value })} /></Field>
                  <Field label="قيمة المنحة"><input disabled={!canManageSettings} value={item.amount} onChange={event => updateCatalogRow('scholarships', item.id, { amount: event.target.value })} /></Field>
                  <Field label="ملاحظات" className="field-full"><textarea disabled={!canManageSettings} value={item.notes} onChange={event => updateCatalogRow('scholarships', item.id, { notes: event.target.value })} /></Field>
                </div>
                <div className="task-actions">
                  <Button disabled={!canManageSettings} variant="ghost" type="button" onClick={() => requestRemoveCatalogRow('scholarships', item.id)}><Trash2 /> حذف المنحة</Button>
                </div>
              </article>
            ))}
          </div>
        )}

      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={createModalTitle}
        subtitle="أدخل البيانات من نافذة مستقلة ثم احفظها داخل الدليل الدراسي."
        size="lg"
      >
        <form className="form-grid" onSubmit={submitCreateModal}>
          {catalogTab === 'countries' && (
            <>
              <Field label="اسم الدولة"><input required value={createDraft.name || ''} onChange={event => setCreateDraft(current => ({ ...current, name: event.target.value }))} /></Field>
              <Field label="رمز الدولة"><input value={createDraft.code || ''} onChange={event => setCreateDraft(current => ({ ...current, code: event.target.value }))} placeholder="TR / DE / EG" /></Field>
            </>
          )}

          {catalogTab === 'universities' && (
            <>
              <Field label="اسم الجامعة"><input required value={createDraft.name || ''} onChange={event => setCreateDraft(current => ({ ...current, name: event.target.value }))} /></Field>
              <Field label="الدولة">
                <select value={createDraft.country || ''} onChange={event => setCreateDraft(current => ({ ...current, country: event.target.value }))}>
                  <option value="">اختر الدولة</option>
                  {catalogForm.countries.map(country => <option key={country.id} value={country.name}>{country.name}</option>)}
                </select>
              </Field>
              <Field label="المدينة"><input value={createDraft.city || ''} onChange={event => setCreateDraft(current => ({ ...current, city: event.target.value }))} /></Field>
              <Field label="الموقع الإلكتروني"><input value={createDraft.website || ''} onChange={event => setCreateDraft(current => ({ ...current, website: event.target.value }))} /></Field>
              <Field label="العنوان" className="field-full"><textarea value={createDraft.address || ''} onChange={event => setCreateDraft(current => ({ ...current, address: event.target.value }))} /></Field>
            </>
          )}

          {catalogTab === 'programs' && (
            <>
              <Field label="الجامعة">
                <select
                  required
                  value={createDraft.university || ''}
                  onChange={event => setCreateDraft(current => ({ ...current, university: event.target.value, country: catalogLinks.countryByUniversity?.[event.target.value] || current.country }))}
                >
                  <option value="">اختر الجامعة</option>
                  {catalogForm.universities.map(university => <option key={university.id} value={university.name}>{university.name}</option>)}
                </select>
              </Field>
              <Field label="الدولة">
                <select value={createDraft.country || ''} onChange={event => setCreateDraft(current => ({ ...current, country: event.target.value }))}>
                  <option value="">اختر الدولة</option>
                  {catalogForm.countries.map(country => <option key={country.id} value={country.name}>{country.name}</option>)}
                </select>
              </Field>
              <Field label="المدينة"><input value={createDraft.city || ''} onChange={event => setCreateDraft(current => ({ ...current, city: event.target.value }))} /></Field>
              <Field label="الدرجة"><input value={createDraft.degree || ''} onChange={event => setCreateDraft(current => ({ ...current, degree: event.target.value }))} /></Field>
              <Field label="اسم البرنامج / التخصص"><input required value={createDraft.department || ''} onChange={event => setCreateDraft(current => ({ ...current, department: event.target.value, program: event.target.value }))} /></Field>
              <Field label="لغة الدراسة"><input value={createDraft.language || ''} onChange={event => setCreateDraft(current => ({ ...current, language: event.target.value }))} /></Field>
              <Field label="حالة الإتاحة">
                <select value={createDraft.availability || 'Available'} onChange={event => setCreateDraft(current => ({ ...current, availability: event.target.value }))}>
                  <option value="Available">Available</option>
                  <option value="Not Available">Not Available</option>
                  <option value="Quota Full">Quota Full</option>
                </select>
              </Field>
              <Field label="العملة">
                <select value={createDraft.currency || 'USD'} onChange={event => setCreateDraft(current => ({ ...current, currency: event.target.value }))}>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="EGP">EGP</option>
                  <option value="TRY">TRY</option>
                </select>
              </Field>
              <Field label="الرسوم الدراسية"><input value={createDraft.fees || ''} onChange={event => setCreateDraft(current => ({ ...current, fees: event.target.value }))} /></Field>
              <Field label="رسوم الكاش / الخصم"><input value={createDraft.discount_fees || ''} onChange={event => setCreateDraft(current => ({ ...current, discount_fees: event.target.value }))} /></Field>
              <Field label="الدفعة الأولى"><input value={createDraft.deposit_amount || ''} onChange={event => setCreateDraft(current => ({ ...current, deposit_amount: event.target.value }))} /></Field>
              <Field label="التحضيري"><input value={createDraft.prep_school_fee || ''} onChange={event => setCreateDraft(current => ({ ...current, prep_school_fee: event.target.value }))} /></Field>
              <Field label="الفرع / الحرم" className="field-full"><input value={createDraft.campus_name || ''} onChange={event => setCreateDraft(current => ({ ...current, campus_name: event.target.value }))} /></Field>
            </>
          )}

          {catalogTab === 'scholarships' && (
            <>
              <Field label="اسم المنحة"><input required value={createDraft.name || ''} onChange={event => setCreateDraft(current => ({ ...current, name: event.target.value }))} /></Field>
              <Field label="الجامعة">
                <select
                  value={createDraft.university || ''}
                  onChange={event => setCreateDraft(current => ({ ...current, university: event.target.value, country: catalogLinks.countryByUniversity?.[event.target.value] || current.country }))}
                >
                  <option value="">اختر الجامعة</option>
                  {catalogForm.universities.map(university => <option key={university.id} value={university.name}>{university.name}</option>)}
                </select>
              </Field>
              <Field label="الدولة">
                <select value={createDraft.country || ''} onChange={event => setCreateDraft(current => ({ ...current, country: event.target.value }))}>
                  <option value="">اختر الدولة</option>
                  {catalogForm.countries.map(country => <option key={country.id} value={country.name}>{country.name}</option>)}
                </select>
              </Field>
              <Field label="الدرجة"><input value={createDraft.degree || ''} onChange={event => setCreateDraft(current => ({ ...current, degree: event.target.value }))} /></Field>
              <Field label="اللغة"><input value={createDraft.language || ''} onChange={event => setCreateDraft(current => ({ ...current, language: event.target.value }))} /></Field>
              <Field label="نطاق المنحة / التخصص"><input value={createDraft.program_scope || ''} onChange={event => setCreateDraft(current => ({ ...current, program_scope: event.target.value, department: event.target.value }))} /></Field>
              <Field label="قيمة المنحة"><input value={createDraft.amount || ''} onChange={event => setCreateDraft(current => ({ ...current, amount: event.target.value }))} /></Field>
              <Field label="ملاحظات" className="field-full"><textarea value={createDraft.notes || ''} onChange={event => setCreateDraft(current => ({ ...current, notes: event.target.value }))} /></Field>
            </>
          )}

          <div className="form-actions field-full">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>إلغاء</Button>
            <Button type="submit">إضافة الآن</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title={deleteConfirm?.title || 'تأكيد الحذف'}
        subtitle={deleteConfirm?.subtitle || 'سيتم تنفيذ الحذف بعد تأكيدك.'}
        size="sm"
      >
        <div className="stack">
          <p>هذا الإجراء سيحذف العنصر من الدليل الدراسي داخل النظام.</p>
          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={() => setDeleteConfirm(null)}>إلغاء</Button>
            <Button type="button" onClick={confirmDeleteAction}>{deleteConfirm?.actionLabel || 'تأكيد الحذف'}</Button>
          </div>
        </div>
      </Modal>

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </>
  );
}
