import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarCheck2,
  Clock3,
  Download,
  FileBadge2,
  FileSpreadsheet,
  Gift,
  MinusCircle,
  Plus,
  Search,
  Target,
  Trash2,
  UploadCloud,
  UserPlus,
  UserX2,
  UsersRound
} from 'lucide-react';
import { api, formatDate, formatMoney, initials } from '../api.js';
import { Badge, Button, Card, Field, Modal, Progress, Spinner, Toast } from '../components/UI.jsx';
import { useAuth } from '../auth.jsx';
import { tr } from '../i18n.js';
import { can } from '../permissions.js';

const today = '2026-07-22';

const attendanceBlank = {
  employeeId: '',
  date: today,
  checkIn: '09:00',
  checkOut: '17:00',
  status: 'Present',
  notes: ''
};

const employeeBlank = {
  name: '',
  email: '',
  phone: '',
  role: 'consultant',
  department: 'Consultancy',
  title: '',
  password: '',
  isActive: true,
  joinDate: today,
  performance: '75',
  branch: 'Cairo HQ',
  basicSalary: '18000',
  monthlyTarget: '8',
  commissionPerContract: '500',
  annualLeaveBalance: '21'
};

const leaveBlank = {
  employeeId: '',
  leaveType: 'Annual Leave',
  startDate: today,
  endDate: today,
  reason: ''
};

const documentTypes = ['Employment Contract', 'National ID', 'University Degree', 'Military Status'];
const statusFilters = [
  { key: 'all', label: 'الكل' },
  { key: 'active', label: 'النشطون' },
  { key: 'terminated', label: 'المقالون' }
];

const payrollToCsv = rows => {
  const header = ['Employee', 'Department', 'Basic Salary', 'Commissions', 'Bonuses', 'Deductions', 'Advances', 'Unpaid Leave Days', 'Absence Deduction', 'Net Salary'];
  const lines = rows.map(row => [
    row.employeeName,
    row.department,
    row.basicSalary,
    row.commissions,
    row.bonuses,
    row.deductions,
    row.advances,
    row.unpaidLeaveDays,
    row.absenceDeduction,
    row.netSalary
  ].join(','));
  return [header.join(','), ...lines].join('\n');
};

