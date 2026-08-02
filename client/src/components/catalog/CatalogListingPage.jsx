import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '../../api.js';
import { Card, Spinner, Toast } from '../UI.jsx';

function matchesQuery(query, values) {
  if (!query) return true;
  const lowered = query.toLowerCase();
  return values.some(value => String(value || '').toLowerCase().includes(lowered));
}

function uniqueOptions(values) {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));
}

function CatalogSearch({ value, onChange, placeholder }) {
  return (
    <label className="catalog-search">
      <Search size={16} />
      <input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function FilterSelect({ label, value, options, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select className="catalog-filter-select" value={value} onChange={event => onChange(event.target.value)}>
        <option value="">الكل</option>
        {options.map(option => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function CatalogTable({ columns, rows, emptyText }) {
  return (
    <div className="catalog-table-wrap">
      <table className="catalog-table">
        <thead>
          <tr>
            {columns.map(column => <th key={column.key}>{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, index) => (
            <tr key={row.id ?? row.offer_id ?? `${columns[0]?.key || 'row'}-${index}`}>
              {columns.map(column => (
                <td key={column.key}>
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          )) : (
            <tr>
              <td colSpan={columns.length} className="catalog-table-empty">{emptyText}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function CatalogListingPage({
  loadingText,
  cards,
  rowsSelector,
  columns,
  searchPlaceholder,
  emptyText,
  filterDefinitions,
  getSearchValues
}) {
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [catalog, setCatalog] = useState({ summary: {}, universities: [], programs: [], scholarships: [] });
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({});

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const nextCatalog = await api('/api/education-catalog');
        if (!active) return;
        setCatalog(nextCatalog);
      } catch (error) {
        if (active) setToast({ type: 'error', message: error.message });
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, []);

  const rows = useMemo(() => rowsSelector(catalog), [catalog, rowsSelector]);

  const preparedFilters = useMemo(
    () => filterDefinitions.map(definition => ({
      ...definition,
      options: uniqueOptions(definition.getOptions ? definition.getOptions(catalog, rows) : rows.map(row => definition.getValue(row)))
    })),
    [catalog, filterDefinitions, rows]
  );

  const filteredRows = useMemo(
    () => rows.filter(row => (
      preparedFilters.every(definition => {
        const selected = filters[definition.key];
        if (!selected) return true;
        return String(definition.getValue(row) || '').trim() === selected;
      }) && matchesQuery(searchQuery, getSearchValues(row))
    )),
    [filters, getSearchValues, preparedFilters, rows, searchQuery]
  );

  if (loading) return <div className="loading-page"><Spinner />{loadingText}</div>;

  return (
    <>
      <div className="kpi-grid finance-kpis">
        {cards(catalog).map(({ key, icon: Icon, label, value, help }) => (
          <Card className="kpi-card" key={key}>
            <div className="kpi-icon"><Icon /></div>
            <div className="kpi-meta">
              <span>{label}</span>
              <strong>{value}</strong>
              <small>{help}</small>
            </div>
          </Card>
        ))}
      </div>

      <Card className="settings-card field-full">
        <div className="section-head">
          <div>
            <p className="eyebrow">الدليل الدراسي</p>
            <h2>عناصر التصفية والبحث</h2>
            <span>استخدم البحث النصي والفلاتر للوصول السريع إلى النتائج المطلوبة داخل هذا القسم.</span>
          </div>
        </div>

        <div className="catalog-toolbar">
          <CatalogSearch value={searchQuery} onChange={setSearchQuery} placeholder={searchPlaceholder} />
          <div className="catalog-results-count">النتائج المعروضة: {filteredRows.length}</div>
        </div>

        <div className="catalog-filters-grid">
          {preparedFilters.map(definition => (
            <FilterSelect
              key={definition.key}
              label={definition.label}
              value={filters[definition.key] || ''}
              options={definition.options}
              onChange={value => setFilters(current => ({ ...current, [definition.key]: value }))}
            />
          ))}
        </div>
      </Card>

      <Card className="settings-card field-full">
        <div className="section-head">
          <div>
            <p className="eyebrow">البيانات المستوردة</p>
            <h2>{emptyText === '' ? 'النتائج' : 'جدول البيانات'}</h2>
            <span>يعرض هذا الجدول البيانات بعد تطبيق التصفية والبحث.</span>
          </div>
        </div>

        <CatalogTable columns={columns} rows={filteredRows} emptyText={emptyText} />
      </Card>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
