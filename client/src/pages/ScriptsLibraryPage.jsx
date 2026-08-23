import React, { useEffect, useMemo, useState } from 'react';
import { Copy, Search } from 'lucide-react';
import { api } from '../api.js';
import { Badge, Button, Card, Spinner, Toast } from '../components/UI.jsx';

export default function ScriptsLibraryPage() {
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scripts, setScripts] = useState([]);

  useEffect(() => {
    api('/api/response-scripts')
      .then(setScripts)
      .catch(error => setToast({ type: 'error', message: error.message }))
      .finally(() => setLoading(false));
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

  if (loading) return <div className="loading-page"><Spinner />جارٍ تحميل السكربتات...</div>;

  return (
    <>
      <label className="catalog-search">
        <Search size={16} />
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث داخل السكربتات..." />
      </label>

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

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
