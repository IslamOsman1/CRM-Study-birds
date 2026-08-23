import React, { useEffect, useMemo, useState } from 'react';
import { api, formatMoney } from '../api.js';
import { Badge, Card, Spinner, Toast } from '../components/UI.jsx';

export default function SalesPortalPage() {
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [markets, setMarkets] = useState([]);
  const [marketKey, setMarketKey] = useState('');

  useEffect(() => {
    api('/api/sales/markets')
      .then(items => {
        setMarkets(items || []);
        setMarketKey(items?.[0]?.key || '');
      })
      .catch(error => setToast({ type: 'error', message: error.message }))
      .finally(() => setLoading(false));
  }, []);

  const market = useMemo(() => markets.find(item => item.key === marketKey) || markets[0], [marketKey, markets]);
  const progress = useMemo(() => market ? Math.round((market.achieved / Math.max(market.target, 1)) * 100) : 0, [market]);
  const maxPoint = Math.max(...(market?.trend || [1]), 1);

  if (loading) return <div className="loading-page"><Spinner />جارٍ تحميل بوابة المبيعات...</div>;
  if (!market) return null;

  return (
    <>
      <div className="crm-tabs">
        {markets.map(item => (
          <button key={item.key} className={`crm-tab ${marketKey === item.key ? 'active' : ''}`} onClick={() => setMarketKey(item.key)} type="button">
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      <div className="kpi-grid reports-kpis">
        <Card className="kpi-card"><div className="kpi-meta"><span>إجمالي الهدف</span><strong>{formatMoney(market.target)}</strong></div></Card>
        <Card className="kpi-card"><div className="kpi-meta"><span>إجمالي المحقق</span><strong>{formatMoney(market.achieved)}</strong></div></Card>
        <Card className="kpi-card"><div className="kpi-meta"><span>عدد المسجلين</span><strong>{market.enrolled}</strong></div></Card>
        <Card className="kpi-card"><div className="kpi-meta"><span>نسبة الإنجاز</span><strong>{progress}%</strong></div></Card>
      </div>

      <Card className="revenue-card">
        <div className="section-head">
          <div>
            <p className="eyebrow">Monthly Growth</p>
            <h2>نمو المبيعات خلال الشهر</h2>
            <span>البيانات الحالية تخص شهر أغسطس 2026 في {market.label}.</span>
          </div>
          <Badge tone="green">{progress}% من الهدف</Badge>
        </div>

        <div className="bar-chart sales-mini-chart">
          {market.trend.map((value, index) => (
            <div className="bar-item" key={`${market.key}-${index}`}>
              <div className="bar-value">{value}</div>
              <div className="bar-track">
                <div className="bar-fill" style={{ height: `${Math.max(12, (value / maxPoint) * 100)}%` }} />
              </div>
              <span>أ{index + 1}</span>
            </div>
          ))}
        </div>
      </Card>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
