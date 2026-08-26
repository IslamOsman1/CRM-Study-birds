import React, { useEffect, useMemo, useState } from 'react';
import { EyeOff, FileDown, Search, UserRound } from 'lucide-react';
import { api, apiDownload, formatMoney } from '../api.js';
import { Badge, Button, Card, Field, Spinner, Toast } from '../components/UI.jsx';

const defaultFilters = {
  country: '',
  cities: [],
  availability: '',
  minPrice: '',
  maxPrice: '',
  university: '',
  degree: '',
  major: '',
  languages: []
};

const defaultQuoteForm = {
  studentName: '',
  studentPhone: '',
  studentEmail: '',
  targetCountry: '',
  notes: ''
};

function unique(values) {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));
}

function parseAmount(raw) {
  const match = String(raw || '').match(/[\d.]+/);
  return match ? Number(match[0]) : 0;
}

function parseCurrency(raw, fallback = 'USD') {
  const value = String(raw || '');
  if (value.includes('EUR')) return 'EUR';
  if (value.includes('TRY')) return 'TRY';
  return fallback;
}

function normalizePrograms(catalog) {
  return (catalog.programs || []).map((item, index) => ({
    id: item.id || item.offer_id || `program-${index}`,
    university: item.university || 'جامعة غير محددة',
    country: item.country || '',
    city: item.city || '',
    degree: item.degree || '',
    major: item.department || item.program || '',
    language: item.language || '',
    availability: item.availability || 'Available',
    tuitionFee: parseAmount(item.fees),
    cashFee: parseAmount(item.discount_fees || item.fees),
    depositAmount: parseAmount(item.deposit_amount || item.deposit || item.advance_payment),
    prepFee: parseAmount(item.prep_school_fee || item.prep_fee),
    currency: parseCurrency(item.currency || item.fees || item.discount_fees),
    campus: item.campus_name || '',
    raw: item
  }));
}

