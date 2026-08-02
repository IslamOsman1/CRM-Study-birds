import React from 'react';
import { BookOpenCheck, Building2, Languages, WalletCards } from 'lucide-react';
import { formatMoney } from '../api.js';
import CatalogListingPage from '../components/catalog/CatalogListingPage.jsx';

function parseAmount(raw) {
  const match = String(raw || '').match(/[\d.]+/);
  return match ? Number(match[0]) : 0;
}

function parseCurrency(raw, fallback = 'USD') {
  const value = String(raw || '');
  if (value.includes('USD')) return 'USD';
  if (value.includes('EUR')) return 'EUR';
  if (value.includes('TRY')) return 'TRY';
  return fallback;
}

export default function ProgramsCatalogPage() {
  return (
    <CatalogListingPage
      loadingText="جارٍ تحميل البرامج الدراسية..."
      cards={catalog => [
        { key: 'programs', icon: BookOpenCheck, label: 'إجمالي البرامج', value: catalog.summary?.programs || 0, help: 'كل البرامج المستوردة مع تفاصيلها.' },
        { key: 'universities', icon: Building2, label: 'الجامعات المرتبطة', value: [...new Set((catalog.programs || []).map(item => item.university).filter(Boolean))].length, help: 'عدد الجامعات التي تحتوي برامج داخل هذا القسم.' },
        { key: 'languages', icon: Languages, label: 'اللغات', value: [...new Set((catalog.programs || []).map(item => item.language).filter(Boolean))].length, help: 'اللغات المتاحة للدراسة في البرامج الحالية.' },
        { key: 'departments', icon: WalletCards, label: 'التخصصات', value: [...new Set((catalog.programs || []).map(item => item.department).filter(Boolean))].length, help: 'عدد التخصصات المختلفة داخل الكتالوج.' }
      ]}
      rowsSelector={catalog => catalog.programs || []}
      columns={[
        { key: 'university', label: 'الجامعة' },
        { key: 'department', label: 'البرنامج' },
        { key: 'degree', label: 'الدرجة' },
        { key: 'language', label: 'اللغة' },
        {
          key: 'discount_fees',
          label: 'السعر',
          render: row => formatMoney(parseAmount(row.discount_fees || row.fees), parseCurrency(row.currency || row.discount_fees || row.fees))
        },
        {
          key: 'fees',
          label: 'قبل الخصم',
          render: row => formatMoney(parseAmount(row.fees), parseCurrency(row.currency || row.fees))
        },
        { key: 'campus_name', label: 'الحرم' },
        {
          key: 'location',
          label: 'المدينة / الدولة',
          render: row => `${row.city || '—'} / ${row.country || '—'}`
        }
      ]}
      searchPlaceholder="ابحث باسم البرنامج أو الجامعة أو الدرجة أو اللغة أو السعر..."
      emptyText="لا توجد برامج مطابقة للفلاتر أو البحث الحالي."
      filterDefinitions={[
        { key: 'university', label: 'الجامعة', getValue: row => row.university },
        { key: 'city', label: 'المدينة', getValue: row => row.city },
        { key: 'degree', label: 'الدرجة', getValue: row => row.degree },
        { key: 'language', label: 'اللغة', getValue: row => row.language }
      ]}
      getSearchValues={row => [
        row.university,
        row.department,
        row.degree,
        row.language,
        row.city,
        row.country,
        row.campus_name,
        row.fees,
        row.discount_fees
      ]}
    />
  );
}