export default function HR() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [targets, setTargets] = useState([]);
  const [payroll, setPayroll] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [employeeOpen, setEmployeeOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [documentOpen, setDocumentOpen] = useState(false);
  const [attendanceForm, setAttendanceForm] = useState(attendanceBlank);
  const [employeeForm, setEmployeeForm] = useState(employeeBlank);
  const [leaveForm, setLeaveForm] = useState(leaveBlank);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [documentType, setDocumentType] = useState(documentTypes[0]);
  const [documentFile, setDocumentFile] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [submittingAction, setSubmittingAction] = useState(false);
  const [toast, setToast] = useState(null);

  const canCreateEmployee = can(user.role, 'createEmployee');
  const canLogAttendance = can(user.role, 'logAttendance');
  const canTerminateEmployee = can(user.role, 'terminateEmployee');
  const canDeleteEmployee = can(user.role, 'deleteEmployee');

  const load = () =>
    api('/api/hr')
      .then(data => {
        const nextEmployees = data.employees || [];
        setEmployees(nextEmployees);
        setAttendance(data.attendance || []);
        setTargets(data.targets || []);
        setPayroll(data.payroll || []);
        setLeaveRequests(data.leaveRequests || []);

        if (!selectedEmployeeId && nextEmployees[0]) {
          setSelectedEmployeeId(nextEmployees[0].id);
        } else if (selectedEmployeeId && !nextEmployees.some(employee => employee.id === selectedEmployeeId)) {
          setSelectedEmployeeId(nextEmployees[0]?.id || null);
        }
      })
      .catch(error => setToast({ type: 'error', message: error.message }))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const shown = useMemo(
    () =>
      employees.filter(employee => {
        const matchesSearch = [employee.name, employee.department, employee.title, employee.branch, employee.status]
          .some(value => String(value || '').toLowerCase().includes(query.toLowerCase()));

        const normalizedStatus = String(employee.status || '').toLowerCase();
        const matchesStatus =
          statusFilter === 'all' ||
          (statusFilter === 'active' && normalizedStatus === 'active') ||
          (statusFilter === 'terminated' && normalizedStatus === 'terminated');

        return matchesSearch && matchesStatus;
      }),
    [employees, query, statusFilter]
  );

  const selectedEmployee =
    shown.find(employee => employee.id === selectedEmployeeId) ||
    employees.find(employee => employee.id === selectedEmployeeId) ||
    null;

  const present = attendance.filter(item => item.date === today && ['Present', 'Remote'].includes(item.status)).length;
  const onLeave = attendance.filter(item => item.date === today && item.status === 'Leave').length;
  const targetAchievement = targets.length
    ? Math.round(targets.reduce((sum, item) => sum + Number(item.targetProgress || 0), 0) / targets.length)
    : 0;

  const submitAttendance = async event => {
    event.preventDefault();
    try {
      await api('/api/attendance', { method: 'POST', body: JSON.stringify(attendanceForm) });
      setAttendanceOpen(false);
      setAttendanceForm(attendanceBlank);
      await load();
      setToast({ message: 'تم حفظ سجل الحضور.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const createEmployee = async event => {
    event.preventDefault();
    try {
      const created = await api('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          name: employeeForm.name,
          email: employeeForm.email,
          role: employeeForm.role,
          department: employeeForm.department,
          password: employeeForm.password,
          isActive: employeeForm.isActive
        })
      });
      if (created.linkedEmployeeId) {
        await api(`/api/hr/employees/${created.linkedEmployeeId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            basicSalary: employeeForm.basicSalary,
            monthlyTarget: employeeForm.monthlyTarget,
            commissionPerContract: employeeForm.commissionPerContract,
            annualLeaveBalance: employeeForm.annualLeaveBalance
          })
        });
      }
      setEmployeeOpen(false);
      setEmployeeForm(employeeBlank);
      await load();
      setToast({ message: 'تم إنشاء الحساب وسجل الموارد البشرية بنجاح.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const saveHrConfig = async (employeeId, payload) => {
    try {
      await api(`/api/hr/employees/${employeeId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      await load();
      setToast({ message: 'تم تحديث إعدادات HR للموظف.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const submitLeave = async event => {
    event.preventDefault();
    try {
      await api('/api/hr/leave-requests', { method: 'POST', body: JSON.stringify(leaveForm) });
      setLeaveOpen(false);
      setLeaveForm(leaveBlank);
      await load();
      setToast({ message: 'تم تقديم طلب الإجازة.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const reviewLeave = async (requestId, status) => {
    try {
      await api(`/api/hr/leave-requests/${requestId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await load();
      setToast({ message: status === 'Approved' ? 'تم اعتماد طلب الإجازة.' : 'تم رفض طلب الإجازة.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const uploadEmployeeDocument = async event => {
    event.preventDefault();
    if (!selectedEmployee || !documentFile) return;
    try {
      const body = new FormData();
      body.append('file', documentFile);
      body.append('type', documentType);
      await api(`/api/hr/employees/${selectedEmployee.id}/documents`, { method: 'POST', body });
      setDocumentOpen(false);
      setDocumentFile(null);
      await load();
      setToast({ message: 'تم رفع مستند الموظف.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const openTerminateModal = employee => {
    setPendingAction({
      type: employee.status === 'Active' ? 'terminate' : 'reactivate',
      employee
    });
  };

  const openDeleteModal = employee => {
    setPendingAction({ type: 'delete', employee });
  };

  const closePendingAction = () => {
    if (submittingAction) return;
    setPendingAction(null);
  };

  const confirmPendingAction = async () => {
    if (!pendingAction?.employee) return;
    setSubmittingAction(true);
    try {
      if (pendingAction.type === 'delete') {
        await api(`/api/hr/employees/${pendingAction.employee.id}`, { method: 'DELETE' });
        await load();
        setToast({ message: 'تم حذف الموظف نهائياً.' });
      } else {
        await api(`/api/hr/employees/${pendingAction.employee.id}/lifecycle`, {
          method: 'PATCH',
          body: JSON.stringify({ action: pendingAction.type })
        });
        await load();
        setToast({ message: pendingAction.type === 'terminate' ? 'تم إنهاء خدمة الموظف.' : 'تمت إعادة تفعيل الموظف.' });
      }
      setPendingAction(null);
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    } finally {
      setSubmittingAction(false);
    }
  };

  const pendingActionCopy = useMemo(() => {
    if (!pendingAction?.employee) return null;
    if (pendingAction.type === 'delete') {
      return {
        title: 'حذف الموظف',
        subtitle: `سيتم حذف ${pendingAction.employee.name} نهائياً مع المستندات وسجلات الحضور والإجازات المرتبطة به.`,
        confirmLabel: 'تأكيد الحذف'
      };
    }
    if (pendingAction.type === 'terminate') {
      return {
        title: 'إقالة الموظف',
        subtitle: `سيتم إنهاء خدمة ${pendingAction.employee.name} مع الاحتفاظ بسجله داخل النظام.`,
        confirmLabel: 'تأكيد الإقالة'
      };
    }
    return {
      title: 'إعادة تفعيل الموظف',
      subtitle: `سيتم إعادة ${pendingAction.employee.name} إلى حالة نشط داخل النظام.`,
      confirmLabel: 'تأكيد التفعيل'
    };
  }, [pendingAction]);

  const exportPayrollCsv = () => {
    const blob = new Blob([payrollToCsv(payroll)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `payroll-${today.slice(0, 7)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportPayrollPdf = () => {
    const printWindow = window.open('', '_blank', 'width=1100,height=900');
    if (!printWindow) return;
    printWindow.document.write(`
      <html lang="ar" dir="rtl">
        <head>
          <title>Payroll ${today.slice(0, 7)}</title>
          <style>
            body{font-family:Arial,sans-serif;padding:24px}
            table{width:100%;border-collapse:collapse}
            th,td{border:1px solid #d9dfec;padding:8px;text-align:right;font-size:12px}
            th{background:#f4f6fb}
          </style>
        </head>
        <body>
          <h2>كشف مرتبات ${today.slice(0, 7)}</h2>
          <table>
            <thead>
              <tr>
                <th>الموظف</th>
                <th>الأساسي</th>
                <th>العمولات</th>
                <th>المكافآت</th>
                <th>الخصومات</th>
                <th>السلف</th>
                <th>خصم الغياب</th>
                <th>الصافي</th>
              </tr>
            </thead>
            <tbody>
              ${payroll.map(row => `
                <tr>
                  <td>${row.employeeName}</td>
                  <td>${row.basicSalary}</td>
                  <td>${row.commissions}</td>
                  <td>${row.bonuses}</td>
                  <td>${row.deductions}</td>
                  <td>${row.advances}</td>
                  <td>${row.absenceDeduction}</td>
                  <td>${row.netSalary}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  if (loading) return <div className="loading-page"><Spinner />جارٍ تحميل بيانات الموارد البشرية...</div>;

  return (
    <>
      <div className="kpi-grid hr-kpis">
        <Card className="kpi-card">
          <div className="kpi-icon"><UsersRound /></div>
          <div className="kpi-meta">
            <span>الموظفون النشطون</span>
            <strong>{employees.filter(employee => employee.status === 'Active').length}</strong>
            <small>عبر {new Set(employees.map(employee => employee.department)).size} أقسام</small>
          </div>
        </Card>
        <Card className="kpi-card">
          <div className="kpi-icon"><CalendarCheck2 /></div>
          <div className="kpi-meta">
            <span>الحاضرون اليوم</span>
            <strong>{present}</strong>
            <small>من سجلات يوم {today}</small>
          </div>
        </Card>
        <Card className="kpi-card">
          <div className="kpi-icon"><Target /></div>
          <div className="kpi-meta">
            <span>تحقق التارجت</span>
            <strong>{targetAchievement}%</strong>
            <small>متوسط تحقيق مستشاري التعليم للتارجت الشهري</small>
          </div>
        </Card>
        <Card className="kpi-card">
          <div className="kpi-icon"><Clock3 /></div>
          <div className="kpi-meta">
            <span>في إجازة</span>
            <strong>{onLeave}</strong>
            <small>ضمن سجل اليوم الحالي</small>
          </div>
        </Card>
      </div>

      <Card className="employee-directory">
        <div className="panel-toolbar">
          <div className="search-box">
            <Search />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث عن موظف..." />
          </div>
          <div className="toolbar-right">
            {canCreateEmployee && <Button variant="secondary" onClick={() => setEmployeeOpen(true)} type="button"><UserPlus /> موظف جديد</Button>}
            {canLogAttendance && <Button onClick={() => setAttendanceOpen(true)} type="button"><Plus /> تسجيل حضور</Button>}
          </div>
        </div>

        <div className="hr-filter-bar">
          {statusFilters.map(filter => (
            <button
              key={filter.key}
              type="button"
              className={statusFilter === filter.key ? 'filter-chip active' : 'filter-chip'}
              onClick={() => setStatusFilter(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="employee-grid">
          {shown.map(employee => {
            const targetRow = targets.find(item => item.employeeId === employee.id);
            return (
              <article
                className={`employee-card ${selectedEmployeeId === employee.id ? 'employee-card-active' : ''}`}
                key={employee.id}
                onClick={() => setSelectedEmployeeId(employee.id)}
              >
                <div className="employee-head">
                  <div className="avatar large soft">{initials(employee.name)}</div>
                  <Badge tone={employee.status === 'Active' ? 'green' : 'red'}>{tr(employee.status)}</Badge>
                </div>
                <h3>{employee.name}</h3>
                <p>{tr(employee.title)}</p>
                <span>{tr(employee.department)} · {employee.branch}</span>
                <div className="employee-stats">
                  <div><span>الحضور</span><strong>{employee.attendanceRate}%</strong><Progress value={employee.attendanceRate} /></div>
                  <div><span>تحقق التارجت</span><strong>{targetRow ? `${targetRow.targetProgress}%` : '—'}</strong><Progress value={targetRow?.targetProgress || 0} /></div>
                </div>
                <div className="employee-card-actions" onClick={event => event.stopPropagation()}>
                  <a href={`mailto:${employee.email}`}>تواصل</a>
                  {canTerminateEmployee && (
                    <button className="employee-card-action danger-text" type="button" onClick={() => openTerminateModal(employee)}>
                      <UserX2 size={14} />
                      {employee.status === 'Active' ? 'إقالة' : 'تفعيل'}
                    </button>
                  )}
                  {canDeleteEmployee && (
                    <button className="employee-card-action danger-text" type="button" onClick={() => openDeleteModal(employee)}>
                      <Trash2 size={14} />
                      حذف
                    </button>
                  )}
                </div>
                <footer><span>انضم في {formatDate(employee.joinDate)}</span></footer>
              </article>
            );
          })}
        </div>
      </Card>

      <div className="hr-ops-grid">
        <Card className="hr-panel-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">Targets & Commissions</p>
              <h2>التارجت والعمولات</h2>
            </div>
            <Target />
          </div>
          <div className="hr-target-list">
            {targets.map(item => (
              <div className="hr-target-row" key={item.employeeId}>
                <div>
                  <strong>{item.employeeName}</strong>
                  <span>{item.title}</span>
                  <small>{item.closedDeals} / {item.monthlyTarget || 0} عقود · {formatMoney(item.commissionDue, 'EGP')} عمولة</small>
                </div>
                <div className="hr-target-actions">
                  <Progress value={item.targetProgress} />
                  <div className="inline-actions">
                    <input defaultValue={item.monthlyTarget || 0} type="number" min="0" onBlur={event => saveHrConfig(item.employeeId, { monthlyTarget: event.target.value })} />
                    <input defaultValue={item.commissionPerContract || 0} type="number" min="0" onBlur={event => saveHrConfig(item.employeeId, { commissionPerContract: event.target.value })} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="hr-panel-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">Payroll</p>
              <h2>المرتبات والاستقطاعات</h2>
            </div>
            <div className="toolbar-right">
              <Button type="button" variant="secondary" onClick={exportPayrollCsv}><FileSpreadsheet /> Excel</Button>
              <Button type="button" onClick={exportPayrollPdf}><Download /> PDF</Button>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الموظف</th>
                  <th>الأساسي</th>
                  <th>العمولات</th>
                  <th>المكافآت</th>
                  <th>الخصومات</th>
                  <th>السلف</th>
                  <th>خصم الغياب</th>
                  <th>الصافي</th>
                </tr>
              </thead>
              <tbody>
                {payroll.map(row => (
                  <tr key={row.employeeId}>
                    <td><strong>{row.employeeName}</strong><small>{tr(row.department)}</small></td>
                    <td>{formatMoney(row.basicSalary, 'EGP')}</td>
                    <td>{formatMoney(row.commissions, 'EGP')}</td>
                    <td>{formatMoney(row.bonuses, 'EGP')}</td>
                    <td>{formatMoney(row.deductions, 'EGP')}</td>
                    <td>{formatMoney(row.advances, 'EGP')}</td>
                    <td>{formatMoney(row.absenceDeduction, 'EGP')}</td>
                    <td><strong>{formatMoney(row.netSalary, 'EGP')}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="hr-ops-grid">
        <Card className="hr-panel-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">Leave System</p>
              <h2>الإجازات والاستئذانات</h2>
            </div>
            <Button type="button" onClick={() => setLeaveOpen(true)}><Plus /> طلب إجازة</Button>
          </div>
          <div className="hr-leave-list">
            {leaveRequests.map(request => (
              <div className="hr-leave-row" key={request.id}>
                <div>
                  <strong>{request.employeeName}</strong>
                  <span>{request.leaveType} · {request.startDate} → {request.endDate}</span>
                  <small>{request.days} يوم · {request.reason || 'بدون ملاحظات'}</small>
                </div>
                <div className="table-actions">
                  <Badge tone={request.status === 'Approved' ? 'green' : request.status === 'Rejected' ? 'red' : 'amber'}>{tr(request.status)}</Badge>
                  {request.status === 'Pending' && (
                    <>
                      <Button type="button" variant="ghost" onClick={() => reviewLeave(request.id, 'Approved')}><Gift /> اعتماد</Button>
                      <Button type="button" variant="secondary" onClick={() => reviewLeave(request.id, 'Rejected')}><MinusCircle /> رفض</Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="hr-panel-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">Employee File</p>
              <h2>أرشيف مستندات الموظف</h2>
            </div>
            {selectedEmployee && <Button type="button" onClick={() => setDocumentOpen(true)}><UploadCloud /> رفع مستند</Button>}
          </div>
          {selectedEmployee ? (
            <>
              {(canTerminateEmployee || canDeleteEmployee) && (
                <div className="employee-detail-actions">
                  {canTerminateEmployee && (
                    <Button type="button" variant="secondary" onClick={() => openTerminateModal(selectedEmployee)}>
                      <UserX2 /> {selectedEmployee.status === 'Active' ? 'إقالة الموظف' : 'إعادة التفعيل'}
                    </Button>
                  )}
                  {canDeleteEmployee && (
                    <Button type="button" variant="secondary" onClick={() => openDeleteModal(selectedEmployee)}>
                      <Trash2 /> حذف نهائي
                    </Button>
                  )}
                </div>
              )}
              <div className="detail-grid">
                <div><span>الموظف</span><strong>{selectedEmployee.name}</strong></div>
                <div><span>الرصيد السنوي</span><strong>{selectedEmployee.annualLeaveBalance || 0} يوم</strong></div>
                <div><span>الراتب الأساسي</span><strong>{formatMoney(selectedEmployee.basicSalary || 0, 'EGP')}</strong></div>
                <div><span>القسم</span><strong>{tr(selectedEmployee.department)}</strong></div>
              </div>
              <div className="document-grid">
                {(selectedEmployee.documents || []).map(doc => (
                  <article className="document-card" key={doc.id}>
                    <div className="doc-icon"><FileBadge2 /></div>
                    <div>
                      <strong>{doc.type}</strong>
                      <span>{doc.originalName}</span>
                      <small>{formatDate(doc.uploadedAt)} · {doc.uploadedBy}</small>
                    </div>
                    <div className="document-actions">
                      <a target="_blank" rel="noreferrer" href={doc.url}>فتح</a>
                    </div>
                  </article>
                ))}
                {!(selectedEmployee.documents || []).length && (
                  <div className="document-empty compact-empty">
                    <FileBadge2 />
                    <strong>لا توجد مستندات مرفوعة</strong>
                    <span>ارفع عقد العمل أو البطاقة أو الشهادة الجامعية أو الموقف من التجنيد.</span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="document-empty compact-empty">
              <UsersRound />
              <strong>اختر موظفًا</strong>
              <span>اختر بطاقة موظف لعرض ملفه الرقمي ومستنداته.</span>
            </div>
          )}
        </Card>
      </div>

      <Card className="attendance-table">
        <div className="section-head">
          <div>
            <p className="eyebrow">تشغيل يومي</p>
            <h2>سجل الحضور</h2>
          </div>
          <CalendarCheck2 />
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>الموظف</th>
                <th>التاريخ</th>
                <th>الحضور</th>
                <th>الانصراف</th>
                <th>الحالة</th>
                <th>ملاحظات</th>
              </tr>
            </thead>
            <tbody>
              {attendance.slice(0, 20).map(item => (
                <tr key={item.id}>
                  <td><strong>{item.employee?.name}</strong><small>{tr(item.employee?.department)}</small></td>
                  <td>{formatDate(item.date)}</td>
                  <td>{item.checkIn || '—'}</td>
                  <td>{item.checkOut || '—'}</td>
                  <td><Badge tone={item.status === 'Leave' ? 'amber' : item.status === 'Absent' ? 'red' : item.status === 'Remote' ? 'blue' : 'green'}>{tr(item.status)}</Badge></td>
                  <td>{item.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={attendanceOpen} onClose={() => setAttendanceOpen(false)} title="تسجيل حضور موظف">
        <form className="form-grid" onSubmit={submitAttendance}>
          <Field label="الموظف" className="field-full">
            <select required value={attendanceForm.employeeId} onChange={event => setAttendanceForm({ ...attendanceForm, employeeId: event.target.value })}>
              <option value="">اختر الموظف</option>
              {employees.map(employee => <option value={employee.id} key={employee.id}>{employee.name}</option>)}
            </select>
          </Field>
          <Field label="التاريخ"><input type="date" value={attendanceForm.date} onChange={event => setAttendanceForm({ ...attendanceForm, date: event.target.value })} /></Field>
          <Field label="الحالة">
            <select value={attendanceForm.status} onChange={event => setAttendanceForm({ ...attendanceForm, status: event.target.value })}>
              <option value="Present">حاضر</option>
              <option value="Remote">عن بُعد</option>
              <option value="Leave">إجازة</option>
              <option value="Absent">غائب</option>
            </select>
          </Field>
          <Field label="وقت الحضور"><input type="time" value={attendanceForm.checkIn} onChange={event => setAttendanceForm({ ...attendanceForm, checkIn: event.target.value })} /></Field>
          <Field label="وقت الانصراف"><input type="time" value={attendanceForm.checkOut} onChange={event => setAttendanceForm({ ...attendanceForm, checkOut: event.target.value })} /></Field>
          <Field label="ملاحظات" className="field-full"><textarea value={attendanceForm.notes} onChange={event => setAttendanceForm({ ...attendanceForm, notes: event.target.value })} /></Field>
          <div className="form-actions field-full">
            <Button type="button" variant="secondary" onClick={() => setAttendanceOpen(false)}>إلغاء</Button>
            <Button type="submit">حفظ السجل</Button>
          </div>
        </form>
      </Modal>

      <Modal open={employeeOpen} onClose={() => setEmployeeOpen(false)} title="إضافة موظف جديد" subtitle="إنشاء سجل موظف جديد داخل النظام" size="lg">
        <form className="form-grid" onSubmit={createEmployee}>
          <Field label="الاسم"><input required value={employeeForm.name} onChange={event => setEmployeeForm({ ...employeeForm, name: event.target.value })} /></Field>
          <Field label="البريد الإلكتروني"><input type="email" value={employeeForm.email} onChange={event => setEmployeeForm({ ...employeeForm, email: event.target.value })} /></Field>
          <Field label="رقم الهاتف"><input value={employeeForm.phone} onChange={event => setEmployeeForm({ ...employeeForm, phone: event.target.value })} /></Field>
          <Field label="الدور">
            <select value={employeeForm.role} onChange={event => setEmployeeForm({ ...employeeForm, role: event.target.value })}>
              <option value="management">الإدارة</option>
              <option value="consultant">مستشار</option>
              <option value="admissions">القبول</option>
              <option value="reception">الاستقبال</option>
              <option value="hr">الموارد البشرية</option>
              <option value="finance">المالية</option>
            </select>
          </Field>
          <Field label="القسم">
            <select value={employeeForm.department} onChange={event => setEmployeeForm({ ...employeeForm, department: event.target.value })}>
              {['Consultancy', 'Admissions', 'Reception', 'Human Resources', 'Finance'].map(option => <option key={option} value={option}>{tr(option)}</option>)}
            </select>
          </Field>
          <Field label="المسمى الوظيفي"><input required value={employeeForm.title} onChange={event => setEmployeeForm({ ...employeeForm, title: event.target.value })} /></Field>
          <Field label="الفرع"><input value={employeeForm.branch} onChange={event => setEmployeeForm({ ...employeeForm, branch: event.target.value })} /></Field>
          <Field label="كلمة المرور"><input required minLength="6" type="password" value={employeeForm.password} onChange={event => setEmployeeForm({ ...employeeForm, password: event.target.value })} /></Field>
          <Field label="تاريخ الانضمام"><input type="date" value={employeeForm.joinDate} onChange={event => setEmployeeForm({ ...employeeForm, joinDate: event.target.value })} /></Field>
          <Field label="الراتب الأساسي"><input min="0" type="number" value={employeeForm.basicSalary} onChange={event => setEmployeeForm({ ...employeeForm, basicSalary: event.target.value })} /></Field>
          <Field label="التارجت الشهري"><input min="0" type="number" value={employeeForm.monthlyTarget} onChange={event => setEmployeeForm({ ...employeeForm, monthlyTarget: event.target.value })} /></Field>
          <Field label="العمولة لكل عقد"><input min="0" type="number" value={employeeForm.commissionPerContract} onChange={event => setEmployeeForm({ ...employeeForm, commissionPerContract: event.target.value })} /></Field>
          <Field label="رصيد الإجازات السنوي"><input min="0" type="number" value={employeeForm.annualLeaveBalance} onChange={event => setEmployeeForm({ ...employeeForm, annualLeaveBalance: event.target.value })} /></Field>
          <Field label="الأداء المبدئي"><input min="0" max="100" type="number" value={employeeForm.performance} onChange={event => setEmployeeForm({ ...employeeForm, performance: event.target.value })} /></Field>
          <label className="required-toggle field-full">
            <input type="checkbox" checked={employeeForm.isActive} onChange={event => setEmployeeForm({ ...employeeForm, isActive: event.target.checked })} />
            <span>الحساب مفعل ويمكنه تسجيل الدخول</span>
          </label>
          <div className="form-actions field-full">
            <Button type="button" variant="secondary" onClick={() => setEmployeeOpen(false)}>إلغاء</Button>
            <Button type="submit">إضافة الموظف</Button>
          </div>
        </form>
      </Modal>

      <Modal open={leaveOpen} onClose={() => setLeaveOpen(false)} title="طلب إجازة / استئذان">
        <form className="form-grid" onSubmit={submitLeave}>
          <Field label="الموظف" className="field-full">
            <select required value={leaveForm.employeeId} onChange={event => setLeaveForm({ ...leaveForm, employeeId: event.target.value })}>
              <option value="">اختر الموظف</option>
              {employees.map(employee => <option value={employee.id} key={employee.id}>{employee.name}</option>)}
            </select>
          </Field>
          <Field label="نوع الطلب">
            <select value={leaveForm.leaveType} onChange={event => setLeaveForm({ ...leaveForm, leaveType: event.target.value })}>
              <option value="Annual Leave">إجازة سنوية</option>
              <option value="Permission">استئذان</option>
              <option value="Unpaid Leave">إجازة بدون أجر</option>
            </select>
          </Field>
          <Field label="من"><input type="date" value={leaveForm.startDate} onChange={event => setLeaveForm({ ...leaveForm, startDate: event.target.value })} /></Field>
          <Field label="إلى"><input type="date" value={leaveForm.endDate} onChange={event => setLeaveForm({ ...leaveForm, endDate: event.target.value })} /></Field>
          <Field label="السبب" className="field-full"><textarea value={leaveForm.reason} onChange={event => setLeaveForm({ ...leaveForm, reason: event.target.value })} /></Field>
          <div className="form-actions field-full">
            <Button type="button" variant="secondary" onClick={() => setLeaveOpen(false)}>إلغاء</Button>
            <Button type="submit">إرسال الطلب</Button>
          </div>
        </form>
      </Modal>

      <Modal open={documentOpen} onClose={() => setDocumentOpen(false)} title="رفع مستند موظف" subtitle={selectedEmployee?.name || ''}>
        <form className="stack-form" onSubmit={uploadEmployeeDocument}>
          <Field label="نوع المستند">
            <select value={documentType} onChange={event => setDocumentType(event.target.value)}>
              {documentTypes.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </Field>
          <Field label="الملف">
            <input required type="file" onChange={event => setDocumentFile(event.target.files?.[0] || null)} />
          </Field>
          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={() => setDocumentOpen(false)}>إلغاء</Button>
            <Button type="submit">رفع المستند</Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(pendingActionCopy)} onClose={closePendingAction} title={pendingActionCopy?.title || ''} subtitle={pendingActionCopy?.subtitle || ''}>
        <div className="confirm-dialog">
          <div className="confirm-dialog-icon">
            <AlertTriangle />
          </div>
          <p>سيتم تنفيذ هذا الإجراء فورًا بعد التأكيد.</p>
          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={closePendingAction} disabled={submittingAction}>إلغاء</Button>
            <Button type="button" onClick={confirmPendingAction} disabled={submittingAction}>
              {submittingAction ? 'جارٍ التنفيذ...' : pendingActionCopy?.confirmLabel}
            </Button>
          </div>
        </div>
      </Modal>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