export default function UniversitiesPage() {
  const [catalog, setCatalog] = useState({ programs: [] });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [filters, setFilters] = useState(defaultFilters);
  const [quoteForm, setQuoteForm] = useState(defaultQuoteForm);
  const [search, setSearch] = useState('');
  const [hiddenIds, setHiddenIds] = useState([]);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  useEffect(() => {
    let active = true;
    api('/api/education-catalog')
      .then(result => {
        if (active) setCatalog(result);
      })
      .catch(error => {
        if (active) setToast({ type: 'error', message: error.message });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const rows = useMemo(() => normalizePrograms(catalog), [catalog]);
  const countries = useMemo(
    () => unique([...(catalog.availableCountries || []), ...rows.map(row => row.country)]),
    [catalog.availableCountries, rows]
  );
  const availableCities = useMemo(
    () => unique(rows.filter(row => !filters.country || row.country === filters.country).map(row => row.city)),
    [filters.country, rows]
  );
  const universities = useMemo(
    () => unique([...(catalog.availableUniversities || []), ...rows.map(row => row.university)]),
    [catalog.availableUniversities, rows]
  );
  const majors = useMemo(
    () => unique([...(catalog.availablePrograms || []), ...rows.map(row => row.major)]),
    [catalog.availablePrograms, rows]
  );
  const languages = useMemo(() => unique(rows.map(row => row.language)), [rows]);

  const filtered = useMemo(
    () =>
      rows.filter(row => {
        const matchesSearch = [row.university, row.major, row.city, row.country, row.degree, row.language]
          .some(value => String(value || '').toLowerCase().includes(search.toLowerCase()));
        const matchesCountry = !filters.country || row.country === filters.country;
        const matchesCity = !filters.cities.length || filters.cities.includes(row.city);
        const matchesAvailability = !filters.availability || row.availability === filters.availability;
        const matchesUniversity = !filters.university || row.university === filters.university;
        const matchesDegree = !filters.degree || row.degree === filters.degree;
        const matchesMajor = !filters.major || row.major === filters.major;
        const matchesLanguages = !filters.languages.length || filters.languages.includes(row.language);
        const matchesMinPrice = !filters.minPrice || row.cashFee >= Number(filters.minPrice);
        const matchesMaxPrice = !filters.maxPrice || row.cashFee <= Number(filters.maxPrice);
        const notHidden = !hiddenIds.includes(row.id);
        return matchesSearch && matchesCountry && matchesCity && matchesAvailability && matchesUniversity && matchesDegree && matchesMajor && matchesLanguages && matchesMinPrice && matchesMaxPrice && notHidden;
      }),
    [filters, hiddenIds, rows, search]
  );

  const toggleListValue = (key, value) => {
    setFilters(current => ({
      ...current,
      [key]: current[key].includes(value) ? current[key].filter(item => item !== value) : [...current[key], value]
    }));
  };

  const hideRow = rowId => {
    setHiddenIds(current => (current.includes(rowId) ? current : [...current, rowId]));
  };

  const generateQuote = async () => {
    if (!filtered.length) {
      setToast({ type: 'error', message: 'لا توجد نتائج حالية لإضافتها إلى ملف الـ PDF.' });
      return;
    }
    if (!quoteForm.studentName.trim()) {
      setToast({ type: 'error', message: 'اسم الطالب مطلوب قبل توليد ملف الـ PDF.' });
      return;
    }

    setGeneratingPdf(true);
    try {
      const blob = await apiDownload('/api/education-catalog/quote-pdf', {
        method: 'POST',
        body: JSON.stringify({
          student: {
            ...quoteForm,
            targetCountry: quoteForm.targetCountry || filters.country || filtered[0]?.country || ''
          },
          items: filtered
        })
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeName = quoteForm.studentName.trim().replace(/[^\p{L}\p{N}._ -]+/gu, '_');
      link.href = url;
      link.download = `university-quote-${safeName || 'student'}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setToast({ message: 'تم إنشاء ملف PDF وتنزيله بنجاح.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    } finally {
      setGeneratingPdf(false);
    }
  };

  if (loading) return <div className="loading-page"><Spinner />جارٍ تحميل دليل الجامعات...</div>;

  return (
    <>
      <Card className="settings-card field-full">
        <div className="section-head">
          <div>
            <p className="eyebrow">Quote Generator</p>
            <h2>البحث المتقدم والعرض السعري</h2>
            <span>نتائج الفلترة الحالية تدخل تلقائيًا في ملف الـ PDF، وزر الإخفاء فقط هو الذي يستبعد أي جامعة من الملف.</span>
          </div>
        </div>

        <div className="catalog-toolbar">
          <label className="catalog-search">
            <Search size={16} />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث بالجامعة أو التخصص أو المدينة..." />
          </label>
          <div className="catalog-actions">
            <div className="catalog-results-count">النتائج الحالية: {filtered.length}</div>
            <Button onClick={generateQuote} type="button" disabled={generatingPdf}>
              <FileDown size={16} />
              {generatingPdf ? 'Generating PDF...' : 'Generate PDF'}
            </Button>
          </div>
        </div>

        <div className="crm-grid crm-grid-two" style={{ marginBottom: 18 }}>
          <Field label="اسم الطالب">
            <input value={quoteForm.studentName} onChange={event => setQuoteForm(current => ({ ...current, studentName: event.target.value }))} placeholder="اسم الطالب كما سيظهر في العرض" />
          </Field>
          <Field label="رقم الهاتف">
            <input value={quoteForm.studentPhone} onChange={event => setQuoteForm(current => ({ ...current, studentPhone: event.target.value }))} placeholder="+20..." />
          </Field>
          <Field label="البريد الإلكتروني">
            <input value={quoteForm.studentEmail} onChange={event => setQuoteForm(current => ({ ...current, studentEmail: event.target.value }))} placeholder="student@email.com" />
          </Field>
          <Field label="الدولة المستهدفة">
            <input value={quoteForm.targetCountry} onChange={event => setQuoteForm(current => ({ ...current, targetCountry: event.target.value }))} placeholder="مثل: تركيا أو ألمانيا" />
          </Field>
          <Field label="ملاحظات العرض" className="field-full">
            <textarea value={quoteForm.notes} onChange={event => setQuoteForm(current => ({ ...current, notes: event.target.value }))} rows={3} placeholder="أي ملاحظات إضافية تظهر داخل ملف العرض..." />
          </Field>
        </div>

        <div className="catalog-filters-grid">
          <Field label="الدولة">
            <select className="catalog-filter-select" value={filters.country} onChange={event => setFilters({ ...filters, country: event.target.value, cities: [] })}>
              <option value="">الكل</option>
              {countries.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </Field>
          <Field label="الجامعة">
            <select className="catalog-filter-select" value={filters.university} onChange={event => setFilters({ ...filters, university: event.target.value })}>
              <option value="">الكل</option>
              {universities.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </Field>
          <Field label="الدرجة">
            <input list="degree-options" value={filters.degree} onChange={event => setFilters({ ...filters, degree: event.target.value })} />
            <datalist id="degree-options">
              {unique(rows.map(row => row.degree)).map(option => <option key={option} value={option} />)}
            </datalist>
          </Field>
          <Field label="التخصص">
            <input list="major-options" value={filters.major} onChange={event => setFilters({ ...filters, major: event.target.value })} />
            <datalist id="major-options">
              {majors.map(option => <option key={option} value={option} />)}
            </datalist>
          </Field>
          <Field label="أقل سعر">
            <input type="number" value={filters.minPrice} onChange={event => setFilters({ ...filters, minPrice: event.target.value })} />
          </Field>
          <Field label="أعلى سعر">
            <input type="number" value={filters.maxPrice} onChange={event => setFilters({ ...filters, maxPrice: event.target.value })} />
          </Field>
          <Field label="حالة الإتاحة">
            <select className="catalog-filter-select" value={filters.availability} onChange={event => setFilters({ ...filters, availability: event.target.value })}>
              <option value="">الكل</option>
              <option value="Available">Available</option>
              <option value="Not Available">Not Available</option>
              <option value="Quota Full">Quota Full</option>
            </select>
          </Field>
          <Field label="المدن">
            <div className="filter-chip-list">
              {availableCities.map(city => (
                <button key={city} className={`filter-chip ${filters.cities.includes(city) ? 'active' : ''}`} onClick={() => toggleListValue('cities', city)} type="button">
                  {city}
                </button>
              ))}
            </div>
          </Field>
          <Field label="لغات الدراسة" className="field-full">
            <div className="filter-chip-list">
              {languages.map(language => (
                <button key={language} className={`filter-chip ${filters.languages.includes(language) ? 'active' : ''}`} onClick={() => toggleListValue('languages', language)} type="button">
                  {language}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </Card>

      <Card className="quote-cart-card">
        <div className="section-head">
          <div>
            <p className="eyebrow">PDF Scope</p>
            <h2>العناصر التي ستظهر في الملف</h2>
            <span>{filtered.length} تخصص/جامعة من نتائج الفلترة الحالية ستدخل تلقائيًا في ملف العرض.</span>
          </div>
          <Badge tone="purple">{filtered.length}</Badge>
        </div>
        <div className="daily-report-lock card" style={{ marginBottom: 14 }}>
          <div className="daily-report-lock-head">
            <UserRound size={18} />
            <div>
              <strong>{quoteForm.studentName || 'لم يتم إدخال اسم الطالب بعد'}</strong>
              <span>{quoteForm.studentPhone || 'بدون رقم هاتف'} {quoteForm.studentEmail ? `· ${quoteForm.studentEmail}` : ''}</span>
            </div>
          </div>
        </div>
        <div className="selection-tags">
          {hiddenIds.length > 0 ? (
            <Button variant="secondary" type="button" onClick={() => setHiddenIds([])}>
              إلغاء كل الإخفاءات
            </Button>
          ) : null}
          {!filtered.length && <div className="kanban-empty">لا توجد نتائج ظاهرة حاليًا. عدّل الفلاتر أو ألغِ الإخفاء لإضافة نتائج إلى الملف.</div>}
        </div>
      </Card>

      <div className="catalog-grid university-results-grid">
        {filtered.map(row => (
          <Card className="university-card" key={row.id}>
            <div className="university-card-head">
              <div>
                <strong>{row.university}</strong>
                <span>{row.city || '—'} / {row.country || '—'}</span>
              </div>
              <Badge tone={row.availability === 'Available' ? 'green' : row.availability === 'Quota Full' ? 'amber' : 'red'}>
                {row.availability}
              </Badge>
            </div>

            <div className="university-card-meta">
              <span>{row.major || '—'}</span>
              <span>{row.language || '—'}</span>
              <span>{row.degree || '—'}</span>
              {row.campus ? <span>{row.campus}</span> : null}
            </div>

            <div className="price-grid">
              <div><small>رسوم الدراسة</small><strong>{formatMoney(row.tuitionFee, row.currency)}</strong></div>
              <div><small>رسوم الكاش</small><strong>{formatMoney(row.cashFee, row.currency)}</strong></div>
              <div><small>الدفعة الأولى</small><strong>{formatMoney(row.depositAmount, row.currency)}</strong></div>
              <div><small>السنة التحضيرية</small><strong>{formatMoney(row.prepFee, row.currency)}</strong></div>
            </div>

            <div className="catalog-actions">
              <Button variant="secondary" onClick={() => hideRow(row.id)} type="button">
                <EyeOff size={15} />
                إخفاء
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
