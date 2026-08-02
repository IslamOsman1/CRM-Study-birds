import React from 'react';
import { Building2, Globe2, MapPinned, School } from 'lucide-react';
import CatalogListingPage from '../components/catalog/CatalogListingPage.jsx';

function renderCampuses(row) {
  if (!row.campuses?.length) return '—';
  return row.campuses.map(campus => campus.name).join('، ');
}

export default function UniversitiesPage() {
  return (
    <CatalogListingPage
      loadingText="جارٍ تحميل الجامعات..."
      cards={catalog => {
        const totalCampuses = (catalog.universities || []).reduce((sum, item) => sum + (item.campuses?.length || 0), 0);
        const countries = [...new Set((catalog.universities || []).map(item => item.country).filter(Boolean))].length;

        return [
          { key: 'universities', icon: Building2, label: 'إجمالي الجامعات', value: catalog.summary?.universities || 0, help: 'عدد الجامعات المتاحة داخل الكتالوج.' },
          { key: 'countries', icon: Globe2, label: 'الدول', value: countries, help: 'عدد الدول الموجودة داخل صفحة الجامعات.' },
          { key: 'cities', icon: MapPinned, label: 'المدن', value: [...new Set((catalog.universities || []).map(item => item.city).filter(Boolean))].length, help: 'المدن التي تتوزع فيها الجامعات الحالية.' },
          { key: 'campuses', icon: School, label: 'الأحرام الجامعية', value: totalCampuses, help: 'إجمالي الأحرام وربطها بالجامعات.' }
        ];
      }}
      rowsSelector={catalog => catalog.universities || []}
      columns={[
        { key: 'name', label: 'الجامعة' },
        { key: 'country', label: 'الدولة' },
        { key: 'city', label: 'المدينة' },
        { key: 'programCount', label: 'عدد البرامج' },
        {
          key: 'campusesCount',
          label: 'عدد الأحرام',
          render: row => row.campuses?.length || 0
        },
        {
          key: 'campuses',
          label: 'الأحرام',
          render: row => renderCampuses(row)
        }
      ]}
      searchPlaceholder="ابحث باسم الجامعة أو المدينة أو الدولة أو الحرم الجامعي..."
      emptyText="لا توجد جامعات مطابقة للفلاتر أو البحث الحالي."
      filterDefinitions={[
        { key: 'country', label: 'الدولة', getValue: row => row.country },
        { key: 'city', label: 'المدينة', getValue: row => row.city }
      ]}
      getSearchValues={row => [
        row.name,
        row.country,
        row.city,
        ...(row.campuses || []).flatMap(campus => [campus.name, campus.address])
      ]}
    />
  );
}
