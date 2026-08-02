import React from 'react';
import { Building2, Languages, Sparkles, Users } from 'lucide-react';
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

export default function ScholarshipsPage() {
  return (
    <CatalogListingPage
      loadingText="جارٍ تحميل المنح الدراسية..."
      cards={catalog => [
        { key: 'scholarships', icon: Sparkles, label: 'إجمالي المنح', value: catalog.summary?.scholarships || 0, help: 'كل العروض والمنح المستوردة داخل النظام.' },
        { key: 'universities', icon: Building2, label: 'جامعات المنح', value: [...new Set((catalog.scholarships || []).map(item => item.university).filter(Boolean))].length, help: 'عدد الجامعات التي لديها منح أو عروض.' },
        { key: 'languages', icon: Languages, label: 'لغات الدراسة', value: [...new Set((catalog.scholarships || []).map(item => item.language).filter(Boolean))].length, help: 'اللغات المرتبطة بالمنح الحالية.' },
        { key: 'degrees', icon: Users, label: 'الدرجات', value: [...new Set((catalog.scholarships || []).map(item => item.degree).filter(Boolean))].length, help: 'عدد الدرجات الدراسية المشمولة في المنح.' }
      ]}
      rowsSelector={catalog => catalog.scholarships || []}
      columns={[
        { key: 'university', label: 'الجامعة' },
        { key: 'program_scope', label: 'تفاصيل المنحة' },
        { key: 'degree', label: 'الدرجة' },
        { key: 'language', label: 'اللغة' },
        {
          key: 'discount_price',
          label: 'السعر بعد الخصم',
          render: row => formatMoney(parseAmount(row.discount_price || row.price), parseCurrency(row.discount_price || row.price))
        },
        {
          key: 'price',
          label: 'السعر الأصلي',
          render: row => formatMoney(parseAmount(row.price), parseCurrency(row.price))
        },
        { key: 'available_seats', label: 'المقاعد' },
        {
          key: 'campus',
          label: 'الحرم / الموقع',
          render: row => [row.campus, row.location].filter(Boolean).join(' / ') || '—'
        }
      ]}
      searchPlaceholder="ابحث باسم الجامعة أو تفاصيل المنحة أو الدرجة أو اللغة أو السعر..."
      emptyText="لا توجد منح مطابقة للفلاتر أو البحث الحالي."
      filterDefinitions={[
        { key: 'university', label: 'الجامعة', getValue: row => row.university },
        { key: 'degree', label: 'الدرجة', getValue: row => row.degree },
        { key: 'language', label: 'اللغة', getValue: row => row.language },
        { key: 'campus', label: 'الحرم', getValue: row => row.campus }
      ]}
      getSearchValues={row => [
        row.university,
        row.program_scope,
        row.degree,
        row.language,
        row.location,
        row.campus,
        row.price,
        row.discount_price,
        row.available_seats
      ]}
    />
  );
}
