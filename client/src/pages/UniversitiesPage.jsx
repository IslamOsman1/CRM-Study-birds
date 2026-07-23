import React, { useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, Building2, Globe2, Plus, Save, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { Badge, Button, Card, Field, Spinner, Toast } from '../components/UI.jsx';

function normalizeItems(items) {
  return (items || []).map(item => String(item || '').trim());
}

function CatalogEditor({ title, eyebrow, icon: Icon, items, placeholder, onAdd, onChange, onRemove }) {
  const filledCount = items.filter(Boolean).length;

  return (
    <Card className="settings-card">
      <div className="section-head">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <span>العناصر المضافة هنا ستظهر لاحقًا في نماذج التقديم والقبول.</span>
        </div>
        <Icon />
      </div>

      <div className="settings-list">
        {items.map((item, index) => (
          <div className="settings-row" key={`${title}-${index}`}>
            <input
              value={item}
              onChange={event => onChange(index, event.target.value)}
              placeholder={placeholder}
            />
            <Badge tone={item.trim() ? 'green' : 'neutral'}>{item.trim() ? 'جاهز' : 'فارغ'}</Badge>
            <button className="icon-btn small danger" type="button" onClick={() => onRemove(index)}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="form-actions catalog-actions">
        <Badge tone="purple">{filledCount} عنصر</Badge>
        <Button variant="secondary" type="button" onClick={onAdd}>
          <Plus /> إضافة عنصر
        </Button>
      </div>
    </Card>
  );
}

export default function UniversitiesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [form, setForm] = useState({
    availableUniversities: [''],
    availablePrograms: [''],
    availableCountries: ['']
  });

  const load = () =>
    api('/api/settings')
      .then(settings => {
        setForm({
          availableUniversities: settings.availableUniversities?.length ? settings.availableUniversities : [''],
          availablePrograms: settings.availablePrograms?.length ? settings.availablePrograms : [''],
          availableCountries: settings.availableCountries?.length ? settings.availableCountries : ['']
        });
      })
      .catch(error => setToast({ type: 'error', message: error.message }))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(
    () => ({
      universities: normalizeItems(form.availableUniversities).filter(Boolean).length,
      programs: normalizeItems(form.availablePrograms).filter(Boolean).length,
      countries: normalizeItems(form.availableCountries).filter(Boolean).length
    }),
    [form]
  );

  const updateList = (key, updater) => {
    setForm(current => ({ ...current, [key]: updater(current[key]) }));
  };

  const save = async event => {
    event.preventDefault();
    setSaving(true);
    try {
      await api('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          availableUniversities: normalizeItems(form.availableUniversities).filter(Boolean),
          availablePrograms: normalizeItems(form.availablePrograms).filter(Boolean),
          availableCountries: normalizeItems(form.availableCountries).filter(Boolean)
        })
      });
      await load();
      setToast({ message: 'تم حفظ قائمة الجامعات والبرامج والدول بنجاح.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading-page"><Spinner />جارٍ تحميل دليل الجامعات والبرامج...</div>;

  return (
    <>
      <div className="kpi-grid finance-kpis">
        <Card className="kpi-card">
          <div className="kpi-icon"><Building2 /></div>
          <div className="kpi-meta">
            <span>الجامعات المتاحة</span>
            <strong>{stats.universities}</strong>
            <small>تظهر داخل نماذج القبول والتقديم</small>
          </div>
        </Card>
        <Card className="kpi-card">
          <div className="kpi-icon"><BookOpenCheck /></div>
          <div className="kpi-meta">
            <span>البرامج المتاحة</span>
            <strong>{stats.programs}</strong>
            <small>للتخصصات والمسارات الدراسية</small>
          </div>
        </Card>
        <Card className="kpi-card">
          <div className="kpi-icon"><Globe2 /></div>
          <div className="kpi-meta">
            <span>الدول المتاحة</span>
            <strong>{stats.countries}</strong>
            <small>مرجع موحد لكل الوجهات الدراسية</small>
          </div>
        </Card>
      </div>

      <form className="catalog-grid" onSubmit={save}>
        <CatalogEditor
          title="إدارة الجامعات"
          eyebrow="دليل القبول"
          icon={Building2}
          items={form.availableUniversities}
          placeholder="مثال: Technical University of Munich"
          onAdd={() => updateList('availableUniversities', current => [...current, ''])}
          onChange={(index, value) => updateList('availableUniversities', current => current.map((item, itemIndex) => (itemIndex === index ? value : item)))}
          onRemove={index => updateList('availableUniversities', current => current.length === 1 ? [''] : current.filter((_, itemIndex) => itemIndex !== index))}
        />

        <CatalogEditor
          title="إدارة البرامج"
          eyebrow="البرامج الدراسية"
          icon={BookOpenCheck}
          items={form.availablePrograms}
          placeholder="مثال: MSc Mechanical Engineering"
          onAdd={() => updateList('availablePrograms', current => [...current, ''])}
          onChange={(index, value) => updateList('availablePrograms', current => current.map((item, itemIndex) => (itemIndex === index ? value : item)))}
          onRemove={index => updateList('availablePrograms', current => current.length === 1 ? [''] : current.filter((_, itemIndex) => itemIndex !== index))}
        />

        <CatalogEditor
          title="إدارة الدول"
          eyebrow="الوجهات المتاحة"
          icon={Globe2}
          items={form.availableCountries}
          placeholder="مثال: Germany"
          onAdd={() => updateList('availableCountries', current => [...current, ''])}
          onChange={(index, value) => updateList('availableCountries', current => current.map((item, itemIndex) => (itemIndex === index ? value : item)))}
          onRemove={index => updateList('availableCountries', current => current.length === 1 ? [''] : current.filter((_, itemIndex) => itemIndex !== index))}
        />

        <Card className="settings-card field-full">
          <div className="section-head">
            <div>
              <p className="eyebrow">تطبيق النظام</p>
              <h2>حفظ الدليل المرجعي</h2>
              <span>بعد الحفظ ستتوفر القيم مباشرة في شاشة القبول وأي شاشة مرتبطة بها.</span>
            </div>
            <Save />
          </div>
          <Field label="ملاحظة">
            <input value="هذه القوائم مركزية وتُدار فقط من حساب الإدارة." disabled />
          </Field>
          <div className="form-actions">
            <Button type="submit" disabled={saving}>
              <Save /> {saving ? 'جارٍ الحفظ...' : 'حفظ الجامعات والبرامج والدول'}
            </Button>
          </div>
        </Card>
      </form>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
