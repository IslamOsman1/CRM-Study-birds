import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, BarChart3, BriefcaseBusiness, CalendarDays, CircleDollarSign, Download, FileCheck2, FileText, Search, UsersRound, WalletCards } from 'lucide-react';
import { api, formatDate, formatMoney } from '../api.js';
import { Badge, Button, Card, Progress, Spinner, Toast } from '../components/UI.jsx';
import { tr } from '../i18n.js';

function inRange(value, from, to) {
  if (!value) return true;
  const current = new Date(value);
  if (from && current < new Date(from)) return false;
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    if (current > end) return false;
  }
  return true;
}

function csvEscape(value) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('2026-07-01');
  const [to, setTo] = useState('2026-07-17');
  const [toast, setToast] = useState(null);
  const [data, setData] = useState({ leads: [], applications: [], invoices: [], attendance: [], dashboard: null });

  useEffect(() => {
    Promise.all([
      api('/api/leads'),
      api('/api/applications'),
      api('/api/invoices'),
      api('/api/attendance'),
      api('/api/dashboard')
    ])
      .then(([leads, applications, invoices, attendance, dashboard]) => {
        setData({ leads, applications, invoices, attendance, dashboard });
      })
      .catch(error => setToast({ type: 'error', message: error.message }))
      .finally(() => setLoading(false));
  }, []);

  const filteredLeads = useMemo(
    () =>
      data.leads.filter(lead =>
        inRange(lead.updatedAt || lead.createdAt, from, to) &&
        [lead.name, lead.country, lead.program, lead.university, lead.stage].some(value => String(value || '').toLowerCase().includes(query.toLowerCase()))
      ),
    [data.leads, from, to, query]
  );

  const filteredApplications = useMemo(
    () =>
      data.applications.filter(application =>
        inRange(application.updatedAt || application.createdAt, from, to) &&
        [application.student?.name, application.program, application.university, application.status].some(value => String(value || '').toLowerCase().includes(query.toLowerCase()))
      ),
    [data.applications, from, to, query]
  );

  const filteredInvoices = useMemo(
    () =>
      data.invoices.filter(invoice =>
        inRange(invoice.createdAt, from, to) &&
        [invoice.number, invoice.student?.name, invoice.description, invoice.computedStatus].some(value => String(value || '').toLowerCase().includes(query.toLowerCase()))
      ),
    [data.invoices, from, to, query]
  );

  const filteredAttendance = useMemo(
    () =>
      data.attendance.filter(item =>
        inRange(item.date, from, to) &&
        [item.employee?.name, item.employee?.department, item.status].some(value => String(value || '').toLowerCase().includes(query.toLowerCase()))
      ),
    [data.attendance, from, to, query]
  );

  const collected = filteredInvoices.reduce((sum, invoice) => sum + Number(invoice.paid || 0), 0);
  const outstanding = filteredInvoices.reduce((sum, invoice) => sum + Number(invoice.balance || 0), 0);
  const conversion = filteredLeads.length ? Math.round((filteredLeads.filter(lead => lead.stage === 'Enrolled').length / filteredLeads.length) * 100) : 0;
  const avgDocuments = filteredApplications.length
    ? Math.round(filteredApplications.reduce((sum, application) => sum + Number(application.documentProgress || 0), 0) / filteredApplications.length)
    : 0;

  const stageSummary = (data.dashboard?.stageDistribution || [])
    .map(item => ({ ...item, count: filteredLeads.filter(lead => lead.stage === item.stage).length }))
    .filter(item => item.count > 0);

  const departmentSummary = filteredAttendance.reduce((acc, item) => {
    const key = item.employee?.department || 'غير محدد';
    acc[key] = acc[key] || { total: 0, present: 0 };
    acc[key].total += 1;
    if (['Present', 'Remote'].includes(item.status)) acc[key].present += 1;
    return acc;
  }, {});

  const exportCsv = () => {
    const rows = [
      ['نوع السجل', 'الاسم', 'الوصف', 'الحالة', 'التاريخ'],
      ...filteredLeads.map(lead => ['عميل محتمل', lead.name, `${lead.program || ''} ${lead.country || ''}`.trim(), tr(lead.stage), formatDate(lead.updatedAt || lead.createdAt)]),
      ...filteredApplications.map(app => ['طلب قبول', app.student?.name || '', `${app.program || ''} - ${app.university || ''}`, tr(app.status), formatDate(app.updatedAt || app.createdAt)]),
      ...filteredInvoices.map(invoice => ['فاتورة', invoice.number, invoice.student?.name || '', tr(invoice.computedStatus), formatDate(invoice.createdAt)]),
      ...filteredAttendance.map(item => ['حضور', item.employee?.name || '', tr(item.employee?.department || ''), tr(item.status), formatDate(item.date)])
    ];

    const csv = rows.map(row => row.map(csvEscape).join(',')).join('\n');
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reports-${from}-to-${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setToast({ message: 'تم تجهيز ملف CSV للتقارير' });
  };

  const exportPdf = () => {
    const reportWindow = window.open('', '_blank', 'width=1200,height=900');
    if (!reportWindow) {
      setToast({ type: 'error', message: 'تعذر فتح نافذة الطباعة من المتصفح' });
      return;
    }

    reportWindow.document.write(`
      <html lang="ar" dir="rtl">
        <head>
          <title>تقرير EduGlobal</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; color: #111827; }
            h1, h2 { margin: 0 0 12px; }
            .summary { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin: 20px 0 28px; }
            .box { border: 1px solid #dbe1ea; border-radius: 12px; padding: 14px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { border: 1px solid #dbe1ea; padding: 10px; text-align: right; font-size: 12px; }
            th { background: #f4f6fb; }
          </style>
        </head>
        <body>
          <h1>تقرير EduGlobal CRM</h1>
          <p>الفترة من ${from} إلى ${to}</p>
          <div class="summary">
            <div class="box"><strong>العملاء المحتملون:</strong> ${filteredLeads.length}</div>
            <div class="box"><strong>الطلبات:</strong> ${filteredApplications.length}</div>
            <div class="box"><strong>المحصّل:</strong> ${formatMoney(collected)}</div>
            <div class="box"><strong>المتبقي:</strong> ${formatMoney(outstanding)}</div>
          </div>
          <h2>أحدث الفواتير</h2>
          <table>
            <thead>
              <tr>
                <th>الفاتورة</th>
                <th>الطالب</th>
                <th>الإجمالي</th>
                <th>المدفوع</th>
                <th>المتبقي</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              ${filteredInvoices.slice(0, 12).map(invoice => `
                <tr>
                  <td>${invoice.number}</td>
                  <td>${invoice.student?.name || ''}</td>
                  <td>${formatMoney(invoice.total, invoice.currency)}</td>
                  <td>${formatMoney(invoice.paid, invoice.currency)}</td>
                  <td>${formatMoney(invoice.balance, invoice.currency)}</td>
                  <td>${tr(invoice.computedStatus)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `);
    reportWindow.document.close();
    reportWindow.focus();
    reportWindow.print();
    setToast({ message: 'تم فتح نسخة الطباعة لحفظها PDF' });
  };

  if (loading) return <div className="loading-page"><Spinner />جارٍ تحميل التقارير...</div>;

  return (
    <>
      <Card className="reports-toolbar-card">
        <div className="reports-toolbar">
          <div className="search-box">
            <Search />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث داخل التقارير..." />
          </div>
          <div className="reports-filters">
            <label className="mini-field">
              <span>من</span>
              <input type="date" value={from} onChange={event => setFrom(event.target.value)} />
            </label>
            <label className="mini-field">
              <span>إلى</span>
              <input type="date" value={to} onChange={event => setTo(event.target.value)} />
            </label>
            <Button variant="secondary" type="button" onClick={exportCsv}><Download /> تصدير CSV</Button>
            <Button type="button" onClick={exportPdf}><FileText /> تصدير PDF</Button>
          </div>
        </div>
      </Card>

      <div className="kpi-grid reports-kpis">
        <Card className="kpi-card">
          <div className="kpi-icon"><BriefcaseBusiness /></div>
          <div className="kpi-meta">
            <span>العملاء المحتملون في الفترة</span>
            <strong>{filteredLeads.length}</strong>
            <small><ArrowUpRight /> {conversion}% معدل التحويل</small>
          </div>
        </Card>
        <Card className="kpi-card">
          <div className="kpi-icon"><FileCheck2 /></div>
          <div className="kpi-meta">
            <span>طلبات القبول</span>
            <strong>{filteredApplications.length}</strong>
            <small>{avgDocuments}% متوسط اكتمال المستندات</small>
          </div>
        </Card>
        <Card className="kpi-card">
          <div className="kpi-icon"><CircleDollarSign /></div>
          <div className="kpi-meta">
            <span>المبالغ المحصلة</span>
            <strong>{formatMoney(collected)}</strong>
            <small>{formatMoney(outstanding)} مستحق</small>
          </div>
        </Card>
        <Card className="kpi-card">
          <div className="kpi-icon"><UsersRound /></div>
          <div className="kpi-meta">
            <span>سجلات الحضور</span>
            <strong>{filteredAttendance.length}</strong>
            <small>ضمن الفترة المحددة</small>
          </div>
        </Card>
      </div>

      <div className="reports-grid">
        <Card className="report-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">المبيعات</p>
              <h2>مراحل المسار</h2>
            </div>
            <BarChart3 />
          </div>
          <div className="stage-list">
            {stageSummary.length ? stageSummary.map(item => (
              <div className="stage-row" key={item.stage}>
                <div>
                  <span>{tr(item.stage)}</span>
                  <strong>{item.count}</strong>
                </div>
                <Progress value={filteredLeads.length ? (item.count / filteredLeads.length) * 100 : 0} />
              </div>
            )) : <div className="document-empty compact-empty"><BriefcaseBusiness /><strong>لا توجد بيانات</strong><span>لم يتم العثور على مراحل ضمن هذا النطاق.</span></div>}
          </div>
        </Card>

        <Card className="report-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">الحضور</p>
              <h2>ملخص الأقسام</h2>
            </div>
            <CalendarDays />
          </div>
          <div className="stage-list">
            {Object.entries(departmentSummary).length ? Object.entries(departmentSummary).map(([department, stats]) => (
              <div className="stage-row" key={department}>
                <div>
                  <span>{tr(department)}</span>
                  <strong>{stats.present}/{stats.total}</strong>
                </div>
                <Progress value={stats.total ? (stats.present / stats.total) * 100 : 0} />
              </div>
            )) : <div className="document-empty compact-empty"><UsersRound /><strong>لا توجد سجلات حضور</strong><span>جرّب تغيير الفترة الزمنية أو البحث.</span></div>}
          </div>
        </Card>

        <Card className="report-card full-span">
          <div className="section-head">
            <div>
              <p className="eyebrow">المالية</p>
              <h2>أحدث الفواتير في الفترة</h2>
            </div>
            <WalletCards />
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الفاتورة</th>
                  <th>الطالب</th>
                  <th>الإجمالي</th>
                  <th>المدفوع</th>
                  <th>المتبقي</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.slice(0, 8).map(invoice => (
                  <tr key={invoice.id}>
                    <td><strong>{invoice.number}</strong><small>{formatDate(invoice.createdAt)}</small></td>
                    <td>{invoice.student?.name}</td>
                    <td>{formatMoney(invoice.total, invoice.currency)}</td>
                    <td>{formatMoney(invoice.paid, invoice.currency)}</td>
                    <td>{formatMoney(invoice.balance, invoice.currency)}</td>
                    <td><Badge tone={invoice.computedStatus === 'Paid' ? 'green' : invoice.computedStatus === 'Partial' ? 'amber' : 'red'}>{tr(invoice.computedStatus)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
