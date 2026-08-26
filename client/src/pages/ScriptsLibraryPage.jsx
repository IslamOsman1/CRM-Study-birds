import React, { useEffect, useMemo, useState } from 'react';
import { Copy, Plus, Search } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { can } from '../permissions.js';
import { Badge, Button, Card, Field, Modal, Spinner, Toast } from '../components/UI.jsx';

const initialForm = {
  title: '',
  category: '',
  body: ''
};

export default function ScriptsLibraryPage() {
  const { user } = useAuth();
  const canManageScripts = can(user, 'manageScripts');
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [scripts, setScripts] = useState([]);
  const [form, setForm] = useState(initialForm);

  const loadScripts = () =>
    api('/api/response-scripts')
      .then(setScripts)
      .catch(error => setToast({ type: 'error', message: error.message }))
      .finally(() => setLoading(false));

  useEffect(() => {
    loadScripts();
  }, []);

  const filtered = useMemo(
    () =>
      scripts.filter(item =>
        [item.title, item.category, item.body].some(value => String(value || '').toLowerCase().includes(query.toLowerCase()))
      ),
    [query, scripts]
  );

  const copyScript = async script => {
    await navigator.clipboard.writeText(script.body);
    setToast({ message: `تم نسخ "${script.title}" إلى الحافظة.` });
  };

  const openCreateModal = () => {
    setForm(initialForm);
    setCreateOpen(true);
  };

  const submitCreateScript = async event => {
    event.preventDefault();
    setSaving(true);
    try {
      await api('/api/response-scripts', {
        method: 'POST',
        body: JSON.stringify(form)
      });
      setCreateOpen(false);
      setForm(initialForm);
      setLoading(true);
      await loadScripts();
      setToast({ message: 'تم إنشاء الاسكربت الجديد بنجاح.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading-page"><Spinner />جارٍ تحميل الاسكربتات...</div>;

  return (
    <>
      <div className="toolbar">
        <label className="catalog-search">
          <Search size={16} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث داخل الاسكربتات..." />
        </label>
        {canManageScripts && (
          <div className="toolbar-right">
            <Button type="button" onClick={openCreateModal}>
              <Plus size={15} />
              إضافة اسكربت
            </Button>
          </div>
        )}
      </div>

      <div className="crm-grid crm-grid-two">
        {filtered.map(script => (
          <Card className="script-card" key={script.id}>
            <div className="script-card-head">
              <Badge tone="purple">{script.category}</Badge>
              <strong>{script.title}</strong>
            </div>
            <p>{script.body}</p>
            <Button onClick={() => copyScript(script)} type="button">
              <Copy size={15} />
              نسخ النص
            </Button>
          </Card>
        ))}
      </div>

      <Modal
        open={createOpen}
        onClose={() => !saving && setCreateOpen(false)}
        title="إضافة اسكربت جديد"
        subtitle="أنشئ ردًا جاهزًا جديدًا ليظهر داخل مكتبة الاسكربتات."
      >
        <form className="stack-form" onSubmit={submitCreateScript}>
          <Field label="عنوان الاسكربت">
            <input
              required
              value={form.title}
              onChange={event => setForm(current => ({ ...current, title: event.target.value }))}
              placeholder="مثال: الرد على الاستفسار عن الفيزا"
            />
          </Field>
          <Field label="التصنيف">
            <input
              value={form.category}
              onChange={event => setForm(current => ({ ...current, category: event.target.value }))}
              placeholder="مثال: الفيزا"
            />
          </Field>
          <Field label="نص الاسكربت">
            <textarea
              required
              value={form.body}
              onChange={event => setForm(current => ({ ...current, body: event.target.value }))}
              placeholder="اكتب النص الجاهز الذي سيتم نسخه واستخدامه."
            />
          </Field>
          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)} disabled={saving}>إلغاء</Button>
            <Button type="submit" disabled={saving}>
              <Plus size={15} />
              {saving ? 'جارٍ الإنشاء...' : 'حفظ الاسكربت'}
            </Button>
          </div>
        </form>
      </Modal>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
