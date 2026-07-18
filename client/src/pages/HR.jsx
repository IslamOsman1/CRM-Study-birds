import React, { useEffect, useMemo, useState } from 'react';
import { CalendarCheck2, Clock3, Plus, Search, Star, UserPlus, UsersRound } from 'lucide-react';
import { api, formatDate, initials } from '../api.js';
import { Badge, Button, Card, Field, Modal, Progress, Spinner, Toast } from '../components/UI.jsx';
import { useAuth } from '../auth.jsx';
import { tr } from '../i18n.js';
import { can } from '../permissions.js';

const attendanceBlank = {
  employeeId: '',
  date: '2026-07-17',
  checkIn: '09:00',
  checkOut: '17:00',
  status: 'Present',
  notes: ''
};

const employeeBlank = {
  name: '',
  email: '',
  phone: '',
  department: 'Consultancy',
  title: '',
  joinDate: '2026-07-17',
  performance: '75',
  branch: 'Cairo HQ'
};

export default function HR() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [employeeOpen, setEmployeeOpen] = useState(false);
  const [attendanceForm, setAttendanceForm] = useState(attendanceBlank);
  const [employeeForm, setEmployeeForm] = useState(employeeBlank);
  const [toast, setToast] = useState(null);

  const canCreateEmployee = can(user.role, 'createEmployee');
  const canLogAttendance = can(user.role, 'logAttendance');

  const load = () =>
    Promise.all([api('/api/employees'), api('/api/attendance')])
      .then(([employeeData, attendanceData]) => {
        setEmployees(employeeData);
        setAttendance(attendanceData);
      })
      .catch(error => setToast({ type: 'error', message: error.message }))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const shown = useMemo(
    () => employees.filter(employee => [employee.name, employee.department, employee.title, employee.branch].some(value => String(value || '').toLowerCase().includes(query.toLowerCase()))),
    [employees, query]
  );

  const submitAttendance = async event => {
    event.preventDefault();
    try {
      await api('/api/attendance', { method: 'POST', body: JSON.stringify(attendanceForm) });
      setAttendanceOpen(false);
      setAttendanceForm(attendanceBlank);
      await load();
      setToast({ message: 'تم حفظ سجل الحضور' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  const createEmployee = async event => {
    event.preventDefault();
    try {
      await api('/api/employees', { method: 'POST', body: JSON.stringify(employeeForm) });
      setEmployeeOpen(false);
      setEmployeeForm(employeeBlank);
      await load();
      setToast({ message: 'تمت إضافة الموظف بنجاح' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  };

  if (loading) return <div className="loading-page"><Spinner />جارٍ تحميل بيانات الموظفين...</div>;

  const present = attendance.filter(item => ['Present', 'Remote'].includes(item.status)).length;

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
            <small>{Math.round((present / Math.max(attendance.length, 1)) * 100)}% معدل حضور</small>
          </div>
        </Card>
        <Card className="kpi-card">
          <div className="kpi-icon"><Star /></div>
          <div className="kpi-meta">
            <span>متوسط الأداء</span>
            <strong>{employees.length ? Math.round(employees.reduce((sum, employee) => sum + employee.performance, 0) / employees.length) : 0}%</strong>
            <small>بناءً على مؤشرات الأداء الداخلية</small>
          </div>
        </Card>
        <Card className="kpi-card">
          <div className="kpi-icon"><Clock3 /></div>
          <div className="kpi-meta">
            <span>في إجازة</span>
            <strong>{attendance.filter(item => item.status === 'Leave').length}</strong>
            <small>ضمن سجلات اليوم</small>
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

        <div className="employee-grid">
          {shown.map(employee => (
            <article className="employee-card" key={employee.id}>
              <div className="employee-head">
                <div className="avatar large soft">{initials(employee.name)}</div>
                <Badge tone="green">{tr(employee.status)}</Badge>
              </div>
              <h3>{employee.name}</h3>
              <p>{tr(employee.title)}</p>
              <span>{tr(employee.department)} · {employee.branch}</span>
              <div className="employee-stats">
                <div><span>الحضور</span><strong>{employee.attendanceRate}%</strong><Progress value={employee.attendanceRate} /></div>
                <div><span>الأداء</span><strong>{employee.performance}%</strong><Progress value={employee.performance} /></div>
              </div>
              <footer><span>انضم في {formatDate(employee.joinDate)}</span><a href={`mailto:${employee.email}`}>تواصل</a></footer>
            </article>
          ))}
        </div>
      </Card>

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
              {attendance.slice(0, 15).map(item => (
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
          <Field label="القسم">
            <select value={employeeForm.department} onChange={event => setEmployeeForm({ ...employeeForm, department: event.target.value })}>
              <option value="Consultancy">الاستشارات</option>
              <option value="Admissions">القبول والتسجيل</option>
              <option value="Reception">الاستقبال</option>
              <option value="Human Resources">الموارد البشرية</option>
              <option value="Finance">المالية</option>
            </select>
          </Field>
          <Field label="المسمى الوظيفي"><input required value={employeeForm.title} onChange={event => setEmployeeForm({ ...employeeForm, title: event.target.value })} /></Field>
          <Field label="الفرع"><input value={employeeForm.branch} onChange={event => setEmployeeForm({ ...employeeForm, branch: event.target.value })} /></Field>
          <Field label="تاريخ الانضمام"><input type="date" value={employeeForm.joinDate} onChange={event => setEmployeeForm({ ...employeeForm, joinDate: event.target.value })} /></Field>
          <Field label="الأداء المبدئي"><input min="0" max="100" type="number" value={employeeForm.performance} onChange={event => setEmployeeForm({ ...employeeForm, performance: event.target.value })} /></Field>
          <div className="form-actions field-full">
            <Button type="button" variant="secondary" onClick={() => setEmployeeOpen(false)}>إلغاء</Button>
            <Button type="submit">إضافة الموظف</Button>
          </div>
        </form>
      </Modal>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
