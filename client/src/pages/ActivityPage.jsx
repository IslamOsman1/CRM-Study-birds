import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Search } from 'lucide-react';
import { api, formatDate } from '../api.js';
import { Badge, Card, Spinner } from '../components/UI.jsx';
import { formatArabicTime, tr, trText } from '../i18n.js';

export default function ActivityPage() {
  const [data, setData] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/api/activities').then(setData).finally(() => setLoading(false));
  }, []);

  const shown = useMemo(
    () => data.filter(item => [item.actorName, item.action, item.entityType, item.details].some(value => String(value).toLowerCase().includes(query.toLowerCase()))),
    [data, query]
  );

  if (loading) return <div className="loading-page"><Spinner />جارٍ تحميل النشاط...</div>;

  return (
    <Card className="activity-page-card">
      <div className="panel-toolbar">
        <div className="search-box">
          <Search />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث في سجل التدقيق..." />
        </div>
        <Badge tone="purple">{shown.length} حدث</Badge>
      </div>

      <div className="audit-timeline">
        {shown.map(item => (
          <div className="audit-event" key={item.id}>
            <div className="audit-icon"><Activity /></div>
            <div>
              <div>
                <strong>{item.actorName}</strong>
                <Badge tone="neutral">{tr(item.action)}</Badge>
              </div>
              <p>{trText(item.details)}</p>
              <span>{tr(item.entityType)} · {formatDate(item.createdAt)} · {formatArabicTime(item.createdAt)}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
